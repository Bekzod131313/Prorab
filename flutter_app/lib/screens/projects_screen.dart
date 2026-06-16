import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/project_repository.dart';
import '../models/project.dart';
import '../theme/app_theme.dart';
import '../widgets/project_card.dart' show formatMoney;
import 'project_detail_screen.dart';

class ProjectsScreen extends StatefulWidget {
  const ProjectsScreen({super.key});

  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  final _repo = ProjectRepository();
  List<Project> _projects = [];
  bool _loading = true;
  String _search = '';
  bool _showDone = false;
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final projects = await _repo.loadProjects();
    if (!mounted) return;
    setState(() {
      _projects = projects;
      _loading = false;
    });
  }

  List<Project> get _active {
    var list = _projects.where((p) => p.status != 'done').toList();
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      list = list.where((p) =>
        p.nomi.toLowerCase().contains(q) ||
        (p.manzil ?? '').toLowerCase().contains(q) ||
        (p.mijoz ?? '').toLowerCase().contains(q)).toList();
    }
    return list;
  }

  List<Project> get _done {
    var list = _projects.where((p) => p.status == 'done').toList();
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      list = list.where((p) =>
        p.nomi.toLowerCase().contains(q) ||
        (p.manzil ?? '').toLowerCase().contains(q) ||
        (p.mijoz ?? '').toLowerCase().contains(q)).toList();
    }
    return list;
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
              const Text('Yangi loyiha', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
              const SizedBox(height: 16),
              TextField(controller: nameCtrl, autofocus: true, decoration: const InputDecoration(hintText: 'Loyiha nomi *')),
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
      );
      _load();
    }
    nameCtrl.dispose(); daysCtrl.dispose(); manzilCtrl.dispose(); mijozCtrl.dispose();
  }

  Future<void> _openProjectMenu(Project project) async {
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
            const SizedBox(height: 16),
            const Divider(color: AppColors.border),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(project.status == 'done' ? Icons.restart_alt_rounded : Icons.check_circle_outline_rounded, color: AppColors.green),
              title: Text(project.status == 'done' ? 'Faolga qaytarish' : 'Yakunlandi deb belgilash'),
              onTap: () => Navigator.of(ctx).pop('toggleDone'),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.copy_rounded, color: AppColors.muted),
              title: const Text("Nusxa ko'chirish"),
              onTap: () => Navigator.of(ctx).pop('duplicate'),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.delete_outline_rounded, color: AppColors.red),
              title: const Text('O\'chirish', style: TextStyle(color: AppColors.red)),
              onTap: () => Navigator.of(ctx).pop('delete'),
            ),
          ],
        ),
      ),
    );
    if (action == null || !mounted) return;
    if (action == 'toggleDone') {
      await _repo.setStatus(project.id, project.status == 'done' ? 'active' : 'done');
      _load();
    } else if (action == 'duplicate') {
      await _repo.createProject(
        nomi: '${project.nomi} (nusxa)',
        muddat: project.muddat,
        manzil: project.manzil,
        mijoz: project.mijoz,
        boshlanish: DateTime.now(),
      );
      _load();
    } else if (action == 'delete') {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('O\'chirilsinmi?'),
          content: Text('${project.nomi} o\'chiriladi. Bu amalni qaytarib bo\'lmaydi.'),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Bekor')),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.red),
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('O\'chirish'),
            ),
          ],
        ),
      );
      if (confirm == true) {
        await _repo.deleteProject(project.id);
        _load();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: const Text('Loyihalar'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded),
            color: AppColors.accent,
            onPressed: _openAddProject,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : CustomScrollView(
                slivers: [
                  // Search field (show if 3+ projects)
                  if (_projects.length >= 3)
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                        child: TextField(
                          controller: _searchCtrl,
                          onChanged: (v) => setState(() => _search = v),
                          decoration: InputDecoration(
                            hintText: 'Qidirish...',
                            prefixIcon: const Icon(Icons.search_rounded, size: 20),
                            suffixIcon: _search.isNotEmpty
                                ? IconButton(icon: const Icon(Icons.clear_rounded, size: 18), onPressed: () { _searchCtrl.clear(); setState(() => _search = ''); })
                                : null,
                          ),
                        ),
                      ),
                    ),

                  // Active projects
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                      child: Text('Faol (${_active.length})', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.muted)),
                    ),
                  ),

                  if (_active.isEmpty)
                    const SliverToBoxAdapter(
                      child: Center(
                        child: Padding(
                          padding: EdgeInsets.all(32),
                          child: Text('Faol loyihalar yo\'q', style: TextStyle(color: AppColors.muted)),
                        ),
                      ),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      sliver: SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (ctx, i) => _ProjectTile(
                            project: _active[i],
                            onTap: () async {
                              await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: _active[i])));
                              _load();
                            },
                            onLongPress: () => _openProjectMenu(_active[i]),
                          ),
                          childCount: _active.length,
                        ),
                      ),
                    ),

                  // Done projects (collapsible)
                  if (_done.isNotEmpty) ...[
                    SliverToBoxAdapter(
                      child: InkWell(
                        onTap: () => setState(() => _showDone = !_showDone),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                          child: Row(
                            children: [
                              Text('Yakunlangan (${_done.length})', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.muted)),
                              const SizedBox(width: 4),
                              Icon(_showDone ? Icons.keyboard_arrow_up_rounded : Icons.keyboard_arrow_down_rounded, size: 18, color: AppColors.muted),
                            ],
                          ),
                        ),
                      ),
                    ),
                    if (_showDone)
                      SliverPadding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        sliver: SliverList(
                          delegate: SliverChildBuilderDelegate(
                            (ctx, i) => _ProjectTile(
                              project: _done[i],
                              onTap: () async {
                                await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: _done[i])));
                                _load();
                              },
                              onLongPress: () => _openProjectMenu(_done[i]),
                            ),
                            childCount: _done.length,
                          ),
                        ),
                      ),
                  ],

                  const SliverToBoxAdapter(child: SizedBox(height: 32)),
                ],
              ),
      ),
    );
  }
}

class _ProjectTile extends StatelessWidget {
  final Project project;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  const _ProjectTile({required this.project, required this.onTap, required this.onLongPress});

  @override
  Widget build(BuildContext context) {
    final (_, left, progress) = project.schedule;
    final bal = project.balance;
    final balColor = bal >= 0 ? AppColors.green : AppColors.red;
    final isDone = project.status == 'done';

    return GestureDetector(
      onTap: onTap,
      onLongPress: onLongPress,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(project.nomi, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                ),
                if (isDone)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: AppColors.green.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
                    child: const Text('Yakunlangan', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.green)),
                  )
                else
                  Text('$left kun', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: left <= 3 ? AppColors.red : AppColors.muted)),
              ],
            ),
            if (project.manzil != null || project.mijoz != null) ...[
              const SizedBox(height: 4),
              Text(
                [project.manzil, project.mijoz].where((s) => s != null && s.isNotEmpty).join(' • '),
                style: const TextStyle(fontSize: 12, color: AppColors.muted),
              ),
            ],
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('${formatMoney(bal)} so\'m', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: balColor)),
                Text('$progress%', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
              ],
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: (progress / 100).clamp(0.0, 1.0),
                minHeight: 5,
                backgroundColor: AppColors.border,
                valueColor: AlwaysStoppedAnimation(isDone ? AppColors.green : AppColors.accent),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
