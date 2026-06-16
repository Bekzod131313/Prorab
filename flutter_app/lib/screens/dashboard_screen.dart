import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/member_repository.dart';
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
import 'projects_screen.dart';

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
  final _memberRepo = MemberRepository();

  List<Project> _projects = [];
  List<ProjectTransaction> _recentTxs = [];
  List<UpcomingTask> _upcomingTasks = [];
  Set<String> _pinned = {};
  Profile? _profile;
  bool _loading = true;

  final _pageCtrl = PageController();
  int _currentPage = 0;
  Map<String, int> _memberCounts = {};
  Map<String, int> _taskCounts = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _pageCtrl.dispose();
    super.dispose();
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

      // Load member and task counts
      final Map<String, int> memberCounts = {};
      final Map<String, int> taskCounts = {};
      for (final p in projects) {
        try {
          final members = await _memberRepo.loadForProject(p.id);
          memberCounts[p.id] = members.where((m) => m.role == 'member').length;
        } catch (_) {
          memberCounts[p.id] = 0;
        }
        try {
          final tasks = await _taskRepo.loadForProject(p.id);
          taskCounts[p.id] = tasks.length;
        } catch (_) {
          taskCounts[p.id] = 0;
        }
      }

      if (!mounted) return;
      setState(() {
        _projects = projects;
        _recentTxs = recentTxs;
        _upcomingTasks = upcomingTasks;
        _pinned = pinned;
        _profile = profile;
        _memberCounts = memberCounts;
        _taskCounts = taskCounts;
        _loading = false;
        if (_currentPage >= projects.length && projects.isNotEmpty) {
          _currentPage = 0;
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  List<Color> _gradientForProject(String id) {
    final gradients = [
      [const Color(0xFF2563EB), const Color(0xFF7C3AED)],
      [const Color(0xFF059669), const Color(0xFF0891B2)],
      [const Color(0xFFDC2626), const Color(0xFFEA580C)],
      [const Color(0xFF7C3AED), const Color(0xFFDB2777)],
      [const Color(0xFF0891B2), const Color(0xFF0284C7)],
      [const Color(0xFF065F46), const Color(0xFF0369A1)],
    ];
    final idx = id.codeUnits.fold(0, (a, b) => a + b) % gradients.length;
    return gradients[idx];
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

  Future<void> _openQuickAdd({required bool isIncome, Project? selectedProject}) async {
    final activeProjects = _projects.where((p) => p.role == 'owner' && p.status != 'done').toList();
    if (activeProjects.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Faol loyiha yo'q")));
      return;
    }
    Project? target = selectedProject;
    if (target == null) {
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
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        titleSpacing: 16,
        title: const Text('Asosiy', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.text)),
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
    final allProjects = _projects;

    if (allProjects.isEmpty) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 24, 16, 100),
        children: [
          _EmptyProjectsCard(onAdd: _openAddProject),
        ],
      );
    }

    final currentProject = _currentPage < allProjects.length ? allProjects[_currentPage] : allProjects.first;
    final (_, daysLeft, progress) = currentProject.schedule;
    final isDone = currentProject.status == 'done';
    final memberCount = _memberCounts[currentProject.id] ?? 0;
    final taskCount = _taskCounts[currentProject.id] ?? 0;
    final startFmt = currentProject.boshlanish != null
        ? DateFormat('dd.MM.yyyy').format(currentProject.boshlanish!)
        : '—';
    final endDate = currentProject.boshlanish != null
        ? currentProject.boshlanish!.add(Duration(days: currentProject.muddat))
        : null;
    final endFmt = endDate != null ? DateFormat('dd.MM.yyyy').format(endDate) : '—';

    return ListView(
      padding: const EdgeInsets.fromLTRB(0, 8, 0, 100),
      children: [
        // Hero PageView
        SizedBox(
          height: 220,
          child: PageView.builder(
            controller: _pageCtrl,
            itemCount: allProjects.length,
            onPageChanged: (i) => setState(() => _currentPage = i),
            itemBuilder: (ctx, i) {
              final p = allProjects[i];
              final gradient = _gradientForProject(p.id);
              final (_, left, prog) = p.schedule;
              final done = p.status == 'done';
              final indexLabel = '#${(i + 1).toString().padLeft(3, '0')}';
              return GestureDetector(
                onTap: () => Navigator.of(context)
                    .push(MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: p)))
                    .then((_) => _load()),
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 16),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: gradient,
                    ),
                    image: p.imageUrl != null
                        ? DecorationImage(image: NetworkImage(p.imageUrl!), fit: BoxFit.cover)
                        : null,
                  ),
                  child: Container(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(20),
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.black.withOpacity(p.imageUrl != null ? 0.3 : 0.0),
                          Colors.black.withOpacity(0.55),
                        ],
                      ),
                    ),
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.black.withOpacity(0.35),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(indexLabel, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                            ),
                            const Spacer(),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: done ? Colors.grey.withOpacity(0.5) : Colors.green.withOpacity(0.75),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                done ? 'Yakunlandi' : 'Active',
                                style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
                              ),
                            ),
                          ],
                        ),
                        const Spacer(),
                        Text(
                          p.nomi,
                          style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800),
                          overflow: TextOverflow.ellipsis,
                          maxLines: 1,
                        ),
                        const SizedBox(height: 8),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: (prog / 100).clamp(0.0, 1.0),
                            minHeight: 4,
                            backgroundColor: Colors.white.withOpacity(0.25),
                            valueColor: const AlwaysStoppedAnimation(Colors.white),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            // Avatar circles
                            if (memberCount > 0)
                              SizedBox(
                                width: memberCount.clamp(1, 3) * 20.0 + 8,
                                height: 24,
                                child: Stack(
                                  children: List.generate(memberCount.clamp(1, 3), (idx) => Positioned(
                                    left: idx * 16.0,
                                    child: Container(
                                      width: 24, height: 24,
                                      decoration: BoxDecoration(
                                        color: Colors.white.withOpacity(0.3),
                                        shape: BoxShape.circle,
                                        border: Border.all(color: Colors.white, width: 1.5),
                                      ),
                                      child: const Icon(Icons.person, size: 12, color: Colors.white),
                                    ),
                                  )),
                                ),
                              ),
                            const SizedBox(width: 6),
                            Text('$memberCount ishchi', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                            const SizedBox(width: 12),
                            const Icon(Icons.calendar_today_rounded, size: 12, color: Colors.white70),
                            const SizedBox(width: 4),
                            Text('$left kun qoldi', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 10),

        // Page indicator dots
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(allProjects.length, (i) => AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            width: i == _currentPage ? 18 : 6,
            height: 6,
            margin: const EdgeInsets.symmetric(horizontal: 2),
            decoration: BoxDecoration(
              color: i == _currentPage ? AppColors.accent : AppColors.border,
              borderRadius: BorderRadius.circular(3),
            ),
          )),
        ),
        const SizedBox(height: 16),

        // Two action buttons
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              Expanded(
                child: _HeroActionBtn(
                  label: 'Kirim',
                  subtitle: "Qo'shish",
                  icon: Icons.arrow_downward_rounded,
                  color: AppColors.accent,
                  onTap: () => _openQuickAdd(
                    isIncome: true,
                    selectedProject: currentProject.role == 'owner' && currentProject.status != 'done' ? currentProject : null,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _HeroActionBtn(
                  label: 'Chiqim',
                  subtitle: "Qo'shish",
                  icon: Icons.arrow_upward_rounded,
                  color: AppColors.green,
                  onTap: () => _openQuickAdd(
                    isIncome: false,
                    selectedProject: currentProject.role == 'owner' && currentProject.status != 'done' ? currentProject : null,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Project info card for current project
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Container(
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
                  child: Text("Loyiha ma'lumotlari", style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: AppColors.text)),
                ),
                const Divider(color: AppColors.border, height: 1),
                _InfoRow(
                  icon: Icons.calendar_today_rounded,
                  label: 'Boshlangan sana',
                  value: startFmt,
                ),
                const Divider(color: AppColors.border, height: 1, indent: 14),
                _InfoRow(
                  icon: Icons.access_time_rounded,
                  label: 'Tugash sanasi',
                  value: endFmt,
                ),
                const Divider(color: AppColors.border, height: 1, indent: 14),
                _InfoRowProgress(
                  icon: Icons.bar_chart_rounded,
                  label: 'Bajarilish darajasi',
                  progress: progress,
                ),
                const Divider(color: AppColors.border, height: 1, indent: 14),
                _InfoRow(
                  icon: Icons.people_outline_rounded,
                  label: 'Jami ishchi',
                  value: '$memberCount',
                ),
                const Divider(color: AppColors.border, height: 1, indent: 14),
                _InfoRow(
                  icon: Icons.task_alt_rounded,
                  label: 'Jami vazifalar',
                  value: '$taskCount',
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),

        // Upcoming tasks
        if (_upcomingTasks.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _SectionHeader(title: 'Yaqinlashgan muddatlar', count: _upcomingTasks.length),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
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
          ),
          const SizedBox(height: 16),
        ],

        // Recent transactions
        if (_recentTxs.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _SectionHeader(title: "So'nggi harakatlar", count: null),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                children: List.generate(_recentTxs.take(6).length, (i) {
                  final txList = _recentTxs.take(6).toList();
                  final tx = txList[i];
                  final userId = supabase.auth.currentUser?.id ?? '';
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
          ),
          const SizedBox(height: 16),
        ],

        // Archived / done projects
        if (_projects.any((p) => p.status == 'done')) ...[
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _SectionHeader(
              title: 'Yakunlangan',
              count: _projects.where((p) => p.status == 'done').length,
              action: TextButton(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProjectsScreen())).then((_) => _load()),
                child: const Text('Arxiv', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.accent)),
              ),
            ),
          ),
          const SizedBox(height: 8),
          for (final p in _projects.where((p) => p.status == 'done').take(3)) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: _ProjectTile(
                project: p,
                isPinned: false,
                isDone: true,
                onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: p))).then((_) => _load()),
                onLongPress: () => _openProjectMenu(p),
              ),
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

