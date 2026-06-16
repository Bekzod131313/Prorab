import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/project_repository.dart';
import '../models/project.dart';
import '../theme/app_theme.dart';
import '../widgets/project_card.dart' show formatMoney;
import 'project_detail_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

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
  void dispose() {
    _pageCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final projects = await _repo.loadProjects();
      if (!mounted) return;
      setState(() {
        _projects = projects;
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
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: _buildBody(),
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

    final currentProject = _currentPage < _projects.length ? _projects[_currentPage] : _projects.first;
    final (_, daysLeft, progress) = currentProject.schedule;
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
            itemCount: _projects.length,
            onPageChanged: (i) => setState(() => _currentPage = i),
            itemBuilder: (ctx, i) {
              final p = _projects[i];
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
                            const Icon(Icons.calendar_today_rounded, size: 12, color: Colors.white70),
                            const SizedBox(width: 4),
                            Text('$left kun qoldi', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                            const SizedBox(width: 12),
                            Text('${formatMoney(p.balance)} so\'m', style: TextStyle(
                              color: p.balance >= 0 ? Colors.greenAccent : Colors.redAccent,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            )),
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
          children: List.generate(_projects.length, (i) => AnimatedContainer(
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
                  icon: Icons.account_balance_wallet_outlined,
                  label: 'Balans',
                  value: '${formatMoney(currentProject.balance)} so\'m',
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
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
            width: 56, height: 56,
            decoration: BoxDecoration(color: AppColors.accent.withOpacity(0.1), shape: BoxShape.circle),
            child: const Icon(Icons.folder_open_rounded, size: 28, color: AppColors.accent),
          ),
          const SizedBox(height: 12),
          const Text("Loyiha yo'q", style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 4),
          const Text("Obyektlar bo'limidan yangi loyiha yarating", style: TextStyle(fontSize: 13, color: AppColors.muted), textAlign: TextAlign.center),
        ],
      ),
    );
  }
}
