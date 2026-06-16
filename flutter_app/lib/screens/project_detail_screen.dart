import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/member_repository.dart';
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
import 'worker_detail_screen.dart';

class ProjectDetailScreen extends StatefulWidget {
  final Project project;
  final bool? quickAddIncome;

  const ProjectDetailScreen({super.key, required this.project, this.quickAddIncome});

  @override
  State<ProjectDetailScreen> createState() => _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends State<ProjectDetailScreen> {
  final _txRepo = TransactionRepository();
  final _memberRepo = MemberRepository();
  final _projectRepo = ProjectRepository();
  final _dateFmt = DateFormat('dd MMM yyyy');

  late Project _project;
  List<ProjectTransaction> _txs = [];
  List<ObMember> _members = [];
  bool _loading = true;
  String _txFilter = 'all';

  @override
  void initState() {
    super.initState();
    _project = widget.project;
    _load();
    if (widget.quickAddIncome != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _openAddTransaction(isIncome: widget.quickAddIncome!);
      });
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
      final txs = results[0] as List<ProjectTransaction>;
      final members = results[1] as List<ObMember>;
      final refreshed = results[2] as Project?;
      if (!mounted) return;
      setState(() {
        _txs = txs;
        _members = members;
        if (refreshed != null) _project = refreshed;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() => _loading = false);
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
      case 'income':
        return base.where((tx) => tx.tur == 'income').toList();
      case 'expense':
        return base.where((tx) => tx.tur != 'income').toList();
      default:
        return base;
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
            Row(
              children: [
                Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: (isIncome ? AppColors.green : AppColors.red).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(isIncome ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded,
                    color: isIncome ? AppColors.green : AppColors.red, size: 18),
                ),
                const SizedBox(width: 10),
                Text(isIncome ? "Kirim qo'shish" : "Chiqim qo'shish",
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
              ],
            ),
            const SizedBox(height: 16),
            TextField(
              controller: amountCtrl,
              keyboardType: TextInputType.number,
              autofocus: true,
              decoration: const InputDecoration(hintText: 'Summa (so\'m)', prefixIcon: Icon(Icons.monetization_on_outlined, size: 18)),
            ),
            const SizedBox(height: 12),
            if (!isIncome) ...[
              DropdownButtonFormField<String>(
                value: selectedCategory,
                decoration: const InputDecoration(labelText: 'Kategoriya'),
                items: categories.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                onChanged: (v) => setSt(() => selectedCategory = v),
              ),
              const SizedBox(height: 12),
              if (workers.isNotEmpty)
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
              if (workers.isNotEmpty) const SizedBox(height: 12),
            ],
            TextField(
              controller: noteCtrl,
              decoration: const InputDecoration(hintText: 'Izoh (ixtiyoriy)'),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: isIncome ? AppColors.green : AppColors.red),
              onPressed: () {
                if (amountCtrl.text.trim().isEmpty) return;
                Navigator.of(ctx).pop(true);
              },
              child: Text(isIncome ? 'Kirim qo\'shish' : 'Chiqim qo\'shish'),
            ),
          ],
        ),
      )),
    );

    if (confirmed == true) {
      final amount = num.tryParse(amountCtrl.text.trim().replaceAll(' ', '')) ?? 0;
      if (amount <= 0) return;
      await _txRepo.addTransaction(
        obId: _project.id,
        isIncome: isIncome,
        amount: amount,
        kategoriya: isIncome ? 'Kirim' : (selectedCategory ?? 'Boshqa'),
        izoh: noteCtrl.text.trim().isNotEmpty ? noteCtrl.text.trim() : null,
        toUserId: isIncome ? null : selectedToUserId,
      );
      _load();
    }
    amountCtrl.dispose();
    noteCtrl.dispose();
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

  @override
  Widget build(BuildContext context) {
    final project = _project;
    final (_, left, progress) = project.schedule;
    final bal = project.kirim - project.chiqim;
    final isDone = project.status == 'done';
    final startFmt = project.boshlanish != null ? _dateFmt.format(project.boshlanish!) : '—';
    final endDate = project.boshlanish != null ? project.boshlanish!.add(Duration(days: project.muddat)) : null;
    final endFmt = endDate != null ? _dateFmt.format(endDate) : '—';

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Text(project.nomi),
        actions: [
          if (_loading) const Padding(padding: EdgeInsets.symmetric(horizontal: 16), child: Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)))),
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
              const PopupMenuItem(value: 'delete', child: Text('O\'chirish', style: TextStyle(color: AppColors.red))),
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
                  // Header card
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(child: Text(project.nomi, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: (isDone ? AppColors.green : AppColors.accent).withOpacity(0.1),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(isDone ? 'Yakunlangan' : 'Faol',
                                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: isDone ? AppColors.green : AppColors.accent)),
                            ),
                          ],
                        ),
                        if (project.manzil != null || project.mijoz != null) ...[
                          const SizedBox(height: 4),
                          Text([project.manzil, project.mijoz].where((s) => s != null && s!.isNotEmpty).join(' • '),
                            style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                        ],
                        const SizedBox(height: 12),
                        const Divider(color: AppColors.border, height: 1),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            _InfoChip(label: 'Boshlanish', value: startFmt),
                            const SizedBox(width: 8),
                            _InfoChip(label: 'Muddat', value: endFmt),
                            const SizedBox(width: 8),
                            _InfoChip(label: 'Qolgan', value: '$left kun'),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Bajarilish', style: TextStyle(fontSize: 12, color: AppColors.muted)),
                            Text('$progress%', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                          ],
                        ),
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

                  // Balance card
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
                    child: Row(
                      children: [
                        _BalanceCol(label: 'Kirim', value: project.kirim, color: AppColors.green),
                        _BalanceCol(label: 'Chiqim', value: project.chiqim, color: AppColors.red),
                        _BalanceCol(label: 'Qoldiq', value: bal, color: bal >= 0 ? AppColors.green : AppColors.red),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Action buttons
                  if (_project.role == 'owner') ...[
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(backgroundColor: AppColors.green),
                            onPressed: () => _openAddTransaction(isIncome: true),
                            icon: const Icon(Icons.arrow_downward_rounded, size: 18),
                            label: const Text("Kirim qo'shish"),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(backgroundColor: AppColors.red),
                            onPressed: () => _openAddTransaction(isIncome: false),
                            icon: const Icon(Icons.arrow_upward_rounded, size: 18),
                            label: const Text("Chiqim qo'shish"),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Workers section
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Ishchilar', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.muted)),
                      if (_project.role == 'owner')
                        TextButton.icon(
                          onPressed: _openAddMember,
                          icon: const Icon(Icons.add_rounded, size: 16),
                          label: const Text("Qo'shish", style: TextStyle(fontSize: 12)),
                          style: TextButton.styleFrom(foregroundColor: AppColors.accent),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_visibleMembers.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
                      child: const Center(child: Text("Ishchilar yo'q", style: TextStyle(color: AppColors.muted, fontSize: 13))),
                    )
                  else
                    Container(
                      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
                      child: Column(
                        children: List.generate(_visibleMembers.length, (i) {
                          final m = _visibleMembers[i];
                          final color = colorForName(m.displayName);
                          final initials = m.displayName.trim().isEmpty ? '?' : m.displayName.trim()[0].toUpperCase();
                          return Column(
                            children: [
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                child: Row(
                                  children: [
                                    CircleAvatar(
                                      radius: 18,
                                      backgroundColor: color.withOpacity(0.15),
                                      child: Text(initials, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: color)),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(m.displayName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                                          if (m.kasb != null) Text(m.kasb!, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                                        ],
                                      ),
                                    ),
                                    Column(
                                      crossAxisAlignment: CrossAxisAlignment.end,
                                      children: [
                                        Text('${formatMoney(m.ishaqi)} so\'m', style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                                        Text(
                                          'Olingan: ${formatMoney(m.olingan)} so\'m',
                                          style: TextStyle(
                                            fontSize: 11, fontWeight: FontWeight.w700,
                                            color: m.balance > 0 ? AppColors.orange : AppColors.muted,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                              if (i < _visibleMembers.length - 1) const Divider(color: AppColors.border, height: 1, indent: 56),
                            ],
                          );
                        }),
                      ),
                    ),
                  const SizedBox(height: 16),

                  // Transactions section
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Tranzaksiyalar', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.muted)),
                      Row(
                        children: [
                          _FilterChip(label: 'Barchasi', selected: _txFilter == 'all', onTap: () => setState(() => _txFilter = 'all')),
                          const SizedBox(width: 6),
                          _FilterChip(label: 'Kirim', selected: _txFilter == 'income', onTap: () => setState(() => _txFilter = 'income')),
                          const SizedBox(width: 6),
                          _FilterChip(label: 'Chiqim', selected: _txFilter == 'expense', onTap: () => setState(() => _txFilter = 'expense')),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_filteredTxs.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
                      child: const Center(child: Text("Tranzaksiyalar yo'q", style: TextStyle(color: AppColors.muted, fontSize: 13))),
                    )
                  else
                    Container(
                      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
                      child: Column(
                        children: List.generate(_filteredTxs.length, (i) {
                          final tx = _filteredTxs[i];
                          final isIncome = tx.tur == 'income';
                          final color = isIncome ? AppColors.green : AppColors.red;
                          return Column(
                            children: [
                              Dismissible(
                                key: ValueKey(tx.id),
                                direction: DismissDirection.endToStart,
                                background: Container(
                                  alignment: Alignment.centerRight,
                                  padding: const EdgeInsets.only(right: 16),
                                  color: AppColors.red,
                                  child: const Icon(Icons.delete_outline_rounded, color: Colors.white),
                                ),
                                confirmDismiss: (_) async {
                                  return await showDialog<bool>(
                                    context: context,
                                    builder: (ctx) => AlertDialog(
                                      title: const Text("O'chirilsinmi?"),
                                      content: const Text('Tranzaksiya o\'chiriladi.'),
                                      actions: [
                                        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Bekor')),
                                        ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: AppColors.red), onPressed: () => Navigator.of(ctx).pop(true), child: const Text("O'chirish")),
                                      ],
                                    ),
                                  );
                                },
                                onDismissed: (_) => _deleteTransaction(tx),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                  child: Row(
                                    children: [
                                      Container(
                                        width: 36, height: 36,
                                        alignment: Alignment.center,
                                        decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                                        child: Icon(isIncome ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded, size: 18, color: color),
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(tx.izoh ?? tx.kategoriya ?? (isIncome ? 'Kirim' : 'Chiqim'),
                                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                                            Text(_dateFmt.format(tx.date), style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                                          ],
                                        ),
                                      ),
                                      Text(
                                        '${isIncome ? '+' : '-'}${formatMoney(tx.summa)} so\'m',
                                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: color),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              if (i < _filteredTxs.length - 1) const Divider(color: AppColors.border, height: 1, indent: 60),
                            ],
                          );
                        }),
                      ),
                    ),
                ],
              ),
            ),
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
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontSize: 10, color: AppColors.muted)),
            const SizedBox(height: 2),
            Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

class _BalanceCol extends StatelessWidget {
  final String label;
  final num value;
  final Color color;
  const _BalanceCol({required this.label, required this.value, required this.color});
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
          const SizedBox(height: 4),
          Text('${formatMoney(value)} so\'m', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color), textAlign: TextAlign.center),
        ],
      ),
    );
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
