import 'package:flutter/material.dart';

import '../data/project_repository.dart';
import '../main.dart';
import '../l10n/strings.dart';
import '../models/project.dart';
import '../theme/app_theme.dart';
import 'project_detail_screen.dart';
import '../widgets/shimmer.dart';

class ProjectsScreen extends StatefulWidget {
  static bool autoOpenCreate = false;
  const ProjectsScreen({super.key});

  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  final _repo = ProjectRepository();
  List<Project> _projects = [];
  Map<String, int> _memberCounts = {};
  bool _loading = true;
  String _search = '';
  String _filter = 'all'; // all, active, paused, done
  Map<String, DateTime> _lastActivities = {};
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
    try {
      final projects = await _repo.loadProjects();
      final ids = projects.map((p) => p.id).toList();
      final counts = await loadMemberCounts(ids);

      // Fetch last activity dates from transactions, tasks, materials in parallel
      final Map<String, DateTime> lastActivities = {};
      if (ids.isNotEmpty) {
        final List<dynamic> results = await Future.wait([
          supabase.from('transactions').select('ob_id, tx_date'),
          supabase.from('tasks').select('ob_id, created_at'),
          supabase.from('materials').select('ob_id, created_at'),
        ]);

        // Process transactions
        for (final row in results[0] as List) {
          final obId = row['ob_id']?.toString();
          final txDateStr = row['tx_date']?.toString();
          if (obId != null && txDateStr != null) {
            final date = DateTime.tryParse(txDateStr);
            if (date != null) {
              final current = lastActivities[obId];
              if (current == null || date.isAfter(current)) {
                lastActivities[obId] = date;
              }
            }
          }
        }

        // Process tasks
        for (final row in results[1] as List) {
          final obId = row['ob_id']?.toString();
          final createdAtStr = row['created_at']?.toString();
          if (obId != null && createdAtStr != null) {
            final date = DateTime.tryParse(createdAtStr);
            if (date != null) {
              final current = lastActivities[obId];
              if (current == null || date.isAfter(current)) {
                lastActivities[obId] = date;
              }
            }
          }
        }

        // Process materials
        for (final row in results[2] as List) {
          final obId = row['ob_id']?.toString();
          final createdAtStr = row['created_at']?.toString();
          if (obId != null && createdAtStr != null) {
            final date = DateTime.tryParse(createdAtStr);
            if (date != null) {
              final current = lastActivities[obId];
              if (current == null || date.isAfter(current)) {
                lastActivities[obId] = date;
              }
            }
          }
        }
      }

      if (!mounted) return;
      setState(() {
        _projects = projects;
        _memberCounts = counts;
        _lastActivities = lastActivities;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Project> get _filtered {
    var list = List<Project>.from(_projects);
    // status filter
    if (_filter == 'active') {
      list = list.where((p) => p.status == 'active').toList();
    } else if (_filter == 'paused') {
      list = list.where((p) => p.status == 'paused').toList();
    } else if (_filter == 'done') {
      list = list.where((p) => p.status == 'done').toList();
    }
    // search
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      list = list.where((p) =>
        p.nomi.toLowerCase().contains(q) ||
        (p.manzil ?? '').toLowerCase().contains(q) ||
        (p.mijoz ?? '').toLowerCase().contains(q)).toList();
    }

    // Sort:
    // 1. Finished projects (done) go last
    // 2. Otherwise sort by last activity descending (most recent first)
    list.sort((a, b) {
      final aDone = a.status == 'done';
      final bDone = b.status == 'done';
      if (aDone != bDone) {
        return aDone ? 1 : -1;
      }
      final aAct = _lastActivities[a.id] ?? a.createdAt;
      final bAct = _lastActivities[b.id] ?? b.createdAt;
      return bAct.compareTo(aAct);
    });

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
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(tr('new_project'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
                const SizedBox(height: 16),
                TextField(controller: nameCtrl, autofocus: true, decoration: InputDecoration(hintText: '${tr("project_name")} *')),
                const SizedBox(height: 12),
                InkWell(
                  onTap: () async {
                    final picked = await showDatePicker(context: ctx, initialDate: startDate, firstDate: DateTime(2020), lastDate: DateTime(2100));
                    if (picked != null) setSt(() => startDate = picked);
                  },
                  child: InputDecorator(
                    decoration: InputDecoration(labelText: tr('start_date'), prefixIcon: const Icon(Icons.calendar_today_rounded, size: 18)),
                    child: Text('${startDate.year}-${startDate.month.toString().padLeft(2, '0')}-${startDate.day.toString().padLeft(2, '0')}'),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(controller: daysCtrl, keyboardType: TextInputType.number, decoration: InputDecoration(hintText: tr('duration_days'), prefixIcon: const Icon(Icons.timer_outlined, size: 18))),
                const SizedBox(height: 12),
                TextField(controller: manzilCtrl, decoration: InputDecoration(hintText: '${tr("location")} ${tr("optional")}', prefixIcon: const Icon(Icons.location_on_outlined, size: 18))),
                const SizedBox(height: 12),
                TextField(controller: mijozCtrl, decoration: InputDecoration(hintText: '${tr("client")} ${tr("optional")}', prefixIcon: const Icon(Icons.person_outline_rounded, size: 18))),
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: () { if (nameCtrl.text.trim().isEmpty) return; Navigator.of(ctx).pop(true); },
                  child: Text(tr('create')),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    if (created == true) {
      await _repo.createProject(
        nomi: nameCtrl.text.trim(),
        boshlanish: startDate,
        muddat: int.tryParse(daysCtrl.text.trim()) ?? 30,
        manzil: manzilCtrl.text.trim(),
        mijoz: mijozCtrl.text.trim(),
      );
      _load();
    }
    Future.delayed(const Duration(milliseconds: 350), () {
      nameCtrl.dispose();
      daysCtrl.dispose();
      manzilCtrl.dispose();
      mijozCtrl.dispose();
    });
  }

  Future<void> _openProjectMenu(Project project) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
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
            title: Text(tr('cancel') == 'Bekor' ? "Nusxa ko'chirish" : "Duplicate"),
            onTap: () => Navigator.of(ctx).pop('duplicate'),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.delete_outline_rounded, color: AppColors.red),
            title: Text(tr('delete'), style: const TextStyle(color: AppColors.red)),
            onTap: () => Navigator.of(ctx).pop('delete'),
          ),
        ]),
      ),
    );
    if (action == null || !mounted) return;
    if (action == 'toggleDone') {
      await _repo.setStatus(project.id, project.status == 'done' ? 'active' : 'done');
      _load();
    } else if (action == 'duplicate') {
      await _repo.createProject(nomi: '${project.nomi} (nusxa)', muddat: project.muddat, manzil: project.manzil, mijoz: project.mijoz, boshlanish: DateTime.now());
      _load();
    } else if (action == 'delete') {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(tr('confirm_delete')),
          content: Text('${project.nomi} ${tr("no_undo")}'),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(tr('cancel'))),
            ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: AppColors.red, padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10)), onPressed: () => Navigator.of(ctx).pop(true), child: Text(tr('delete'))),
          ],
        ),
      );
      if (confirm == true) { await _repo.deleteProject(project.id); _load(); }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (ProjectsScreen.autoOpenCreate) {
      ProjectsScreen.autoOpenCreate = false;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _openAddProject();
      });
    }

    return ValueListenableBuilder<String>(
      valueListenable: appLocaleNotifier,
      builder: (_, __, ___) => Scaffold(
        backgroundColor: AppColors.bg,
        appBar: AppBar(
          backgroundColor: AppColors.bg,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          titleSpacing: 16,
          title: Text(tr('projects'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: AppColors.text)),
          actions: [
            IconButton(
              icon: Container(
                width: 36, height: 36,
                decoration: BoxDecoration(color: AppColors.accent, borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.add_rounded, color: Colors.white, size: 20),
              ),
              onPressed: _openAddProject,
            ),
            const SizedBox(width: 8),
          ],
        ),
        body: RefreshIndicator(
          onRefresh: _load,
          child: _loading
              ? _buildShimmerLoading()
              : CustomScrollView(
                  slivers: [
                    // Search
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                        child: TextField(
                          controller: _searchCtrl,
                          onChanged: (v) => setState(() => _search = v),
                          decoration: InputDecoration(
                            hintText: tr('search'),
                            prefixIcon: const Icon(Icons.search_rounded, color: AppColors.muted, size: 20),
                            suffixIcon: _search.isNotEmpty
                                ? IconButton(icon: const Icon(Icons.clear_rounded, size: 18), onPressed: () { _searchCtrl.clear(); setState(() => _search = ''); })
                                : null,
                            filled: true,
                            fillColor: Colors.white,
                            contentPadding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24),
                              borderSide: const BorderSide(color: AppColors.border),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24),
                              borderSide: const BorderSide(color: AppColors.border),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24),
                              borderSide: const BorderSide(color: AppColors.accent, width: 1.2),
                            ),
                          ),
                        ),
                      ),
                    ),

                    // Filter chips
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                        child: SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(children: [
                            _Chip(label: tr('all'),    selected: _filter == 'all',    onTap: () => setState(() => _filter = 'all')),
                            const SizedBox(width: 8),
                            _Chip(label: tr('active'), selected: _filter == 'active', onTap: () => setState(() => _filter = 'active'), color: AppColors.green),
                            const SizedBox(width: 8),
                            _Chip(label: tr('done'),   selected: _filter == 'done',   onTap: () => setState(() => _filter = 'done'), color: AppColors.muted),
                          ]),
                        ),
                      ),
                    ),

                    // Project cards
                    if (_filtered.isEmpty)
                      SliverFillRemaining(
                        child: Center(child: Text("${tr('projects')} yo'q", style: const TextStyle(color: AppColors.muted))),
                      )
                    else
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                        sliver: SliverList(
                          delegate: SliverChildBuilderDelegate(
                            (ctx, i) {
                              final p = _filtered[i];
                              final idx = _projects.indexOf(p);
                              return _ProjectCard(
                                project: p,
                                index: idx + 1,
                                memberCount: _memberCounts[p.id] ?? 0,
                                onTap: () async {
                                  await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: p)));
                                  _load();
                                },
                                onLongPress: () => _openProjectMenu(p),
                              );
                            },
                            childCount: _filtered.length,
                          ),
                        ),
                      ),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _buildShimmerLoading() {
    return Shimmer(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          ShimmerBox(height: 50, borderRadius: 24),
          SizedBox(height: 20),
          ShimmerBox(height: 140, borderRadius: 22),
          SizedBox(height: 12),
          ShimmerBox(height: 140, borderRadius: 22),
          SizedBox(height: 12),
          ShimmerBox(height: 140, borderRadius: 22),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color? color;

  const _Chip({required this.label, required this.selected, required this.onTap, this.color});

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.accent;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? c : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? c : AppColors.border),
        ),
        child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: selected ? Colors.white : AppColors.text2)),
      ),
    );
  }
}

