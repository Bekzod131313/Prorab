import 'package:flutter/material.dart';

import '../data/project_repository.dart';
import '../data/transaction_repository.dart';
import '../models/project.dart';
import '../models/transaction.dart';
import '../theme/app_theme.dart';
import '../widgets/pie_chart.dart';
import '../widgets/project_card.dart' show formatMoney;

class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  final _projectRepo = ProjectRepository();
  final _txRepo = TransactionRepository();
  List<Project> _projects = [];
  Map<String, List<ProjectTransaction>> _txsByProject = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final projects = await _projectRepo.loadProjects();
      final txFutures = projects.where((p) => p.role == 'owner').map((p) async {
        final txs = await _txRepo.loadForProject(p.id);
        return MapEntry(p.id, txs);
      });
      final entries = await Future.wait(txFutures);
      final txMap = Map<String, List<ProjectTransaction>>.fromEntries(entries);
      if (!mounted) return;
      setState(() {
        _projects = projects;
        _txsByProject = txMap;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Project> get _ownerProjects => _projects.where((p) => p.role == 'owner').toList();
  List<Project> get _active => _ownerProjects.where((p) => p.status != 'done').toList();
  List<Project> get _done => _ownerProjects.where((p) => p.status == 'done').toList();

  num get _totalKirim => _ownerProjects.fold(0, (s, p) => s + p.kirim);
  num get _totalChiqim => _ownerProjects.fold(0, (s, p) => s + p.chiqim);
  num get _totalBalance => _totalKirim - _totalChiqim;

  Map<String, num> get _byCategory {
    final map = <String, num>{};
    for (final txs in _txsByProject.values) {
      for (final tx in txs.where((t) => t.tur != 'income')) {
        final cat = tx.kategoriya ?? 'Boshqa';
        map[cat] = (map[cat] ?? 0) + tx.summa;
      }
    }
    final sorted = map.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    return Map.fromEntries(sorted);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(backgroundColor: AppColors.bg, title: const Text('Analitika')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                children: [
                  // Summary cards
                  Row(
                    children: [
                      _SummaryCard(label: 'Jami', value: '${_ownerProjects.length}', sub: 'Loyiha', color: AppColors.accent),
                      const SizedBox(width: 10),
                      _SummaryCard(label: 'Faol', value: '${_active.length}', sub: 'Loyiha', color: AppColors.green),
                      const SizedBox(width: 10),
                      _SummaryCard(label: 'Yakunlangan', value: '${_done.length}', sub: 'Loyiha', color: AppColors.muted),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // Financial summary
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Moliyaviy holat', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.muted)),
                        const SizedBox(height: 12),
                        _FinRow(label: 'Jami kirim', value: _totalKirim, color: AppColors.green, icon: Icons.arrow_downward_rounded),
                        const SizedBox(height: 8),
                        _FinRow(label: 'Jami chiqim', value: _totalChiqim, color: AppColors.red, icon: Icons.arrow_upward_rounded),
                        const Divider(color: AppColors.border, height: 20),
                        _FinRow(
                          label: 'Jami qoldiq',
                          value: _totalBalance,
                          color: _totalBalance >= 0 ? AppColors.green : AppColors.red,
                          icon: Icons.account_balance_rounded,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Category pie chart
                  if (_byCategory.isNotEmpty) ...[
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Xarajat kategoriyalari', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.muted)),
                          const SizedBox(height: 12),
                          MoliyaPieChart(
                            data: () {
                              final colors = [AppColors.accent, AppColors.accentTeal, AppColors.orange, AppColors.red, const Color(0xFF8B5CF6), AppColors.green];
                              int ci = 0;
                              return _byCategory.entries.map((e) => PieChartData(label: e.key, value: e.value.toDouble(), color: colors[ci++ % colors.length])).toList();
                            }(),
                          ),
                          const SizedBox(height: 12),
                          ..._byCategory.entries.map((e) {
                            final ratio = _totalChiqim > 0 ? e.value / _totalChiqim : 0.0;
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Row(
                                children: [
                                  Expanded(child: Text(e.key, style: const TextStyle(fontSize: 12, color: AppColors.text2))),
                                  Text('${formatMoney(e.value)} so\'m (${(ratio * 100).round()}%)', style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                                ],
                              ),
                            );
                          }),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],

                  // Per-project cards
                  if (_ownerProjects.isNotEmpty) ...[
                    const Padding(
                      padding: EdgeInsets.only(bottom: 8),
                      child: Text('Loyihalar bo\'yicha', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.muted)),
                    ),
                    ..._ownerProjects.map((p) {
                      final bal = p.kirim - p.chiqim;
                      return Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(child: Text(p.nomi, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: (p.status == 'done' ? AppColors.green : AppColors.accent).withOpacity(0.1),
                                    borderRadius: BorderRadius.circular(20),
                                  ),
                                  child: Text(p.status == 'done' ? 'Yakunlangan' : 'Faol',
                                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: p.status == 'done' ? AppColors.green : AppColors.accent)),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                _MiniStat(label: 'Kirim', value: p.kirim, color: AppColors.green),
                                _MiniStat(label: 'Chiqim', value: p.chiqim, color: AppColors.red),
                                _MiniStat(label: 'Qoldiq', value: bal, color: bal >= 0 ? AppColors.green : AppColors.red),
                              ],
                            ),
                          ],
                        ),
                      );
                    }),
                  ],
                ],
              ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final String label;
  final String value;
  final String sub;
  final Color color;
  const _SummaryCard({required this.label, required this.value, required this.sub, required this.color});
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
            const SizedBox(height: 4),
            Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
            Text(sub, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
          ],
        ),
      ),
    );
  }
}

class _FinRow extends StatelessWidget {
  final String label;
  final num value;
  final Color color;
  final IconData icon;
  const _FinRow({required this.label, required this.value, required this.color, required this.icon});
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 32, height: 32,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, size: 16, color: color),
        ),
        const SizedBox(width: 10),
        Expanded(child: Text(label, style: const TextStyle(fontSize: 12, color: AppColors.text2))),
        Text('${formatMoney(value)} so\'m', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: color)),
      ],
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final num value;
  final Color color;
  const _MiniStat({required this.label, required this.value, required this.color});
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(label, style: const TextStyle(fontSize: 10, color: AppColors.muted), textAlign: TextAlign.center),
          const SizedBox(height: 2),
          Text('${formatMoney(value)} so\'m', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color), textAlign: TextAlign.center),
        ],
      ),
    );
  }
}
