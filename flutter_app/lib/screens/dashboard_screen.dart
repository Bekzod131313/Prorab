import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/prefs_repository.dart';
import '../data/profile_repository.dart';
import '../data/project_repository.dart';
import '../data/project_template_repository.dart';
import '../data/task_repository.dart';
import '../data/transaction_repository.dart';
import '../main.dart';
import '../models/profile.dart';
import '../models/project.dart';
import '../models/transaction.dart';
import '../theme/app_theme.dart';
import '../widgets/project_card.dart' show formatMoney;
import 'project_detail_screen.dart';
import 'archive_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final _repo = ProjectRepository();
  final _txRepo = TransactionRepository();
  final _profileRepo = ProfileRepository();
  final _taskRepo = TaskRepository();
  final _prefsRepo = PrefsRepository();
  final _templateRepo = ProjectTemplateRepository();

  List<Project> _projects = [];
  List<ProjectTransaction> _recentTxs = [];
  List<UpcomingTask> _upcomingTasks = [];
  Set<String> _pinned = {};
  Profile? _profile;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final projects = await _repo.loadProjects();
      List<ProjectTransaction> recentTxs = [];
      try { recentTxs = await _txRepo.loadRecentForProjects(projects.map((p) => p.id).toList()); } catch (_) {}
      Profile? profile;
      try { profile = await _profileRepo.loadCurrent(); } catch (_) {}
      List<UpcomingTask> upcomingTasks = [];
      try { upcomingTasks = await _taskRepo.loadUpcoming(projects); } catch (_) {}
      Set<String> pinned = {};
      try { pinned = await _prefsRepo.loadPinned(); } catch (_) {}
      if (!mounted) return;
      setState(() {
        _projects = projects;
        _recentTxs = recentTxs;
        _upcomingTasks = upcomingTasks;
        _pinned = pinned;
        _profile = profile;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _openAddProject() async {
    final nameCtrl = TextEditingController();
    final daysCtrl = TextEditingController(text: '30');
    final manzilCtrl = TextEditingController();
    final mijozCtrl = TextEditingController();
    DateTime startDate = DateTime.now();

    final created = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => Padding(
          padding: EdgeInsets.only(left: 20, right: 20, top: 24, bottom: 24 + MediaQuery.of(ctx).viewInsets.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(children: [
                Expanded(child: const Text('Yangi obyekt', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17))),
                TextButton.icon(
                  icon: const Icon(Icons.bookmark_outline_rounded, size: 16),
                  label: const Text('Shablon', style: TextStyle(fontSize: 12)),
                  style: TextButton.styleFrom(foregroundColor: AppColors.accent),
                  onPressed: () async {
                    final templates = await _templateRepo.load();
                    if (templates.isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Saqlangan shablon yo'q")));
                      return;
                    }
                    final tmpl = await showModalBottomSheet<ProjectTemplate>(
                      context: context,
                      backgroundColor: AppColors.card,
                      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
                      builder: (c) => Padding(
                        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Shablon tanlash', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                            const SizedBox(height: 12),
                            for (final t in templates)
                              ListTile(
                                contentPadding: EdgeInsets.zero,
                                title: Text(t.nomi),
                                subtitle: Text('${t.muddat} kun${t.mijoz?.isNotEmpty == true ? " • ${t.mijoz}" : ""}'),
                                onTap: () => Navigator.pop(c, t),
                              ),
                          ],
                        ),
                      ),
                    );
                    if (tmpl != null) {
                      setSt(() {
                        nameCtrl.text = tmpl.nomi;
                        daysCtrl.text = tmpl.muddat.toString();
                        manzilCtrl.text = tmpl.manzil ?? '';
                        mijozCtrl.text = tmpl.mijoz ?? '';
                      });
                    }
                  },
                ),
              ]),
              const SizedBox(height: 16),
              TextField(controller: nameCtrl, autofocus: true, decoration: const InputDecoration(hintText: 'Obyekt nomi *')),
              const SizedBox(height: 12),
              InkWell(
                onTap: () async {
                  final picked = await showDatePicker(context: ctx, initialDate: startDate, firstDate: DateTime(2020), lastDate: DateTime(2100));
                  if (picked != null) setSt(() => startDate = picked);
                },
                child: InputDecorator(
                  decoration: const InputDecoration(labelText: 'Boshlanish sanasi', prefixIcon: Icon(Icons.calendar_today_rounded, size: 18)),
                  child: Text('${startDate.year}-${startDate.month.toString().padLeft(2, '0')}-${startDate.day.toString().padLeft(2, '0')}'),
                ),
              ),
              const SizedBox(height: 12),
              TextField(controller: daysCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(hintText: 'Muddat (kun)', prefixIcon: Icon(Icons.timer_outlined, size: 18))),
              const SizedBox(height: 12),
              TextField(controller: manzilCtrl, decoration: const InputDecoration(hintText: 'Manzil (ixtiyoriy)', prefixIcon: Icon(Icons.location_on_outlined, size: 18))),
              const SizedBox(height: 12),
              TextField(controller: mijozCtrl, decoration: const InputDecoration(hintText: 'Mijoz (ixtiyoriy)', prefixIcon: Icon(Icons.person_outline_rounded, size: 18))),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: () { if (nameCtrl.text.trim().isEmpty) return; Navigator.of(ctx).pop(true); },
                child: const Text('Yaratish'),
              ),
            ],
          ),
        ),
      ),
    );

    if (created == true) {
      final days = int.tryParse(daysCtrl.text.trim()) ?? 30;
      await _repo.createProject(
        nomi: nameCtrl.text.trim(),
        boshlanish: startDate,
        muddat: days,
        manzil: manzilCtrl.text.trim(),
        mijoz: mijozCtrl.text.trim(),
        bosqich: '',
      );
      _load();
    }
    nameCtrl.dispose(); daysCtrl.dispose(); manzilCtrl.dispose(); mijozCtrl.dispose();
  }

  Future<void> _openQuickAdd({required bool isIncome}) async {
    final activeProjects = _projects.where((p) => p.role == 'owner' && p.status != 'done').toList();
    if (activeProjects.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Faol loyiha yo'q")));
      return;
    }
    Project? target;
    if (activeProjects.length == 1) {
      target = activeProjects.first;
    } else {
      target = await showModalBottomSheet<Project>(
        context: context,
        backgroundColor: AppColors.card,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        builder: (ctx) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(isIncome ? 'Kirim — Loyiha tanlang' : 'Chiqim — Loyiha tanlang',
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 12),
                for (final p in activeProjects)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(p.nomi),
                    subtitle: Text('${formatMoney(p.balance)} so\'m', style: const TextStyle(fontSize: 12)),
                    trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.muted),
                    onTap: () => Navigator.of(ctx).pop(p),
                  ),
              ],
            ),
          ),
        ),
      );
    }
    if (target == null || !mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: target!, quickAddIncome: isIncome)),
    );
    _load();
  }

  Future<void> _togglePin(Project project) async {
    await _prefsRepo.togglePin(project.id);
    final pinned = await _prefsRepo.loadPinned();
    setState(() => _pinned = pinned);
  }

  Future<void> _toggleDone(Project project) async {
    final newStatus = project.status == 'done' ? 'active' : 'done';
    await _repo.setStatus(project.id, newStatus);
    _load();
  }

  void _openProjectMenu(Project project) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(project.nomi, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(project.manzil ?? '', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
            const SizedBox(height: 16),
            const Divider(color: AppColors.border),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(_pinned.contains(project.id) ? Icons.push_pin_rounded : Icons.push_pin_outlined, color: AppColors.accent),
              title: Text(_pinned.contains(project.id) ? 'Mahkamlashni bekor qilish' : 'Tepaga mahkamlash'),
              onTap: () => Navigator.of(ctx).pop('pin'),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(project.status == 'done' ? Icons.restart_alt_rounded : Icons.check_circle_outline_rounded, color: AppColors.green),
              title: Text(project.status == 'done' ? 'Faolga qaytarish' : 'Yakunlandi deb belgilash'),
              onTap: () => Navigator.of(ctx).pop('toggleDone'),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.copy_rounded, color: AppColors.muted),
              title: const Text('Nusxa ko\'chirish'),
              onTap: () => Navigator.of(ctx).pop('duplicate'),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.bookmark_add_outlined, color: AppColors.accentTeal),
              title: const Text('Shablon sifatida saqlash'),
              onTap: () => Navigator.of(ctx).pop('saveTemplate'),
            ),
          ],
        ),
      ),
    );
    if (action == null || !mounted) return;
    if (action == 'pin') {
      await _togglePin(project);
    } else if (action == 'toggleDone') {
      await _toggleDone(project);
    } else if (action == 'duplicate') {
      await _repo.createProject(
        nomi: '${project.nomi} (nusxa)',
        muddat: project.muddat,
        manzil: project.manzil,
        mijoz: project.mijoz,
        bosqich: project.bosqich,
        boshlanish: DateTime.now(),
      );
      _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Nusxa yaratildi')));
    } else if (action == 'saveTemplate') {
      await _templateRepo.add(ProjectTemplate(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        nomi: project.nomi,
        muddat: project.muddat,
        manzil: project.manzil,
        mijoz: project.mijoz,
        bosqich: project.bosqich,
      ));
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Shablon saqlandi')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final hour = DateTime.now().hour;
    final greeting = hour < 12 ? 'Xayrli tong' : hour < 18 ? 'Assalomu alaykum' : 'Xayrli kech';
    final name = _profile?.displayName ?? '';

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        titleSpacing: 16,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(greeting, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600)),
            if (name.isNotEmpty)
              Text(name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.text)),
          ],
        ),
        actions: [
          IconButton(
            icon: Container(
              width: 38, height: 38,
              decoration: BoxDecoration(
                color: AppColors.card,
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.border),
              ),
              child: const Icon(Icons.notifications_none_rounded, size: 20, color: AppColors.text2),
            ),
            onPressed: () {},
          ),
          const SizedBox(width: 8),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openAddProject,
        backgroundColor: AppColors.accent,
        foregroundColor: Colors.white,
        elevation: 2,
        child: const Icon(Icons.add_rounded),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: _buildBody(),
            ),
    );
  }

  Widget _buildBody() {
    final activeProjects = _projects.where((p) => p.status != 'done').toList()
      ..sort((a, b) {
        final aPin = _pinned.contains(a.id) ? 0 : 1;
        final bPin = _pinned.contains(b.id) ? 0 : 1;
        return aPin.compareTo(bPin);
      });
    final userId = supabase.auth.currentUser?.id ?? '';
    final totalBal = _projects.fold<num>(0, (s, p) => s + p.balance);
    final totalIn = _projects.fold<num>(0, (s, p) => s + p.kirim);
    final totalOut = _projects.fold<num>(0, (s, p) => s + p.chiqim);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
      children: [
        // Summary card
        _SummaryCard(totalBal: totalBal, totalIn: totalIn, totalOut: totalOut),
        const SizedBox(height: 16),

        // Quick action buttons
        Row(
          children: [
            Expanded(
              child: _ActionBtn(
                label: 'Kirim qo\'shish',
                icon: Icons.add_rounded,
                color: AppColors.accent,
                onTap: () => _openQuickAdd(isIncome: true),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _ActionBtn(
                label: 'Chiqim qo\'shish',
                icon: Icons.remove_rounded,
                color: AppColors.red,
                onTap: () => _openQuickAdd(isIncome: false),
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),

        // Active projects
        if (activeProjects.isNotEmpty) ...[
          _SectionHeader(
            title: 'Faol loyihalar',
            count: activeProjects.length,
            action: activeProjects.length > 3 ? TextButton(
              onPressed: () {},
              child: const Text('Barchasi', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.accent)),
            ) : null,
          ),
          const SizedBox(height: 8),
          for (final p in activeProjects) ...[
            _ProjectTile(
              project: p,
              isPinned: _pinned.contains(p.id),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: p))).then((_) => _load()),
              onLongPress: () => _openProjectMenu(p),
            ),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 4),
        ] else ...[
          _EmptyProjectsCard(onAdd: _openAddProject),
          const SizedBox(height: 20),
        ],

        // Upcoming tasks
        if (_upcomingTasks.isNotEmpty) ...[
          _SectionHeader(
            title: 'Yaqinlashgan muddatlar',
            count: _upcomingTasks.length,
          ),
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              children: List.generate(_upcomingTasks.take(4).length, (i) {
                final tasks = _upcomingTasks.take(4).toList();
                final ut = tasks[i];
                final isOverdue = ut.task.muddat!.isBefore(DateTime.now());
                return Column(
                  children: [
                    ListTile(
                      dense: true,
                      leading: Container(
                        width: 8, height: 8,
                        decoration: BoxDecoration(shape: BoxShape.circle, color: isOverdue ? AppColors.red : AppColors.orange),
                      ),
                      title: Text(ut.task.nomi, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13), overflow: TextOverflow.ellipsis),
                      subtitle: Text(ut.obNomi, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                      trailing: Text(
                        isOverdue ? 'Kechikkan' : DateFormat('dd.MM').format(ut.task.muddat!),
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: isOverdue ? AppColors.red : AppColors.orange),
                      ),
                    ),
                    if (i < tasks.length - 1) const Divider(color: AppColors.border, height: 1, indent: 16),
                  ],
                );
              }),
            ),
          ),
          const SizedBox(height: 20),
        ],

        // Recent transactions
        if (_recentTxs.isNotEmpty) ...[
          _SectionHeader(title: 'So\'nggi harakatlar', count: null),
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              children: List.generate(_recentTxs.take(6).length, (i) {
                final txList = _recentTxs.take(6).toList();
                final tx = txList[i];
                final isIn = tx.isIncomeFor(userId);
                final projName = _projects.where((p) => p.id == tx.obId).map((p) => p.nomi).firstOrNull ?? '';
                return Column(
                  children: [
                    InkWell(
                      onTap: () {
                        final proj = _projects.where((p) => p.id == tx.obId).firstOrNull;
                        if (proj != null) Navigator.of(context).push(MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: proj)));
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        child: Row(
                          children: [
                            Container(
                              width: 36, height: 36,
                              decoration: BoxDecoration(
                                color: (isIn ? AppColors.green : AppColors.red).withOpacity(0.1),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Icon(
                                isIn ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded,
                                size: 18, color: isIn ? AppColors.green : AppColors.red,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _txTitle(tx),
                                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  Text(
                                    projName.isNotEmpty ? '$projName • ${DateFormat('dd.MM.yy').format(tx.date)}' : DateFormat('dd.MM.yy').format(tx.date),
                                    style: const TextStyle(fontSize: 11, color: AppColors.muted),
                                  ),
                                ],
                              ),
                            ),
                            Text(
                              '${isIn ? '+' : '-'}${formatMoney(tx.summa)}',
                              style: TextStyle(fontWeight: FontWeight.w800, color: isIn ? AppColors.green : AppColors.red),
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (i < txList.length - 1) const Divider(color: AppColors.border, height: 1, indent: 14),
                  ],
                );
              }),
            ),
          ),
          const SizedBox(height: 20),
        ],

        // Archived / done projects
        if (_projects.any((p) => p.status == 'done')) ...[
          _SectionHeader(
            title: 'Yakunlangan',
            count: _projects.where((p) => p.status == 'done').length,
            action: TextButton(
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ArchiveScreen())).then((_) => _load()),
              child: const Text('Arxiv', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.accent)),
            ),
          ),
          const SizedBox(height: 8),
          for (final p in _projects.where((p) => p.status == 'done').take(3)) ...[
            _ProjectTile(
              project: p,
              isPinned: false,
              isDone: true,
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: p))).then((_) => _load()),
              onLongPress: () => _openProjectMenu(p),
            ),
            const SizedBox(height: 8),
          ],
        ],
      ],
    );
  }

  String _txTitle(ProjectTransaction tx) {
    switch (tx.tur) {
      case 'income': return tx.izoh?.isNotEmpty == true ? tx.izoh! : 'Kirim';
      case 'ishhaqi': return 'Ish haqi berildi';
      case 'send': return "Pul o'tkazma";
      case 'spend': return tx.kategoriya?.isNotEmpty == true ? tx.kategoriya! : 'Chiqim';
      default: return tx.izoh ?? 'Tranzaksiya';
    }
  }
}

