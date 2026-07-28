import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../l10n/strings.dart';
import '../data/project_repository.dart';
import '../models/project.dart';
import '../theme/app_theme.dart';
import 'project_detail_screen.dart';
import 'notifications_screen.dart';
import 'currencies_screen.dart';
import 'root_shell.dart';
import 'projects_screen.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../widgets/shimmer.dart';
import '../widgets/project_hero_card.dart';
import '../data/member_repository.dart';
import '../models/member.dart';

class DashboardScreen extends StatefulWidget {
  final bool isActive;
  const DashboardScreen({super.key, this.isActive = false});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final _repo = ProjectRepository();
  final _memberRepo = MemberRepository();

  List<Project> _projects = [];
  Map<String, List<ObMember>> _projectMembers = {};
  bool _loading = true;
  int _unreadNotifsCount = 0;

  final _pageCtrl = PageController();
  int _currentPage = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant DashboardScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isActive && !oldWidget.isActive) {
      _load();
    }
  }

  @override
  void dispose() {
    _pageCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (_projects.isEmpty) {
      setState(() => _loading = true);
    }
    try {
      final projects = await _repo.loadProjects();
      final activeProjects = projects.where((p) => p.status != 'done').toList();

      int unread = 0;
      final userId = Supabase.instance.client.auth.currentUser?.id;
      if (userId != null) {
        final countRes = await Supabase.instance.client
            .from('notifications')
            .select('id')
            .eq('user_id', userId)
            .eq('read', false);
        unread = (countRes as List).length;
      }

      final projectMembers = <String, List<ObMember>>{};
      await Future.wait(activeProjects.map((p) async {
        try {
          projectMembers[p.id] = await _memberRepo.loadForProject(p.id);
        } catch (_) {}
      }));

      if (!mounted) return;
      setState(() {
        _projects = activeProjects;
        _projectMembers = projectMembers;
        _unreadNotifsCount = unread;
        _loading = false;
        if (_currentPage >= _projects.length) {
          _currentPage = _projects.isNotEmpty ? 0 : 0;
          if (_pageCtrl.hasClients) {
            _pageCtrl.jumpToPage(_currentPage);
          }
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _openQuickAdd(
      {required bool isIncome, Project? selectedProject}) async {
    Project? target = selectedProject;

    // If a specific project is already identified, go straight to it.
    if (target != null) {
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(
            builder: (_) => ProjectDetailScreen(
                project: target!, quickAddIncome: isIncome)),
      );
      _load();
      return;
    }

    // No specific project — pick from owner active projects.
    final activeProjects = _projects
        .where((p) => p.role == 'owner' && p.status != 'done')
        .toList();
    if (activeProjects.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(tr('no_active_project'))));
      return;
    }
    if (activeProjects.length == 1) {
      target = activeProjects.first;
    } else {
      target = await showModalBottomSheet<Project>(
        context: context,
        backgroundColor: AppColors.card,
        shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        builder: (ctx) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                    isIncome
                        ? '${tr("income")} — ${tr("select_project")}'
                        : '${tr("expense")} — ${tr("select_project")}',
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 12),
                for (final p in activeProjects)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(p.nomi),
                    subtitle: p.manzil != null
                        ? Text(p.manzil!, style: const TextStyle(fontSize: 12))
                        : null,
                    trailing: const Icon(Icons.chevron_right_rounded,
                        color: AppColors.muted),
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
      MaterialPageRoute(
          builder: (_) =>
              ProjectDetailScreen(project: target!, quickAddIncome: isIncome)),
    );
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: appLocaleNotifier,
      builder: (_, __, ___) {
        return Scaffold(
          backgroundColor: AppColors.bg,
          appBar: AppBar(
            backgroundColor: AppColors.bg,
            surfaceTintColor: Colors.transparent,
            elevation: 0,
            titleSpacing: 16,
            title: Text(tr('home'),
                style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: AppColors.text)),
            actions: [
              IconButton(
                icon: Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.border),
                  ),
                  child: const Icon(Icons.currency_exchange_rounded,
                      size: 20, color: AppColors.text2),
                ),
                onPressed: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(
                        builder: (_) => const CurrenciesScreen()),
                  );
                  _load();
                },
              ),
              IconButton(
                icon: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: AppColors.card,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.border),
                      ),
                      child: const Icon(Icons.notifications_none_rounded,
                          size: 20, color: AppColors.text2),
                    ),
                    if (_unreadNotifsCount > 0)
                      Positioned(
                        right: -2,
                        top: -2,
                        child: Container(
                          padding: const EdgeInsets.all(2),
                          decoration: const BoxDecoration(
                            color: AppColors.red,
                            shape: BoxShape.circle,
                          ),
                          constraints: const BoxConstraints(
                            minWidth: 16,
                            minHeight: 16,
                          ),
                          child: Center(
                            child: Text(
                              '$_unreadNotifsCount',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 9,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
                onPressed: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(
                        builder: (_) => const NotificationsScreen()),
                  );
                  _load();
                },
              ),
              const SizedBox(width: 8),
            ],
          ),
          body: _loading
              ? _buildShimmerLoading()
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _buildBody(),
                ),
        );
      },
    );
  }

  Widget _buildShimmerLoading() {
    return Shimmer(
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
        children: const [
          ShimmerBox(height: 200, borderRadius: 24),
          SizedBox(height: 24),
          Row(
            children: [
              ShimmerBox(width: 80, height: 16),
              Spacer(),
              ShimmerBox(width: 40, height: 16),
            ],
          ),
          SizedBox(height: 16),
          ShimmerBox(height: 100, borderRadius: 16),
          SizedBox(height: 12),
          ShimmerBox(height: 100, borderRadius: 16),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_projects.isEmpty) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 24, 16, 100),
        children: [
          _EmptyProjectsCard(),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(0, 8, 0, 100),
      children: [
        // Project Selector Overview bar (allows quick tap/scroll between projects)
        _ProjectSelectorOverviewBar(
          projects: _projects,
          currentPage: _currentPage,
          pageController: _pageCtrl,
        ),

        // Hero PageView containing the slideable unit (card + buttons + info card)
        SizedBox(
          height: 510,
          child: PageView.builder(
            controller: _pageCtrl,
            itemCount: _projects.length,
            onPageChanged: (i) => setState(() => _currentPage = i),
            itemBuilder: (ctx, i) {
              final p = _projects[i];

              final startFmt = p.boshlanish != null
                  ? DateFormat('dd.MM.yyyy').format(p.boshlanish!)
                  : '—';
              final endDate = p.boshlanish != null
                  ? p.boshlanish!.add(Duration(days: p.muddat))
                  : null;
              final endFmt = endDate != null
                  ? DateFormat('dd.MM.yyyy').format(endDate)
                  : '—';

              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Top card
                  ProjectHeroCard(
                    project: p,
                    members: _projectMembers[p.id] ?? [],
                    margin: const EdgeInsets.symmetric(horizontal: 16),
                    onTap: () async {
                      final changed = await Navigator.of(context).push<bool>(
                          MaterialPageRoute(
                              builder: (_) => ProjectDetailScreen(project: p)));
                      if (changed == true) {
                        _load();
                      }
                    },
                  ),
                  const SizedBox(height: 20),

                  // Two action buttons
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: [
                        Expanded(
                          child: _HeroActionBtn(
                            label: tr('income'),
                            subtitle: tr('add'),
                            icon: Icons.arrow_downward_rounded,
                            color: AppColors.accent,
                            onTap: () => _openQuickAdd(
                              isIncome: true,
                              selectedProject: p,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _HeroActionBtn(
                            label: tr('expense'),
                            subtitle: tr('add'),
                            icon: Icons.arrow_upward_rounded,
                            color: AppColors.green,
                            onTap: () => _openQuickAdd(
                              isIncome: false,
                              selectedProject: p,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Project info card for current project
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.card,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: AppColors.border),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.015),
                            blurRadius: 16,
                            offset: const Offset(0, 6),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
                            child: Row(
                              children: [
                                Container(
                                  width: 4,
                                  height: 16,
                                  decoration: BoxDecoration(
                                    color: AppColors.accent,
                                    borderRadius: BorderRadius.circular(2),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(tr('project_info'),
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 14,
                                        color: AppColors.text)),
                              ],
                            ),
                          ),
                          const Divider(color: AppColors.border, height: 1),
                          _InfoRow(
                            icon: Icons.calendar_today_rounded,
                            label: tr('start_date'),
                            value: startFmt,
                          ),
                          const Divider(
                              color: AppColors.border, height: 1, indent: 56),
                          _InfoRow(
                            icon: Icons.access_time_rounded,
                            label: tr('completed'),
                            value: endFmt,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
        const SizedBox(height: 10),

        // Page indicator dots
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(
              _projects.length,
              (i) => AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    width: i == _currentPage ? 20 : 6,
                    height: 6,
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    decoration: BoxDecoration(
                      color: i == _currentPage
                          ? AppColors.accent
                          : AppColors.border,
                      borderRadius: BorderRadius.circular(10),
                    ),
                  )),
        ),

        // Stationary hint text at the very bottom of the screen
        if (_projects.length > 1) ...[
          const SizedBox(height: 8),
          Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.swap_horiz_rounded,
                    size: 14, color: AppColors.muted.withOpacity(0.7)),
                const SizedBox(width: 4),
                Text(
                  tr('swipe_page_hint'),
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: AppColors.muted.withOpacity(0.8),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
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
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 16),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withOpacity(0.35), width: 1.5),
          boxShadow: [
            BoxShadow(
              color: color.withOpacity(0.1),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: color.withOpacity(0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, size: 22, color: color),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                      color: color,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.muted,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProjectSelectorOverviewBar extends StatelessWidget {
  final List<Project> projects;
  final int currentPage;
  final PageController pageController;

  const _ProjectSelectorOverviewBar({
    required this.projects,
    required this.currentPage,
    required this.pageController,
  });

  @override
  Widget build(BuildContext context) {
    if (projects.length <= 1) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SizedBox(
        height: 44,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: projects.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (ctx, i) {
            final selected = currentPage == i;
            final p = projects[i];
            return InkWell(
              onTap: () {
                pageController.animateToPage(
                  i,
                  duration: const Duration(milliseconds: 300),
                  curve: Curves.easeInOut,
                );
              },
              borderRadius: BorderRadius.circular(14),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: selected ? AppColors.accent : AppColors.card,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: selected ? AppColors.accent : AppColors.border,
                    width: selected ? 1.5 : 1,
                  ),
                  boxShadow: selected
                      ? [
                          BoxShadow(
                            color: AppColors.accent.withOpacity(0.25),
                            blurRadius: 6,
                            offset: const Offset(0, 3),
                          ),
                        ]
                      : null,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      selected ? Icons.folder_rounded : Icons.folder_outlined,
                      size: 18,
                      color: selected ? Colors.white : AppColors.accent,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      p.nomi,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight:
                            selected ? FontWeight.w900 : FontWeight.w700,
                        color: selected ? Colors.white : AppColors.text,
                      ),
                    ),
                    if (selected) ...[
                      const SizedBox(width: 6),
                      const Icon(Icons.check_circle_rounded,
                          size: 16, color: Colors.white),
                    ],
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoRow(
      {required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final isStart = icon == Icons.calendar_today_rounded;
    final color = isStart ? AppColors.accent : AppColors.orange;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: color.withOpacity(0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 16, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
              child: Text(label,
                  style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.text2,
                      fontWeight: FontWeight.w500))),
          Text(value,
              style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.text)),
        ],
      ),
    );
  }
}

class _EmptyProjectsCard extends StatelessWidget {
  const _EmptyProjectsCard();

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
            width: 56,
            height: 56,
            decoration: BoxDecoration(
                color: AppColors.accent.withOpacity(0.1),
                shape: BoxShape.circle),
            child: const Icon(Icons.folder_open_rounded,
                size: 28, color: AppColors.accent),
          ),
          const SizedBox(height: 12),
          Text(tr('no_projects'),
              style:
                  const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 16),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.accent,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)),
              elevation: 0,
            ),
            onPressed: () {
              ProjectsScreen.autoOpenCreate = true;
              RootShell.of(context)?.setIndex(1);
            },
            child: Text(
              tr('create'),
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 14,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