class _ProjectCard extends StatelessWidget {
  final Project project;
  final int index;
  final int memberCount;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  const _ProjectCard({
    required this.project,
    required this.index,
    required this.memberCount,
    required this.onTap,
    required this.onLongPress,
  });

  List<Color> _gradient() {
    final gradients = [
      [const Color(0xFF1E3A5F), const Color(0xFF2563EB)],
      [const Color(0xFF064E3B), const Color(0xFF059669)],
      [const Color(0xFF7C2D12), const Color(0xFFDC2626)],
      [const Color(0xFF4C1D95), const Color(0xFF7C3AED)],
      [const Color(0xFF0C4A6E), const Color(0xFF0891B2)],
      [const Color(0xFF1E1B4B), const Color(0xFF4338CA)],
    ];
    final idx = project.id.codeUnits.fold(0, (a, b) => a + b) % gradients.length;
    return gradients[idx];
  }

  String _statusLabel() {
    return project.status == 'done' ? tr('done') : tr('active');
  }

  @override
  Widget build(BuildContext context) {
    final (_, left, progress) = project.schedule;
    final isDone = project.status == 'done';
    final gradient = _gradient();
    final indexLabel = '#${index.toString().padLeft(3, '0')}';

    return GestureDetector(
      onTap: onTap,
      onLongPress: onLongPress,
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        height: 200,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: gradient,
          ),
          image: project.imageUrl != null
              ? DecorationImage(image: NetworkImage(project.imageUrl!), fit: BoxFit.cover,
                  onError: (_, __) {},
                  colorFilter: ColorFilter.mode(Colors.black.withOpacity(0.35), BlendMode.darken))
              : null,
        ),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Colors.transparent, Colors.black.withOpacity(0.65)],
              stops: const [0.4, 1.0],
            ),
          ),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Top row: index badge + status badge
              Row(children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.35),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(indexLabel, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    color: isDone
                        ? Colors.white.withOpacity(0.15)
                        : const Color(0xFF10B981),
                    borderRadius: BorderRadius.circular(20),
                    border: isDone ? Border.all(color: Colors.white.withOpacity(0.2), width: 1) : null,
                  ),
                  child: Text(_statusLabel(), style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
                ),
              ]),
              const Spacer(),
              // Project name
              Text(project.nomi, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900), overflow: TextOverflow.ellipsis, maxLines: 1),
              const SizedBox(height: 8),
              // Progress
              Row(children: [
                Text('$progress%', style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700)),
                const SizedBox(width: 8),
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: (progress / 100).clamp(0.0, 1.0),
                      minHeight: 5,
                      backgroundColor: Colors.white.withOpacity(0.25),
                      valueColor: AlwaysStoppedAnimation(isDone ? AppColors.green : Colors.white),
                    ),
                  ),
                ),
              ]),
              const SizedBox(height: 10),
              // Bottom: workers + days
              Row(children: [
                // Avatar stack
                if (memberCount > 0) ...[
                  SizedBox(
                    width: memberCount.clamp(1, 3) * 18.0 + 10,
                    height: 22,
                    child: Stack(
                      children: List.generate(memberCount.clamp(1, 3), (i) => Positioned(
                        left: i * 14.0,
                        child: Container(
                          width: 22, height: 22,
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.3),
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 1.5),
                          ),
                          child: const Icon(Icons.person, size: 11, color: Colors.white),
                        ),
                      )),
                    ),
                  ),
                  const SizedBox(width: 6),
                ],
                Text('$memberCount ${tr("workers_count")}', style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w600)),
                const Spacer(),
                const Icon(Icons.calendar_today_rounded, size: 12, color: Colors.white70),
                const SizedBox(width: 4),
                Text(
                  isDone ? tr('days_left_done') : '$left ${tr("days_left")}',
                  style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ]),
            ],
          ),
        ),
      ),
    );
  }
}