class _SummaryCard extends StatelessWidget {
  final num totalBal;
  final num totalIn;
  final num totalOut;

  const _SummaryCard({required this.totalBal, required this.totalIn, required this.totalOut});

  @override
  Widget build(BuildContext context) {
    final isPositive = totalBal >= 0;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.accent, Color(0xFF1D4ED8)],
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Umumiy qoldiq', style: TextStyle(fontSize: 12, color: Colors.white70, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Text(
            '${formatMoney(totalBal.abs())} so\'m',
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Colors.white),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: _BalStat(label: 'Kirim', value: formatMoney(totalIn), isIncome: true)),
              Container(width: 1, height: 32, color: Colors.white24),
              Expanded(child: _BalStat(label: 'Chiqim', value: formatMoney(totalOut), isIncome: false)),
            ],
          ),
        ],
      ),
    );
  }
}

class _BalStat extends StatelessWidget {
  final String label;
  final String value;
  final bool isIncome;

  const _BalStat({required this.label, required this.value, required this.isIncome});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(label, style: const TextStyle(fontSize: 11, color: Colors.white60)),
        const SizedBox(height: 4),
        Text(
          '${isIncome ? '+' : '-'}$value',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w800,
            color: isIncome ? const Color(0xFF86EFAC) : const Color(0xFFFCA5A5),
          ),
        ),
      ],
    );
  }
}

