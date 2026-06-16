import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show FileOptions;
import 'package:url_launcher/url_launcher.dart';

import '../data/member_repository.dart';
import '../data/project_files_repository.dart';
import '../data/project_repository.dart';
import '../data/transaction_repository.dart';
import '../main.dart';
import '../models/member.dart';
import '../models/project.dart';
import '../models/transaction.dart';
import '../theme/app_theme.dart';
import '../widgets/add_member_sheet.dart';
import '../widgets/member_row.dart' show colorForName;
import '../widgets/project_card.dart' show formatMoney;

class ProjectDetailScreen extends StatefulWidget {
  final Project project;
  final bool? quickAddIncome;

  const ProjectDetailScreen({super.key, required this.project, this.quickAddIncome});

  @override
  State<ProjectDetailScreen> createState() => _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends State<ProjectDetailScreen> with SingleTickerProviderStateMixin {
  final _txRepo = TransactionRepository();
  final _memberRepo = MemberRepository();
  final _projectRepo = ProjectRepository();
  final _filesRepo = ProjectFilesRepository();
  final _dateFmt = DateFormat('dd MMM yyyy');

  late Project _project;
  List<ProjectTransaction> _txs = [];
  List<ObMember> _members = [];
  List<ProjectFile> _files = [];
  bool _loading = true;
  bool _filesLoading = false;
  String _txFilter = 'all';

  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _project = widget.project;
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(() {
      if (_tabController.index == 2 && _files.isEmpty && !_filesLoading) {
        _loadFiles();
      }
    });
    _load();
    if (widget.quickAddIncome != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _openAddTransaction(isIncome: widget.quickAddIncome!);
      });
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _pickAndUploadImage() async {
    try {
      final picker = ImagePicker();
      final file = await picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
      if (file == null) return;
      final bytes = await file.readAsBytes();
      final path = '${_project.id}/cover.jpg';
      await supabase.storage.from('project-images').uploadBinary(
        path,
        bytes,
        fileOptions: FileOptions(contentType: 'image/jpeg', upsert: true),
      );
      final ts = DateTime.now().millisecondsSinceEpoch;
      final publicUrl = '${supabase.storage.from('project-images').getPublicUrl(path)}?t=$ts';
      await _projectRepo.updateImage(_project.id, publicUrl);
      if (!mounted) return;
      setState(() {
        _project = _project.copyWith(imageUrl: publicUrl);
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Rasm yuklandi')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Xato: $e')));
    }
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        _txRepo.loadForProject(_project.id),
        _memberRepo.loadForProject(_project.id),
        _projectRepo.loadProjectById(_project.id),
      ]);
      if (!mounted) return;
      setState(() {
        _txs = results[0] as List<ProjectTransaction>;
        _members = results[1] as List<ObMember>;
        final refreshed = results[2] as Project?;
        if (refreshed != null) _project = refreshed;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadFiles() async {
    setState(() => _filesLoading = true);
    try {
      final files = await _filesRepo.listFiles(_project.id);
      if (!mounted) return;
      setState(() {
        _files = files;
        _filesLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _filesLoading = false);
    }
  }

  List<ObMember> get _visibleMembers {
    final userId = supabase.auth.currentUser?.id;
    if (_project.role == 'owner') {
      return _members.where((m) => m.role == 'member').toList();
    }
    return _members.where((m) => m.addedBy == userId).toList();
  }

  List<ProjectTransaction> get _filteredTxs {
    final userId = supabase.auth.currentUser?.id;
    List<ProjectTransaction> base;
    if (_project.role == 'owner') {
      base = _txs.where((tx) =>
        tx.tur == 'income' ||
        ((tx.tur == 'send' || tx.tur == 'spend' || tx.tur == 'ishhaqi') && tx.fromUser == userId)
      ).toList();
    } else {
      base = _txs.where((tx) => tx.fromUser == userId || tx.toUser == userId).toList();
    }
    switch (_txFilter) {
      case 'income': return base.where((tx) => tx.tur == 'income').toList();
      case 'expense': return base.where((tx) => tx.tur != 'income').toList();
      default: return base;
    }
  }

  Future<void> _openAddTransaction({required bool isIncome}) async {
    final amountCtrl = TextEditingController();
    final noteCtrl = TextEditingController();
    String? selectedCategory = isIncome ? 'Kirim' : 'Boshqa';
    String? selectedToUserId;
    final categories = ['Mehnat haqi', 'Materiallar', 'Transport', 'Asbob-uskuna', 'Kommunal', 'Boshqa'];
    final workers = _visibleMembers;

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(builder: (ctx, setSt) => Padding(
        padding: EdgeInsets.only(left: 20, right: 20, top: 24, bottom: 24 + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(color: (isIncome ? AppColors.green : AppColors.red).withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                child: Icon(isIncome ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded,
                  color: isIncome ? AppColors.green : AppColors.red, size: 18),
              ),
              const SizedBox(width: 10),
              Text(isIncome ? "Kirim qo'shish" : "Chiqim qo'shish",
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
            ]),
            const SizedBox(height: 16),
            TextField(controller: amountCtrl, keyboardType: TextInputType.number, autofocus: true,
              decoration: const InputDecoration(hintText: "Summa (so'm)", prefixIcon: Icon(Icons.monetization_on_outlined, size: 18))),
            const SizedBox(height: 12),
            if (!isIncome) ...[
              DropdownButtonFormField<String>(
                value: selectedCategory,
                decoration: const InputDecoration(labelText: 'Kategoriya'),
                items: categories.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                onChanged: (v) => setSt(() => selectedCategory = v),
              ),
              const SizedBox(height: 12),
              if (workers.isNotEmpty) ...[
                DropdownButtonFormField<String>(
                  value: selectedToUserId,
                  decoration: const InputDecoration(labelText: "Kimga (ixtiyoriy)"),
                  hint: const Text("Ishchi tanlang"),
                  items: [
                    const DropdownMenuItem<String>(value: null, child: Text('— Tanlang —')),
                    ...workers.map((w) => DropdownMenuItem(value: w.userId, child: Text(w.displayName))),
                  ],
                  onChanged: (v) => setSt(() => selectedToUserId = v),
                ),
                const SizedBox(height: 12),
              ],
            ],
            TextField(controller: noteCtrl, decoration: const InputDecoration(hintText: 'Izoh (ixtiyoriy)')),
            const SizedBox(height: 20),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: isIncome ? AppColors.green : AppColors.red),
              onPressed: () { if (amountCtrl.text.trim().isEmpty) return; Navigator.of(ctx).pop(true); },
              child: Text(isIncome ? "Kirim qo'shish" : "Chiqim qo'shish"),
            ),
          ],
        ),
      )),
    );

    if (confirmed == true) {
      final amount = num.tryParse(amountCtrl.text.trim().replaceAll(' ', '')) ?? 0;
      if (amount <= 0) return;
      await _txRepo.addTransaction(
        obId: _project.id, isIncome: isIncome, amount: amount,
        kategoriya: isIncome ? 'Kirim' : (selectedCategory ?? 'Boshqa'),
        izoh: noteCtrl.text.trim().isNotEmpty ? noteCtrl.text.trim() : null,
        toUserId: isIncome ? null : selectedToUserId,
      );
      _load();
    }
    amountCtrl.dispose(); noteCtrl.dispose();
  }

  Future<void> _openEditProject() async {
    final nameCtrl = TextEditingController(text: _project.nomi);
    final daysCtrl = TextEditingController(text: _project.muddat.toString());
    final manzilCtrl = TextEditingController(text: _project.manzil ?? '');
    final mijozCtrl = TextEditingController(text: _project.mijoz ?? '');
    DateTime startDate = _project.boshlanish ?? DateTime.now();

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(builder: (ctx, setSt) => Padding(
        padding: EdgeInsets.only(left: 20, right: 20, top: 24, bottom: 24 + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              const Expanded(child: Text('Loyihani tahrirlash', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17))),
              IconButton(
                icon: const Icon(Icons.camera_alt_outlined, color: AppColors.accent),
                tooltip: 'Rasm yuklash',
                onPressed: () async {
                  Navigator.of(ctx).pop();
                  await _pickAndUploadImage();
                },
              ),
            ]),
            const SizedBox(height: 12),
            TextField(controller: nameCtrl, autofocus: true, decoration: const InputDecoration(hintText: 'Loyiha nomi *', labelText: 'Nom')),
            const SizedBox(height: 12),
            InkWell(
              onTap: () async {
                final picked = await showDatePicker(context: ctx, initialDate: startDate, firstDate: DateTime(2020), lastDate: DateTime(2100));
                if (picked != null) setSt(() => startDate = picked);
              },
              child: InputDecorator(
                decoration: const InputDecoration(labelText: 'Boshlanish sanasi', prefixIcon: Icon(Icons.calendar_today_rounded, size: 18)),
                child: Text(DateFormat('dd.MM.yyyy').format(startDate)),
              ),
            ),
            const SizedBox(height: 12),
            TextField(controller: daysCtrl, keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Muddat (kun)', prefixIcon: Icon(Icons.timer_outlined, size: 18))),
            const SizedBox(height: 12),
            TextField(controller: manzilCtrl, decoration: const InputDecoration(labelText: 'Manzil', prefixIcon: Icon(Icons.location_on_outlined, size: 18))),
            const SizedBox(height: 12),
            TextField(controller: mijozCtrl, decoration: const InputDecoration(labelText: 'Mijoz', prefixIcon: Icon(Icons.person_outline_rounded, size: 18))),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () { if (nameCtrl.text.trim().isEmpty) return; Navigator.of(ctx).pop(true); },
              child: const Text('Saqlash'),
            ),
          ],
        ),
      )),
    );

    if (saved == true) {
      await _projectRepo.updateProject(
        id: _project.id,
        nomi: nameCtrl.text.trim(),
        boshlanish: startDate,
        muddat: int.tryParse(daysCtrl.text.trim()) ?? _project.muddat,
        manzil: manzilCtrl.text.trim(),
        mijoz: mijozCtrl.text.trim(),
        bosqich: _project.bosqich,
      );
      _load();
    }
    nameCtrl.dispose(); daysCtrl.dispose(); manzilCtrl.dispose(); mijozCtrl.dispose();
  }

  void _openWorkerProfile(ObMember m) {
    final color = colorForName(m.displayName);
    final initials = m.displayName.trim().isEmpty ? '?' : m.displayName.trim()[0].toUpperCase();
    final balance = m.ishaqi - m.olingan;

    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Avatar
              CircleAvatar(
                radius: 32,
                backgroundColor: color.withOpacity(0.15),
                child: Text(initials, style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: color)),
              ),
              const SizedBox(height: 12),
              Text(m.displayName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              if (m.kasb != null && m.kasb!.isNotEmpty)
                Text(m.kasb!, style: const TextStyle(fontSize: 13, color: AppColors.muted)),
              if (m.profile?.phone.isNotEmpty == true) ...[
                const SizedBox(height: 4),
                Text(m.profile!.phone, style: const TextStyle(fontSize: 13, color: AppColors.accent)),
              ],
              const SizedBox(height: 20),
              Container(
                decoration: BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.circular(14)),
                child: Column(children: [
                  _WorkerInfoRow(label: 'Maosh', value: '${formatMoney(m.ishaqi)} so\'m', color: AppColors.text),
                  const Divider(color: AppColors.border, height: 1, indent: 14),
                  _WorkerInfoRow(label: 'Olingan', value: '${formatMoney(m.olingan)} so\'m', color: AppColors.green),
                  const Divider(color: AppColors.border, height: 1, indent: 14),
                  _WorkerInfoRow(
                    label: 'Qarzdor',
                    value: '${formatMoney(balance)} so\'m',
                    color: balance > 0 ? AppColors.orange : AppColors.muted,
                  ),
                ]),
              ),
              const SizedBox(height: 16),
              if (_project.role == 'owner')
                Row(children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(foregroundColor: AppColors.red, side: const BorderSide(color: AppColors.red)),
                      icon: const Icon(Icons.person_remove_outlined, size: 16),
                      label: const Text("O'chirish"),
                      onPressed: () async {
                        Navigator.of(ctx).pop();
                        final confirm = await showDialog<bool>(
                          context: context,
                          builder: (d) => AlertDialog(
                            title: const Text("Ishchini o'chirish"),
                            content: Text("${m.displayName} loyihadan olib tashlansinmi?"),
                            actions: [
                              TextButton(onPressed: () => Navigator.of(d).pop(false), child: const Text('Bekor')),
                              ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: AppColors.red), onPressed: () => Navigator.of(d).pop(true), child: const Text("O'chirish")),
                            ],
                          ),
                        );
                        if (confirm == true) {
                          await _memberRepo.removeMember(obId: _project.id, userId: m.userId);
                          _load();
                        }
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(backgroundColor: AppColors.accent),
                      icon: const Icon(Icons.payments_outlined, size: 16),
                      label: const Text('To\'lash'),
                      onPressed: () {
                        Navigator.of(ctx).pop();
                        _openAddTransaction(isIncome: false);
                      },
                    ),
                  ),
                ]),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openAddMember() async {
    final phoneCtrl = TextEditingController();
    final kasbCtrl = TextEditingController();

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 20, right: 20, top: 24, bottom: 24 + MediaQuery.of(ctx).viewInsets.bottom),
        child: AddMemberSheet(phoneCtrl: phoneCtrl, kasbCtrl: kasbCtrl),
      ),
    );

    if (confirmed == true) {
      try {
        await _memberRepo.addMember(obId: _project.id, phone: phoneCtrl.text.trim(), kasb: kasbCtrl.text.trim());
        _load();
      } catch (e) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }
    phoneCtrl.dispose(); kasbCtrl.dispose();
  }

  Future<void> _deleteTransaction(ProjectTransaction tx) async {
    try {
      await _txRepo.deleteTransaction(tx.id);
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _uploadFile() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf', 'xls', 'xlsx', 'csv', 'doc', 'docx'],
        withData: true,
      );
      if (result == null || result.files.isEmpty) return;
      final pf = result.files.first;
      if (pf.bytes == null) return;

      final ext = pf.extension?.toLowerCase() ?? '';
      final mimeMap = {
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
        'pdf': 'application/pdf',
        'xls': 'application/vnd.ms-excel', 'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'csv': 'text/csv', 'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
      final mime = mimeMap[ext] ?? 'application/octet-stream';
      final name = pf.name;

      setState(() => _filesLoading = true);
      await _filesRepo.uploadFile(_project.id, name, pf.bytes!, mime);
      await _loadFiles();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Fayl yuklandi')));
    } catch (e) {
      if (mounted) {
        setState(() => _filesLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Xato: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final project = _project;
    final (_, left, progress) = project.schedule;
    final isDone = project.status == 'done';
    final startFmt = project.boshlanish != null ? _dateFmt.format(project.boshlanish!) : '—';
    final endDate = project.boshlanish != null ? project.boshlanish!.add(Duration(days: project.muddat)) : null;
    final endFmt = endDate != null ? _dateFmt.format(endDate) : '—';

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Text(project.nomi, style: const TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          if (_loading) const Padding(padding: EdgeInsets.symmetric(horizontal: 16), child: Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)))),
          if (_project.role == 'owner') ...[
            IconButton(
              icon: const Icon(Icons.edit_outlined, size: 20),
              tooltip: 'Tahrirlash',
              onPressed: _openEditProject,
            ),
          ],
          PopupMenuButton<String>(
            onSelected: (action) async {
              if (action == 'toggleDone') {
                await _projectRepo.setStatus(project.id, isDone ? 'active' : 'done');
                _load();
              } else if (action == 'duplicate') {
                await _projectRepo.createProject(
                  nomi: '${project.nomi} (nusxa)',
                  muddat: project.muddat,
                  manzil: project.manzil,
                  mijoz: project.mijoz,
                  boshlanish: DateTime.now(),
                );
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Nusxa yaratildi')));
              } else if (action == 'delete') {
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text("O'chirilsinmi?"),
                    content: Text("${project.nomi} o'chiriladi."),
                    actions: [
                      TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Bekor')),
                      ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: AppColors.red), onPressed: () => Navigator.of(ctx).pop(true), child: const Text("O'chirish")),
                    ],
                  ),
                );
                if (confirm == true && mounted) {
                  await _projectRepo.deleteProject(project.id);
                  Navigator.of(context).pop();
                }
              }
            },
            itemBuilder: (_) => [
              PopupMenuItem(value: 'toggleDone', child: Text(isDone ? 'Faolga qaytarish' : 'Yakunlandi')),
              const PopupMenuItem(value: 'duplicate', child: Text("Nusxa ko'chirish")),
              const PopupMenuItem(value: 'delete', child: Text("O'chirish", style: TextStyle(color: AppColors.red))),
            ],
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                children: [
                  // Cover image or gradient banner
                  if (project.imageUrl != null) ...[
                    ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: Image.network(
                        project.imageUrl!,
                        height: 160,
                        width: double.infinity,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],

                  // Header card
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Expanded(child: Text(project.nomi, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(color: (isDone ? AppColors.green : AppColors.accent).withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
                            child: Text(isDone ? 'Yakunlangan' : 'Faol', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: isDone ? AppColors.green : AppColors.accent)),
                          ),
                        ]),
                        if (project.manzil != null || project.mijoz != null) ...[
                          const SizedBox(height: 4),
                          Text([project.manzil, project.mijoz].where((s) => s != null && s!.isNotEmpty).join(' • '),
                            style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                        ],
                        const SizedBox(height: 12),
                        const Divider(color: AppColors.border, height: 1),
                        const SizedBox(height: 12),
                        Row(children: [
                          _InfoChip(label: 'Boshlanish', value: startFmt),
                          const SizedBox(width: 8),
                          _InfoChip(label: 'Tugash', value: endFmt),
                          const SizedBox(width: 8),
                          _InfoChip(label: 'Qolgan', value: '$left kun'),
                        ]),
                        const SizedBox(height: 12),
                        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                          const Text('Bajarilish', style: TextStyle(fontSize: 12, color: AppColors.muted)),
                          Text('$progress%', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                        ]),
                        const SizedBox(height: 6),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: (progress / 100).clamp(0.0, 1.0),
                            minHeight: 6,
                            backgroundColor: AppColors.border,
                            valueColor: AlwaysStoppedAnimation(isDone ? AppColors.green : AppColors.accent),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Big balance card
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
                    decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
                    child: Column(children: [
                      // Qoldiq (big)
                      const Text('Qoldiq', style: TextStyle(fontSize: 12, color: AppColors.muted)),
                      const SizedBox(height: 4),
                      Text(
                        '${formatMoney(project.balance)} so\'m',
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w900,
                          color: project.balance >= 0 ? AppColors.green : AppColors.red,
                        ),
                      ),
                      const SizedBox(height: 16),
                      const Divider(color: AppColors.border, height: 1),
                      const SizedBox(height: 16),
                      Row(children: [
                        Expanded(child: _BalanceItem(
                          icon: Icons.arrow_downward_rounded,
                          label: 'Kirim',
                          value: project.kirim,
                          color: AppColors.green,
                        )),
                        Container(width: 1, height: 40, color: AppColors.border),
                        Expanded(child: _BalanceItem(
                          icon: Icons.arrow_upward_rounded,
                          label: 'Chiqim',
                          value: project.chiqim,
                          color: AppColors.red,
                        )),
                      ]),
                    ]),
                  ),
                  const SizedBox(height: 12),

                  // Action buttons (owner only)
                  if (_project.role == 'owner') ...[
                    Row(children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(backgroundColor: AppColors.green, padding: const EdgeInsets.symmetric(vertical: 14)),
                          onPressed: () => _openAddTransaction(isIncome: true),
                          icon: const Icon(Icons.arrow_downward_rounded, size: 18),
                          label: const Text("Kirim", style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(backgroundColor: AppColors.red, padding: const EdgeInsets.symmetric(vertical: 14)),
                          onPressed: () => _openAddTransaction(isIncome: false),
                          icon: const Icon(Icons.arrow_upward_rounded, size: 18),
                          label: const Text("Chiqim", style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                        ),
                      ),
                    ]),
                    const SizedBox(height: 16),
                  ],

                  // Tabs: Tranzaksiyalar | Ishchilar | Fayllar
                  Container(
                    decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
                    child: Column(children: [
                      TabBar(
                        controller: _tabController,
                        labelColor: AppColors.accent,
                        unselectedLabelColor: AppColors.muted,
                        indicatorColor: AppColors.accent,
                        indicatorSize: TabBarIndicatorSize.label,
                        dividerColor: AppColors.border,
                        tabs: const [
                          Tab(text: 'Tranzaksiyalar'),
                          Tab(text: 'Ishchilar'),
                          Tab(text: 'Fayllar'),
                        ],
                      ),
                      SizedBox(
                        height: 400,
                        child: TabBarView(
                          controller: _tabController,
                          children: [
                            _buildTransactionsTab(),
                            _buildWorkersTab(),
                            _buildFilesTab(),
                          ],
                        ),
                      ),
                    ]),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildTransactionsTab() {
    return Column(children: [
      // Filter chips
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
        child: Row(children: [
          _FilterChip(label: 'Barchasi', selected: _txFilter == 'all', onTap: () => setState(() => _txFilter = 'all')),
          const SizedBox(width: 6),
          _FilterChip(label: 'Kirim', selected: _txFilter == 'income', onTap: () => setState(() => _txFilter = 'income')),
          const SizedBox(width: 6),
          _FilterChip(label: 'Chiqim', selected: _txFilter == 'expense', onTap: () => setState(() => _txFilter = 'expense')),
        ]),
      ),
      Expanded(
        child: _filteredTxs.isEmpty
            ? const Center(child: Text("Tranzaksiyalar yo'q", style: TextStyle(color: AppColors.muted, fontSize: 13)))
            : ListView.separated(
                padding: const EdgeInsets.only(bottom: 12),
                itemCount: _filteredTxs.length,
                separatorBuilder: (_, __) => const Divider(color: AppColors.border, height: 1, indent: 60),
                itemBuilder: (ctx, i) {
                  final tx = _filteredTxs[i];
                  final isIncome = tx.tur == 'income';
                  final color = isIncome ? AppColors.green : AppColors.red;
                  return Dismissible(
                    key: ValueKey(tx.id),
                    direction: DismissDirection.endToStart,
                    background: Container(
                      alignment: Alignment.centerRight,
                      padding: const EdgeInsets.only(right: 16),
                      color: AppColors.red,
                      child: const Icon(Icons.delete_outline_rounded, color: Colors.white),
                    ),
                    confirmDismiss: (_) => showDialog<bool>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: const Text("O'chirilsinmi?"),
                        content: const Text("Tranzaksiya o'chiriladi."),
                        actions: [
                          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Bekor')),
                          ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: AppColors.red), onPressed: () => Navigator.of(ctx).pop(true), child: const Text("O'chirish")),
                        ],
                      ),
                    ),
                    onDismissed: (_) => _deleteTransaction(tx),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      child: Row(children: [
                        Container(
                          width: 36, height: 36,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                          child: Icon(isIncome ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded, size: 18, color: color),
                        ),
                        const SizedBox(width: 10),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(tx.izoh ?? tx.kategoriya ?? (isIncome ? 'Kirim' : 'Chiqim'),
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                          Text(_dateFmt.format(tx.date), style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                        ])),
                        Text('${isIncome ? '+' : '-'}${formatMoney(tx.summa)} so\'m',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: color)),
                      ]),
                    ),
                  );
                },
              ),
      ),
    ]);
  }

  Widget _buildWorkersTab() {
    return Column(children: [
      if (_project.role == 'owner')
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
          child: Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: _openAddMember,
              icon: const Icon(Icons.person_add_outlined, size: 16),
              label: const Text("Ishchi qo'shish", style: TextStyle(fontSize: 12)),
              style: TextButton.styleFrom(foregroundColor: AppColors.accent),
            ),
          ),
        ),
      Expanded(
        child: _visibleMembers.isEmpty
            ? const Center(child: Text("Ishchilar yo'q", style: TextStyle(color: AppColors.muted, fontSize: 13)))
            : ListView.separated(
                padding: const EdgeInsets.only(bottom: 12),
                itemCount: _visibleMembers.length,
                separatorBuilder: (_, __) => const Divider(color: AppColors.border, height: 1, indent: 56),
                itemBuilder: (_, i) {
                  final m = _visibleMembers[i];
                  final color = colorForName(m.displayName);
                  final initials = m.displayName.trim().isEmpty ? '?' : m.displayName.trim()[0].toUpperCase();
                  final balance = m.ishaqi - m.olingan;
                  return InkWell(
                    onTap: () => _openWorkerProfile(m),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      child: Row(children: [
                        CircleAvatar(
                          radius: 20,
                          backgroundColor: color.withOpacity(0.15),
                          child: Text(initials, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: color)),
                        ),
                        const SizedBox(width: 12),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(m.displayName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                          if (m.kasb != null && m.kasb!.isNotEmpty)
                            Text(m.kasb!, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                        ])),
                        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                          Text('${formatMoney(m.ishaqi)} so\'m', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                          Text(
                            balance > 0 ? 'Qarzdor: ${formatMoney(balance)}' : 'Hisob-kitob',
                            style: TextStyle(fontSize: 11, color: balance > 0 ? AppColors.orange : AppColors.muted),
                          ),
                        ]),
                        const SizedBox(width: 6),
                        const Icon(Icons.chevron_right_rounded, size: 18, color: AppColors.muted),
                      ]),
                    ),
                  );
                },
              ),
      ),
    ]);
  }

  Widget _buildFilesTab() {
    return Column(children: [
      if (_project.role == 'owner')
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
          child: Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: _uploadFile,
              icon: const Icon(Icons.upload_file_outlined, size: 16),
              label: const Text("Fayl yuklash", style: TextStyle(fontSize: 12)),
              style: TextButton.styleFrom(foregroundColor: AppColors.accent),
            ),
          ),
        ),
      Expanded(
        child: _filesLoading
            ? const Center(child: CircularProgressIndicator())
            : _files.isEmpty
                ? Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: const [
                    Icon(Icons.folder_open_rounded, size: 36, color: AppColors.muted),
                    SizedBox(height: 8),
                    Text("Fayllar yo'q", style: TextStyle(color: AppColors.muted, fontSize: 13)),
                  ]))
                : ListView.separated(
                    padding: const EdgeInsets.only(bottom: 12),
                    itemCount: _files.length,
                    separatorBuilder: (_, __) => const Divider(color: AppColors.border, height: 1, indent: 56),
                    itemBuilder: (_, i) {
                      final f = _files[i];
                      return Dismissible(
                        key: ValueKey(f.path),
                        direction: _project.role == 'owner' ? DismissDirection.endToStart : DismissDirection.none,
                        background: Container(
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.only(right: 16),
                          color: AppColors.red,
                          child: const Icon(Icons.delete_outline_rounded, color: Colors.white),
                        ),
                        confirmDismiss: (_) => showDialog<bool>(
                          context: context,
                          builder: (ctx) => AlertDialog(
                            title: const Text("O'chirilsinmi?"),
                            content: Text('${f.name} o\'chiriladi.'),
                            actions: [
                              TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Bekor')),
                              ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: AppColors.red), onPressed: () => Navigator.of(ctx).pop(true), child: const Text("O'chirish")),
                            ],
                          ),
                        ),
                        onDismissed: (_) async {
                          await _filesRepo.deleteFile(f.path);
                          setState(() => _files.removeWhere((x) => x.path == f.path));
                        },
                        child: InkWell(
                          onTap: () async {
                            final uri = Uri.parse(f.publicUrl);
                            if (await canLaunchUrl(uri)) launchUrl(uri, mode: LaunchMode.externalApplication);
                          },
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            child: Row(children: [
                              Container(
                                width: 36, height: 36,
                                decoration: BoxDecoration(
                                  color: _fileColor(f).withOpacity(0.12),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Icon(_fileIcon(f), size: 20, color: _fileColor(f)),
                              ),
                              const SizedBox(width: 12),
                              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(f.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
                                if (f.sizeBytes != null)
                                  Text(_formatSize(f.sizeBytes!), style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                              ])),
                              const Icon(Icons.open_in_new_rounded, size: 16, color: AppColors.muted),
                            ]),
                          ),
                        ),
                      );
                    },
                  ),
      ),
    ]);
  }

  IconData _fileIcon(ProjectFile f) {
    if (f.isImage) return Icons.image_outlined;
    if (f.isPdf) return Icons.picture_as_pdf_outlined;
    if (f.isExcel) return Icons.table_chart_outlined;
    return Icons.insert_drive_file_outlined;
  }

  Color _fileColor(ProjectFile f) {
    if (f.isImage) return AppColors.accent;
    if (f.isPdf) return AppColors.red;
    if (f.isExcel) return AppColors.green;
    return AppColors.muted;
  }

  String _formatSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}

class _WorkerInfoRow extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _WorkerInfoRow({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(children: [
        Expanded(child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.text2))),
        Text(value, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: color)),
      ]),
    );
  }
}

class _InfoChip extends StatelessWidget {
  final String label;
  final String value;
  const _InfoChip({required this.label, required this.value});
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        decoration: BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.circular(10)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(fontSize: 10, color: AppColors.muted)),
          const SizedBox(height: 2),
          Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
        ]),
      ),
    );
  }
}

class _BalanceItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final num value;
  final Color color;
  const _BalanceItem({required this.icon, required this.label, required this.value, required this.color});
  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Container(
          width: 28, height: 28,
          decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, size: 14, color: color),
        ),
        const SizedBox(width: 6),
        Text(label, style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w600)),
      ]),
      const SizedBox(height: 6),
      Text('${formatMoney(value)} so\'m', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: color), textAlign: TextAlign.center),
    ]);
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _FilterChip({required this.label, required this.selected, required this.onTap});
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: selected ? AppColors.accent : AppColors.bg,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? AppColors.accent : AppColors.border),
        ),
        child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: selected ? Colors.white : AppColors.muted)),
      ),
    );
  }
}