class _HeroActionBtn extends StatelessWidget {
  final String label;
  final String subtitle;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _HeroActionBtn({
    required this.label,
    required this.subtitle,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withOpacity(0.25)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 32, height: 32,
              decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, size: 18, color: Colors.white),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: color)),
                Text(subtitle, style: TextStyle(fontSize: 11, color: color.withOpacity(0.7))),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoRow({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.muted),
          const SizedBox(width: 10),
          Expanded(child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.text2))),
          Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.text)),
        ],
      ),
    );
  }
}

class _InfoRowProgress extends StatelessWidget {
  final IconData icon;
  final String label;
  final int progress;

  const _InfoRowProgress({required this.icon, required this.label, required this.progress});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.muted),
          const SizedBox(width: 10),
          Expanded(child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.text2))),
          Text('$progress%', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.text)),
          const SizedBox(width: 8),
          SizedBox(
            width: 60,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(
                value: (progress / 100).clamp(0.0, 1.0),
                minHeight: 6,
                backgroundColor: AppColors.border,
                valueColor: const AlwaysStoppedAnimation(AppColors.accent),
              ),
            ),
          ),
        ],
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
                    isDone ? 'Yakunlandi' : isOverdue ? "Muddati o'tgan" : 'Faol',
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
                      const Text('Qoldiq', style: TextStyle(fontSize: 10, color: AppColors.muted)),
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
          const Text("Loyiha yo'q", style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 4),
          const Text('Birinchi loyihangizni yarating', style: TextStyle(fontSize: 13, color: AppColors.muted), textAlign: TextAlign.center),
          const SizedBox(height: 16),
          ElevatedButton(onPressed: onAdd, child: const Text('Yaratish')),
        ],
      ),
    );
  }
}