class _ActionBtn extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _ActionBtn({required this.label, required this.icon, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withOpacity(0.25)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 28, height: 28,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              child: Icon(icon, size: 16, color: Colors.white),
            ),
            const SizedBox(width: 8),
            Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: color)),
          ],
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final int? count;
  final Widget? action;

  const _SectionHeader({required this.title, this.count, this.action});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.text)),
        if (count != null) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(color: AppColors.accent.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
            child: Text('$count', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.accent)),
          ),
        ],
        const Spacer(),
        if (action != null) action!,
      ],
    );
  }
}

class _ProjectTile extends StatelessWidget {
  final Project project;
  final bool isPinned;
  final bool isDone;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  const _ProjectTile({
    required this.project,
    required this.isPinned,
    this.isDone = false,
    required this.onTap,
    required this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final (daysPassed, daysLeft, progressPct) = project.schedule;
    final totalDays = project.muddat == 0 ? 30 : project.muddat;
    final progress = progressPct / 100.0;
    final isOverdue = daysLeft == 0 && !isDone;
    final progressColor = isDone
        ? AppColors.green
        : isOverdue
            ? AppColors.red
            : progress > 0.8
                ? AppColors.orange
                : AppColors.accent;

    return InkWell(
      onTap: onTap,
      onLongPress: onLongPress,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: isOverdue ? AppColors.red.withOpacity(0.3) : AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (isPinned) ...[
                  const Icon(Icons.push_pin_rounded, size: 12, color: AppColors.accent),
                  const SizedBox(width: 4),
                ],
                Expanded(
                  child: Text(project.nomi, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14), overflow: TextOverflow.ellipsis),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: isDone ? AppColors.green.withOpacity(0.1) : isOverdue ? AppColors.red.withOpacity(0.1) : AppColors.accent.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    isDone ? 'Yakunlandi' : isOverdue ? 'Muddati o\'tgan' : 'Faol',
                    style: TextStyle(
                      fontSize: 10, fontWeight: FontWeight.w700,
                      color: isDone ? AppColors.green : isOverdue ? AppColors.red : AppColors.accent,
                    ),
                  ),
                ),
              ],
            ),
            if (project.manzil?.isNotEmpty == true) ...[
              const SizedBox(height: 4),
              Text(project.manzil!, style: const TextStyle(fontSize: 12, color: AppColors.muted), overflow: TextOverflow.ellipsis),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${formatMoney(project.balance)} so\'m', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: project.balance >= 0 ? AppColors.green : AppColors.red)),
                      const SizedBox(height: 2),
                      Text('Qoldiq', style: const TextStyle(fontSize: 10, color: AppColors.muted)),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(isDone ? 'Yakunlandi' : '$daysLeft kun qoldi', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: isOverdue ? AppColors.red : AppColors.text2)),
                    Text('$totalDays kunlik muddat', style: const TextStyle(fontSize: 10, color: AppColors.muted)),
                  ],
                ),
              ],
            ),
            if (!isDone) ...[
              const SizedBox(height: 10),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress.clamp(0.0, 1.0),
                  minHeight: 4,
                  backgroundColor: AppColors.border,
                  valueColor: AlwaysStoppedAnimation(progressColor),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _EmptyProjectsCard extends StatelessWidget {
  final VoidCallback onAdd;

  const _EmptyProjectsCard({required this.onAdd});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          Container(
            width: 56, height: 56,
            decoration: BoxDecoration(color: AppColors.accent.withOpacity(0.1), shape: BoxShape.circle),
            child: const Icon(Icons.folder_open_rounded, size: 28, color: AppColors.accent),
          ),
          const SizedBox(height: 12),
          const Text('Loyihalar yo\'q', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 4),
          const Text('Birinchi loyihangizni yarating', style: TextStyle(fontSize: 13, color: AppColors.muted), textAlign: TextAlign.center),
          const SizedBox(height: 16),
          ElevatedButton(onPressed: onAdd, child: const Text('+ Loyiha yaratish')),
        ],
      ),
    );
  }
}
