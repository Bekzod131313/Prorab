import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/currency_repository.dart';
import '../data/prefs_repository.dart';
import '../data/profile_repository.dart';
import '../data/project_repository.dart';
import '../data/task_repository.dart';
import '../data/transaction_repository.dart';
import '../main.dart';
import '../models/currency.dart';
import '../models/profile.dart';
import '../models/project.dart';
import '../models/transaction.dart';
import '../theme/app_theme.dart';
import '../widgets/moliya_logo.dart';
import '../widgets/project_card.dart';
import 'project_detail_screen.dart';

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
  List<Project> _projects = [];
  List<ProjectTransaction> _recentTxs = [];
  List<UpcomingTask> _upcomingTasks = [];
  Set<String> _pinned = {};
  Profile? _profile;
  bool _loading = true;
  String? _error;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final projects = await _repo.loadProjects();
      List<ProjectTransaction> recentTxs = [];
      try {
        recentTxs = await _txRepo.loadRecentForProjects(projects.map((p) => p.id).toList());
      } catch (_) {}
      Profile? profile;
      try {
        profile = await _profileRepo.loadCurrent();
      } catch (_) {}
      List<UpcomingTask> upcomingTasks = [];
      try {
        upcomingTasks = await _taskRepo.loadUpcoming(projects);
      } catch (_) {}
      Set<String> pinned = {};
      try {
        pinned = await _prefsRepo.loadPinned();
      } catch (_) {}
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
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _openAddProject() async {
    final nameCtrl = TextEditingController();
    final daysCtrl = TextEditingController(text: '30');
    final manzilCtrl = TextEditingController();
    final mijozCtrl = TextEditingController();
    final bosqichCtrl = TextEditingController();
    DateTime startDate = DateTime.now();

    final created = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Yangi obyekt',
                style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(hintText: 'Obyekt nomi'),
              ),
              const SizedBox(height: 12),
              InkWell(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: ctx,
                    initialDate: startDate,
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2100),
                  );
                  if (picked != null) setSheetState(() => startDate = picked);
                },
                child: InputDecorator(
                  decoration: const InputDecoration(labelText: 'Boshlanish sanasi'),
                  child: Text(
                    '${startDate.year}-${startDate.month.toString().padLeft(2, '0')}-${startDate.day.toString().padLeft(2, '0')}',
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: daysCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(hintText: 'Muddat (kun)'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: manzilCtrl,
                decoration: const InputDecoration(hintText: 'Manzil (ixtiyoriy)'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: mijozCtrl,
                decoration: const InputDecoration(hintText: 'Mijoz (ixtiyoriy)'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: bosqichCtrl,
                decoration: const InputDecoration(hintText: 'Bosqich (ixtiyoriy, masalan: Poydevor)'),
              ),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: () {
                  if (nameCtrl.text.trim().isEmpty) return;
                  Navigator.of(ctx).pop(true);
                },
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
        bosqich: bosqichCtrl.text.trim(),
      );
      _load();
    }
  }

  Future<void> _openCurrencyRates() async {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => const _CurrencyRatesSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Row(
          children: const [
            MoliyaLogo(size: 28),
            SizedBox(width: 10),
            Text('Moliya'),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.currency_exchange_rounded),
            onPressed: _openCurrencyRates,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openAddProject,
        child: const Icon(Icons.add_rounded),
      ),
      body: Column(
        children: [
          if (_profile != null) _buildGreeting(),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _load,
              child: _buildBody(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGreeting() {
    final hour = DateTime.now().hour;
    final greeting = hour < 12
        ? 'Xayrli tong'
        : hour < 18
            ? 'Assalomu alaykum'
            : 'Xayrli kech';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(greeting, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  _profile!.displayName,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          if (_projects.isNotEmpty) ...[
            _QuickActionButton(
              icon: Icons.arrow_downward_rounded,
              color: const Color(0xFF22C55E),
              label: 'Kirim',
              onTap: () => _openQuickAdd(isIncome: true),
            ),
            const SizedBox(width: 8),
            _QuickActionButton(
              icon: Icons.arrow_upward_rounded,
              color: const Color(0xFFF43F5E),
              label: 'Chiqim',
              onTap: () => _openQuickAdd(isIncome: false),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _openQuickAdd({required bool isIncome}) async {
    Project? target;
    if (_projects.length == 1) {
      target = _projects.first;
    } else {
      target = await showModalBottomSheet<Project>(
        context: context,
        backgroundColor: AppColors.card,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (ctx) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Obyekt tanlang',
                  style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 12),
                for (final p in _projects)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(p.nomi),
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

  Future<void> _openProjectMenu(Project project) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: const Color(0xFF0F1626),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(project.nomi, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
            const SizedBox(height: 16),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(_pinned.contains(project.id) ? Icons.push_pin_rounded : Icons.push_pin_outlined, color: AppColors.accent),
              title: Text(_pinned.contains(project.id) ? 'Mahkamlashni bekor qilish' : 'Tepaga mahkamlash'),
              onTap: () => Navigator.of(ctx).pop('pin'),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.check_circle_outline_rounded, color: Color(0xFF22C55E)),
              title: Text(project.status == 'done' ? 'Faolga qaytarish' : 'Yakunlandi deb belgilash'),
              onTap: () => Navigator.of(ctx).pop('toggleDone'),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.add_rounded, color: Color(0xFF3B82F6)),
              title: const Text('Kirim qo\'shish'),
              onTap: () => Navigator.of(ctx).pop('income'),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.remove_rounded, color: Color(0xFFF43F5E)),
              title: const Text('Chiqim qo\'shish'),
              onTap: () => Navigator.of(ctx).pop('expense'),
            ),
          ],
        ),
      ),
    );
    if (action == null || !mounted) return;
    if (action == 'pin') {
      await _prefsRepo.togglePin(project.id);
      final pinned = await _prefsRepo.loadPinned();
      setState(() => _pinned = pinned);
    } else if (action == 'toggleDone') {
      final newStatus = project.status == 'done' ? 'active' : 'done';
      await _repo.setStatus(project.id, newStatus);
      _load();
    } else if (action == 'income') {
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: project, quickAddIncome: true)),
      );
      _load();
    } else if (action == 'expense') {
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: project, quickAddIncome: false)),
      );
      _load();
    }
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return ListView(
        children: [
          const SizedBox(height: 80),
          Center(
            child: Text('Xatolik: $_error', style: const TextStyle(color: Colors.redAccent)),
          ),
        ],
      );
    }
    if (_projects.isEmpty) {
      return ListView(
        children: [
          const SizedBox(height: 100),
          const Icon(Icons.folder_open_rounded, size: 56, color: AppColors.muted),
          const SizedBox(height: 12),
          const Center(
            child: Text("Hozircha obyektlar yo'q", style: TextStyle(color: AppColors.text2)),
          ),
          const SizedBox(height: 16),
          Center(
            child: ElevatedButton(
              onPressed: _openAddProject,
              child: const Text('+ Yaratish'),
            ),
          ),
        ],
      );
    }
    final projectNames = {for (final p in _projects) p.id: p.nomi};
    final activeProjects = _projects.where((p) => p.status != 'done').toList();
    final filteredProjects = (_search.isEmpty
        ? List<Project>.from(activeProjects)
        : activeProjects.where((p) => p.nomi.toLowerCase().contains(_search.toLowerCase())).toList())
      ..sort((a, b) {
        final aPin = _pinned.contains(a.id) ? 0 : 1;
        final bPin = _pinned.contains(b.id) ? 0 : 1;
        return aPin.compareTo(bPin);
      });
    final doneProjects = _projects.where((p) => p.status == 'done').toList();
    final totalBal = _projects.fold<num>(0, (s, p) => s + p.balance);
    final totalIn = _projects.fold<num>(0, (s, p) => s + p.kirim);
    final totalOut = _projects.fold<num>(0, (s, p) => s + p.chiqim);
    final showRecent = _recentTxs.isNotEmpty;
    final showSearch = activeProjects.length > 3;
    final showUpcoming = _upcomingTasks.isNotEmpty;
    final headerOffset = showSearch ? 3 : 2;
    final headerCount = filteredProjects.length + headerOffset;
    final recentEnd = headerCount + (showRecent ? 1 + _recentTxs.length : 0);
    final upcomingEnd = recentEnd + (showUpcoming ? 1 + _upcomingTasks.length : 0);
    final doneStart = upcomingEnd;
    final itemCount = doneStart + (doneProjects.isNotEmpty ? 1 + doneProjects.length : 0);

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: itemCount,
      itemBuilder: (context, index) {
        if (index == 0) {
          final balColor = totalBal >= 0 ? const Color(0xFF16A34A) : const Color(0xFFEF4444);
          return Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('UMUMIY QOLDIQ', style: TextStyle(fontSize: 10, color: AppColors.muted, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                      const SizedBox(height: 4),
                      Text('${totalBal >= 0 ? '+' : ''}${formatMoney(totalBal)} so\'m',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: balColor)),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('+${formatMoney(totalIn)}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF16A34A))),
                    const SizedBox(height: 2),
                    Text('-${formatMoney(totalOut)}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFFEF4444))),
                  ],
                ),
              ],
            ),
          );
        }
        if (index == 1) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 12, left: 4),
            child: Text(
              'Faol obyektlar',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
          );
        }
        if (showSearch && index == 2) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: TextField(
              onChanged: (v) => setState(() => _search = v),
              decoration: const InputDecoration(
                hintText: 'Obyekt qidirish...',
                prefixIcon: Icon(Icons.search_rounded),
              ),
            ),
          );
        }
        if (index < headerCount) {
          final project = filteredProjects[index - headerOffset];
          return ProjectCard(
            project: project,
            isPinned: _pinned.contains(project.id),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: project)),
              ).then((_) => _load());
            },
            onLongPress: () => _openProjectMenu(project),
          );
        }
        if (showRecent && index < recentEnd) {
          if (index == headerCount) {
            return Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 12, left: 4),
              child: Text(
                "So'nggi harakatlar",
                style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
            );
          }
          final tx = _recentTxs[index - headerCount - 1];
          final isLast = index == recentEnd - 1;
          return _RecentTxTile(
            tx: tx,
            obNomi: projectNames[tx.obId] ?? '',
            isLast: isLast,
            onTap: () {
              final project = _projects.firstWhere(
                (p) => p.id == tx.obId,
                orElse: () => _projects.first,
              );
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: project)),
              );
            },
          );
        }
        if (showUpcoming && index < upcomingEnd) {
          if (index == recentEnd) {
            return Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 12, left: 4),
              child: Row(
                children: [
                  Text(
                    "Yaqinlashgan muddatlar",
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.redAccent.withOpacity(0.14),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      '${_upcomingTasks.length}',
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.redAccent),
                    ),
                  ),
                ],
              ),
            );
          }
          final ut = _upcomingTasks[index - recentEnd - 1];
          final isOverdue = ut.task.muddat!.isBefore(DateTime.now());
          final dateStr = DateFormat('dd.MM').format(ut.task.muddat!);
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: isOverdue ? Colors.redAccent.withOpacity(0.4) : AppColors.border),
            ),
            child: Row(
              children: [
                Container(
                  width: 8, height: 8,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isOverdue ? Colors.redAccent : const Color(0xFFF59E0B),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(ut.task.nomi, style: const TextStyle(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis),
                      Text(ut.obNomi, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
                Text(
                  isOverdue ? 'Kechikkan' : dateStr,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: isOverdue ? Colors.redAccent : const Color(0xFFF59E0B),
                  ),
                ),
              ],
            ),
          );
        }
        if (index == doneStart) {
          return Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 12, left: 4),
            child: Text(
              'Yakunlangan obyektlar',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
          );
        }
        final project = doneProjects[index - doneStart - 1];
        return ProjectCard(
          project: project,
          onTap: () {
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: project)),
            ).then((_) => _load());
          },
          onLongPress: () => _openProjectMenu(project),
        );
      },
    );
  }
}

