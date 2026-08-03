import 'package:flutter/material.dart';

import '../data/project_repository.dart';
import '../main.dart';
import '../l10n/strings.dart';
import '../models/project.dart';
import '../theme/app_theme.dart';
import 'project_detail_screen.dart';
import '../widgets/shimmer.dart';
import '../widgets/project_hero_card.dart';
import '../data/member_repository.dart';
import '../models/member.dart';
import '../utils/haptics.dart';

import 'create_project_screen.dart';

class ProjectsScreen extends StatefulWidget {
  static bool autoOpenCreate = false;
  const ProjectsScreen({super.key});

  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  final _repo = ProjectRepository();
  final _memberRepo = MemberRepository();
  List<Project> _projects = [];
  Map<String, int> _memberCounts = {};
  Map<String, List<ObMember>> _projectMembers = {};
  bool _loading = true;
  String _search = '';
  String _filter = 'all'; // all, active, paused, done
  Map<String, DateTime> _lastActivities = {};
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    projectUpdateNotifier.addListener(_onProjectUpdate);
    _load();
  }

  void _onProjectUpdate() {
    _load(silent: true);
  }

  @override
  void dispose() {
    projectUpdateNotifier.removeListener(_onProjectUpdate);
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent && _projects.isEmpty) {
      setState(() => _loading = true);
    }
    try {
      final projects = await _repo.loadProjects();
      final ids = projects.map((p) => p.id).toList();
      final counts = await loadMemberCounts(ids);

      final projectMembers = <String, List<ObMember>>{};
      await Future.wait(projects.map((p) async {
        try {
          projectMembers[p.id] = await _memberRepo.loadForProject(p.id);
        } catch (_) {}
      }));

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
        _projectMembers = projectMembers;
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
    final created = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const CreateProjectScreen()),
    );
    if (created == true) {
      _load();
    }
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
      AppHaptics.delete();
      final confirm = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(tr('confirm_delete')),
          content: Text('${project.nomi} ${tr("no_undo")}'),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(tr('cancel'))),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.red, padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10)),
              onPressed: () {
                AppHaptics.delete();
                Navigator.of(ctx).pop(true);
              },
              child: Text(tr('delete')),
            ),
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
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: ElevatedButton.icon(
                onPressed: _openAddProject,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.accent,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 0),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                icon: const Icon(Icons.add_rounded, size: 18, color: Colors.white),
                label: Text(
                  tr('new_project'),
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
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
                                members: _projectMembers[p.id] ?? [],
                                memberCount: _memberCounts[p.id] ?? 0,
                                onTap: () async {
                                  final changed = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: p)));
                                  if (changed == true) {
                                    _load(silent: true);
                                  }
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
  final List<ObMember> members;
  final int memberCount;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  const _ProjectCard({
    required this.project,
    required this.index,
    required this.members,
    required this.memberCount,
    required this.onTap,
    required this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    Widget card = ProjectHeroCard(
      project: project,
      members: members,
      memberCount: memberCount,
      height: 120,
      margin: const EdgeInsets.only(bottom: 14),
      onTap: onTap,
    );

    return GestureDetector(
      onLongPress: onLongPress,
      child: card,
    );
  }
}
