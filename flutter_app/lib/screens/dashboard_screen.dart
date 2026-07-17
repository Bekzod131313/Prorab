import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../l10n/strings.dart';
import '../data/project_repository.dart';
import '../models/project.dart';
import '../theme/app_theme.dart';
import 'project_detail_screen.dart';
import 'notifications_screen.dart';
import 'root_shell.dart';
import 'projects_screen.dart';
import '../widgets/shimmer.dart';

class DashboardScreen extends StatefulWidget {
  final bool isActive;
  const DashboardScreen({super.key, this.isActive = false});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final _repo = ProjectRepository();

  List<Project> _projects = [];
  bool _loading = true;

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
      if (!mounted) return;
      setState(() {
        _projects = projects.where((p) => p.status != 'done').toList();
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

  Future<void> _openQuickAdd(
      {required bool isIncome, Project? selectedProject}) async {
    Project? target = selectedProject;

    // If a specific project is already identified, go straight to it.
    if (target != null) {
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(
            builder: (_) =>
                ProjectDetailScreen(project: target!, quickAddIncome: isIncome)),
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
                        ? Text(p.manzil!,
                            style: const TextStyle(fontSize: 12))
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
              child: const Icon(Icons.notifications_none_rounded,
                  size: 20, color: AppColors.text2),
            ),
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const NotificationsScreen()),
              );
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
        // Hero PageView containing the slideable unit (card + buttons + info card)
        SizedBox(
          height: 560,
          child: PageView.builder(
            controller: _pageCtrl,
            itemCount: _projects.length,
            onPageChanged: (i) => setState(() => _currentPage = i),
            itemBuilder: (ctx, i) {
              final p = _projects[i];
              final gradient = _gradientForProject(p.id);
              final (_, left, prog) = p.schedule;
              final done = p.status == 'done';
              final indexLabel = '#${(i + 1).toString().padLeft(3, '0')}';
              
              final startFmt = p.boshlanish != null
                  ? DateFormat('dd.MM.yyyy').format(p.boshlanish!)
                  : '—';
              final endDate = p.boshlanish != null
                  ? p.boshlanish!.add(Duration(days: p.muddat))
                  : null;
              final endFmt =
                  endDate != null ? DateFormat('dd.MM.yyyy').format(endDate) : '—';

              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Top card
                  GestureDetector(
                    onTap: () => Navigator.of(context)
                        .push(MaterialPageRoute(
                            builder: (_) => ProjectDetailScreen(project: p)))
                        .then((_) => _load()),
                    child: Container(
                      height: 220,
                      margin: const EdgeInsets.symmetric(horizontal: 16),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(24),
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: gradient,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: gradient[0].withOpacity(0.25),
                            blurRadius: 12,
                            spreadRadius: -2,
                            offset: const Offset(0, 6),
                          ),
                        ],
                        image: p.imageUrl != null
                            ? DecorationImage(
                                image: NetworkImage(p.imageUrl!), fit: BoxFit.cover)
                            : null,
                      ),
                      child: Container(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(24),
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Colors.black
                                  .withOpacity(p.imageUrl != null ? 0.25 : 0.0),
                              Colors.black.withOpacity(0.65),
                            ],
                          ),
                        ),
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: Colors.white.withOpacity(0.18),
                                    borderRadius: BorderRadius.circular(30),
                                    border: Border.all(color: Colors.white.withOpacity(0.2), width: 1),
                                  ),
                                  child: Text(indexLabel,
                                      style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 11,
                                          fontWeight: FontWeight.w800,
                                          letterSpacing: 0.5)),
                                ),
                                const Spacer(),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 12, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: done
                                        ? Colors.white.withOpacity(0.15)
                                        : const Color(0xFF10B981),
                                    borderRadius: BorderRadius.circular(30),
                                    border: done ? Border.all(color: Colors.white.withOpacity(0.2), width: 1) : null,
                                  ),
                                  child: Text(
                                    done ? tr('done') : tr('active'),
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: 0.5),
                                  ),
                                ),
                              ],
                            ),
                            const Spacer(),
                            Text(
                              p.nomi,
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 20,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: -0.5),
                              overflow: TextOverflow.ellipsis,
                              maxLines: 1,
                            ),
                            const SizedBox(height: 8),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: LinearProgressIndicator(
                                value: (prog / 100).clamp(0.0, 1.0),
                                minHeight: 5,
                                backgroundColor: Colors.white.withOpacity(0.2),
                                valueColor:
                                    const AlwaysStoppedAnimation(Colors.white),
                              ),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                const Icon(Icons.calendar_today_rounded,
                                    size: 12, color: Colors.white70),
                                const SizedBox(width: 4),
                                Text(tr('days_remaining').replaceFirst('{}', '$left'),
                                    style: const TextStyle(
                                        color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w500)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
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
                            subtitle: tr('create'),
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
                            subtitle: tr('create'),
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
                          const Divider(color: AppColors.border, height: 1, indent: 56),
                          _InfoRow(
                            icon: Icons.access_time_rounded,
                            label: tr('completed'),
                            value: endFmt,
                          ),
                          const Divider(color: AppColors.border, height: 1, indent: 56),
                          _InfoRowProgress(
                            icon: Icons.bar_chart_rounded,
                            label: tr('progress'),
                            progress: prog.toInt(),
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
        const SizedBox(height: 12),

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
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.border),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.015),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                  color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, size: 18, color: color),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: color)),
                const SizedBox(height: 1),
                Text(subtitle,
                    style:
                        TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w500)),
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
                  style:
                      const TextStyle(fontSize: 13, color: AppColors.text2, fontWeight: FontWeight.w500))),
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

class _InfoRowProgress extends StatelessWidget {
  final IconData icon;
  final String label;
  final int progress;

  const _InfoRowProgress(
      {required this.icon, required this.label, required this.progress});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: AppColors.green.withOpacity(0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 16, color: AppColors.green),
          ),
          const SizedBox(width: 12),
          Expanded(
              child: Text(label,
                  style:
                      const TextStyle(fontSize: 13, color: AppColors.text2, fontWeight: FontWeight.w500))),
          Text('$progress%',
              style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.text)),
          const SizedBox(width: 10),
          SizedBox(
            width: 70,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: LinearProgressIndicator(
                value: (progress / 100).clamp(0.0, 1.0),
                minHeight: 6,
                backgroundColor: AppColors.border,
                valueColor: const AlwaysStoppedAnimation(AppColors.green),
              ),
            ),
          ),
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
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 16),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.accent,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
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