class _QuickActionButton extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label;
  final VoidCallback onTap;

  const _QuickActionButton({required this.icon, required this.color, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: color.withOpacity(0.14),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.3)),
        ),
        child: Column(
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: color)),
          ],
        ),
      ),
    );
  }
}

class _RecentTxTile extends StatelessWidget {
  final ProjectTransaction tx;
  final String obNomi;
  final bool isLast;
  final VoidCallback? onTap;

  const _RecentTxTile({required this.tx, required this.obNomi, required this.isLast, this.onTap});

  @override
  Widget build(BuildContext context) {
    final userId = supabase.auth.currentUser?.id;
    final isIn = tx.isIncomeFor(userId ?? '');

    final Color dotColor;
    final String title;
    switch (tx.tur) {
      case 'income':
        dotColor = const Color(0xFF22C55E);
        title = tx.izoh?.isNotEmpty == true ? tx.izoh! : 'Kirim';
        break;
      case 'ishhaqi':
        dotColor = const Color(0xFF3B82F6);
        title = 'Ish haqi berildi';
        break;
      case 'send':
        dotColor = const Color(0xFF3B82F6);
        title = "Pul o'tkazma";
        break;
      case 'spend':
        dotColor = const Color(0xFFF43F5E);
        title = tx.kategoriya?.isNotEmpty == true ? tx.kategoriya! : 'Chiqim';
        break;
      default:
        dotColor = const Color(0xFFF43F5E);
        title = tx.izoh ?? '';
    }

    final amountColor = isIn ? const Color(0xFF22C55E) : const Color(0xFFF43F5E);
    final sign = isIn ? '+' : '-';
    final dateStr = DateFormat('dd.MM.yyyy').format(tx.date);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Column(
              children: [
                const SizedBox(height: 4),
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: dotColor,
                    border: Border.all(color: AppColors.bg, width: 3),
                    boxShadow: [BoxShadow(color: dotColor.withOpacity(0.35), blurRadius: 0, spreadRadius: 2)],
                  ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(width: 2, margin: const EdgeInsets.symmetric(vertical: 2), color: AppColors.border),
                  ),
              ],
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(bottom: isLast ? 0 : 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: const TextStyle(fontWeight: FontWeight.w800),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '$sign${formatMoney(tx.summa)}',
                          style: TextStyle(fontWeight: FontWeight.w900, color: amountColor),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      obNomi.isNotEmpty ? '$obNomi • $dateStr' : dateStr,
                      style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CurrencyRatesSheet extends StatefulWidget {
  const _CurrencyRatesSheet();

  @override
  State<_CurrencyRatesSheet> createState() => _CurrencyRatesSheetState();
}

class _CurrencyRatesSheetState extends State<_CurrencyRatesSheet> {
  final _repo = CurrencyRepository();
  List<CurrencyRate>? _rates;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final rates = await _repo.loadRates();
      if (!mounted) return;
      setState(() {
        _rates = rates;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Kursni yuklashda xato');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: 20 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Valyuta kurslari',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 16),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: Center(child: Text(_error!, style: const TextStyle(color: AppColors.muted))),
            )
          else if (_rates == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Center(child: CircularProgressIndicator()),
            )
          else
            ..._rates!.map((c) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppColors.bg,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Text(c.code, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: AppColors.text2)),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(c.nameUz, style: const TextStyle(fontWeight: FontWeight.w700)),
                            Text(c.nameEn, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text("${c.rate.toStringAsFixed(2)} so'm", style: const TextStyle(fontWeight: FontWeight.w900)),
                          Text(
                            '${c.diff > 0 ? '▲' : c.diff < 0 ? '▼' : ''} ${c.diff.abs().toStringAsFixed(2)}',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: c.diff > 0
                                  ? const Color(0xFF16A34A)
                                  : c.diff < 0
                                      ? const Color(0xFFEF4444)
                                      : AppColors.muted,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                )),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}
