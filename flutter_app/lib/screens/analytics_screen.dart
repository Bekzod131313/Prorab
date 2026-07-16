import 'package:flutter/material.dart';

import '../main.dart';
import '../data/project_repository.dart';
import '../data/transaction_repository.dart';
import '../models/project.dart';
import '../models/transaction.dart';
import '../theme/app_theme.dart';
import '../widgets/pie_chart.dart';
import '../widgets/project_card.dart' show formatUzsToDisplay;
import '../widgets/shimmer.dart';

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

  // Per-project selection
  Project? _selectedProject;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final userId = supabase.auth.currentUser?.id;
    try {
      final projects = await _projectRepo.loadProjects();
      final txFutures = projects.map((p) async {
        final txs = await _txRepo.loadForProject(p.id, createdBy: userId);
        return MapEntry(p.id, txs);
      });
      final entries = await Future.wait(txFutures);
      final txMap = Map<String, List<ProjectTransaction>>.fromEntries(entries);
      if (!mounted) return;
      setState(() {
        _projects = projects;
        _txsByProject = txMap;
        _loading = false;
        // Safely pre-select or update current selected project reference
        if (_myProjects.isNotEmpty) {
          if (_selectedProject == null || !_myProjects.contains(_selectedProject)) {
            _selectedProject = _myProjects.first;
          } else {
            _selectedProject = _myProjects.firstWhere((p) => p.id == _selectedProject!.id);
          }
        } else {
          _selectedProject = null;
        }
      });
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Project> get _myProjects => _projects;
  List<Project> get _active => _myProjects.where((p) => p.status != 'done').toList();
  List<Project> get _done => _myProjects.where((p) => p.status == 'done').toList();

  num get _totalKirim => _myProjects.fold(0, (s, p) => s + p.kirim);
  num get _totalChiqim => _myProjects.fold(0, (s, p) => s + p.chiqim);
  num get _totalBalance => _totalKirim - _totalChiqim;

  Map<String, num> get _byCategory {
    final map = <String, num>{};
    for (final txs in _txsByProject.values) {
      for (final tx in txs.where((t) => t.tur != 'income')) {
        final cat = tx.kategoriya ?? 'Boshqa';
        map[cat] = (map[cat] ?? 0) + tx.summaUzs;
      }
    }
    final sorted = map.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    return Map.fromEntries(sorted);
  }

  // ---------- per-project helpers ----------
  List<ProjectTransaction> get _selTxs =>
      _selectedProject != null ? (_txsByProject[_selectedProject!.id] ?? []) : [];

  Map<String, num> get _selByCategory {
    final map = <String, num>{};
    for (final tx in _selTxs.where((t) => t.tur != 'income')) {
      final cat = tx.kategoriya ?? 'Boshqa';
      map[cat] = (map[cat] ?? 0) + tx.summaUzs;
    }
    final sorted = map.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    return Map.fromEntries(sorted);
  }

  num get _selIncome => _selTxs.where((t) => t.tur == 'income').fold(0, (s, t) => s + t.summaUzs);
  num get _selSpend  => _selTxs.where((t) => t.tur != 'income').fold(0, (s, t) => s + t.summaUzs);

  static const _catColors = [
    Color(0xFF3B82F6),
    Color(0xFF14B8A6),
    Color(0xFFF97316),
    Color(0xFFEF4444),
    Color(0xFF8B5CF6),
    Color(0xFF22C55E),
    Color(0xFFEC4899),
    Color(0xFFF59E0B),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(backgroundColor: AppColors.bg, title: const Text('Analitika')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? _buildShimmerLoading()
            : ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                children: [
                  // Summary cards
                  Row(
                    children: [
                      _SummaryCard(label: 'Jami', value: '${_myProjects.length}', sub: 'Loyiha', color: AppColors.accent),
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

                  // Category pie chart (all projects)
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
                              int ci = 0;
                              return _byCategory.entries.map((e) => PieChartData(label: e.key, value: e.value.toDouble(), color: _catColors[ci++ % _catColors.length])).toList();
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
                                  Text('${formatUzsToDisplay(e.value)} (${(ratio * 100).round()}%)', style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                                ],
                              ),
                            );
                          }),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],

                  // ──────── Per-project statistics ────────
                  if (_myProjects.isNotEmpty) ...[
                    // Section header
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                      child: Row(
                        children: [
                          Container(
                            width: 3, height: 18,
                            decoration: BoxDecoration(color: AppColors.accent, borderRadius: BorderRadius.circular(2)),
                          ),
                          const SizedBox(width: 8),
                          const Text('Loyiha tahlili', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.text)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),

                    // Project picker
                    Container(
                      decoration: BoxDecoration(
                        color: AppColors.card,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: AppColors.border),
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<Project>(
                          value: _selectedProject,
                          isExpanded: true,
                          icon: const Icon(Icons.keyboard_arrow_down_rounded, color: AppColors.muted),
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.text),
                          dropdownColor: AppColors.card,
                          borderRadius: BorderRadius.circular(14),
                          items: _myProjects.map((p) => DropdownMenuItem(
                            value: p,
                            child: Text(p.nomi, overflow: TextOverflow.ellipsis),
                          )).toList(),
                          onChanged: (p) => setState(() => _selectedProject = p),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),

                    if (_selectedProject != null) _buildProjectStats(_selectedProject!),
                  ],
                ],
              ),
      ),
    );
  }

  Widget _buildProjectStats(Project p) {
    final txs = _selTxs;
    final income = _selIncome;
    final spend = _selSpend;
    final balance = income - spend;
    final byCat = _selByCategory;
    final (passed, left, progress) = p.schedule;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Financial overview
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(p.nomi, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: AppColors.text)),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: (p.status == 'done' ? AppColors.green : AppColors.accent).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      p.status == 'done' ? 'Yakunlangan' : 'Faol',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: p.status == 'done' ? AppColors.green : AppColors.accent),
                    ),
                  ),
                ],
              ),
              if (p.manzil != null) ...[
                const SizedBox(height: 4),
                Row(children: [
                  const Icon(Icons.location_on_outlined, size: 13, color: AppColors.muted),
                  const SizedBox(width: 4),
                  Text(p.manzil!, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                ]),
              ],
              if (p.mijoz != null) ...[
                const SizedBox(height: 2),
                Row(children: [
                  const Icon(Icons.person_outline_rounded, size: 13, color: AppColors.muted),
                  const SizedBox(width: 4),
                  Text(p.mijoz!, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                ]),
              ],
              const Divider(color: AppColors.border, height: 20),
              _FinRow(label: 'Kirim', value: income, color: AppColors.green, icon: Icons.arrow_downward_rounded),
              const SizedBox(height: 8),
              _FinRow(label: 'Chiqim', value: spend, color: AppColors.red, icon: Icons.arrow_upward_rounded),
              const Divider(color: AppColors.border, height: 20),
              _FinRow(
                label: 'Qoldiq',
                value: balance,
                color: balance >= 0 ? AppColors.green : AppColors.red,
                icon: Icons.account_balance_rounded,
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),

        // Timeline / Schedule
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Jadval', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.muted)),
              const SizedBox(height: 12),
              Row(
                children: [
                  _TimeChip(label: 'O\'tgan', value: '$passed kun', color: AppColors.orange),
                  const SizedBox(width: 8),
                  _TimeChip(label: 'Qolgan', value: left == 0 ? 'Muddati o\'tgan' : '$left kun', color: left == 0 ? AppColors.red : AppColors.green),
                  const SizedBox(width: 8),
                  _TimeChip(label: 'Muddat', value: '${p.muddat} kun', color: AppColors.accent),
                ],
              ),
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(
                  value: progress / 100,
                  minHeight: 8,
                  backgroundColor: AppColors.border,
                  color: progress >= 100 ? AppColors.red : AppColors.accent,
                ),
              ),
              const SizedBox(height: 6),
              Text('$progress% bajarildi', style: const TextStyle(fontSize: 11, color: AppColors.muted)),
            ],
          ),
        ),
        const SizedBox(height: 10),

        // Category breakdown for this project
        if (byCat.isNotEmpty) ...[
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
                    int ci = 0;
                    return byCat.entries.map((e) => PieChartData(label: e.key, value: e.value.toDouble(), color: _catColors[ci++ % _catColors.length])).toList();
                  }(),
                ),
                const SizedBox(height: 14),
                ...() {
                  int ci = 0;
                  return byCat.entries.map((e) {
                    final color = _catColors[ci++ % _catColors.length];
                    final ratio = spend > 0 ? e.value / spend : 0.0;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(width: 10, height: 10, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3))),
                              const SizedBox(width: 6),
                              Expanded(child: Text(e.key, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.text2))),
                              Text(formatUzsToDisplay(e.value), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.text)),
                            ],
                          ),
                          const SizedBox(height: 5),
                          Stack(
                            children: [
                              Container(height: 5, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(3))),
                              FractionallySizedBox(
                                widthFactor: ratio.clamp(0.0, 1.0),
                                child: Container(height: 5, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3))),
                              ),
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text('${(ratio * 100).round()}% umumiy xarajatdan', style: const TextStyle(fontSize: 10, color: AppColors.muted)),
                        ],
                      ),
                    );
                  }).toList();
                }(),
              ],
            ),
          ),
          const SizedBox(height: 10),
        ],

        // Transaction count summary
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Tranzaksiyalar', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.muted)),
              const SizedBox(height: 12),
              Row(
                children: [
                  _TxCountChip(label: 'Jami', count: txs.length, color: AppColors.accent),
                  const SizedBox(width: 8),
                  _TxCountChip(label: 'Kirim', count: txs.where((t) => t.tur == 'income').length, color: AppColors.green),
                  const SizedBox(width: 8),
                  _TxCountChip(label: 'Chiqim', count: txs.where((t) => t.tur != 'income').length, color: AppColors.red),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),

        // Health score
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Loyiha salomatligi', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.muted)),
              const SizedBox(height: 12),
              Row(
                children: [
                  _HealthGauge(score: p.healthScore),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          p.healthScore >= 80 ? 'Yaxshi holat' : p.healthScore >= 50 ? "O'rtacha holat" : 'Muammoli holat',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
                            color: p.healthScore >= 80 ? AppColors.green : p.healthScore >= 50 ? AppColors.orange : AppColors.red,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          p.healthScore >= 80
                              ? 'Loyiha belgilangan vaqt va byudjet doirasida'
                              : p.healthScore >= 50
                                  ? 'Bir qancha ko\'rsatkichlarni yaxshilash kerak'
                                  : 'Muddati o\'tgan yoki byudjetdan oshgan',
                          style: const TextStyle(fontSize: 11, color: AppColors.muted, height: 1.4),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
      ],
    );
  }

  Widget _buildShimmerLoading() {
    return Shimmer(
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
        children: const [
          Row(
            children: [
              Expanded(child: ShimmerBox(height: 70, borderRadius: 14)),
              SizedBox(width: 10),
              Expanded(child: ShimmerBox(height: 70, borderRadius: 14)),
            ],
          ),
          SizedBox(height: 24),
          ShimmerBox(height: 220, borderRadius: 18),
          SizedBox(height: 24),
          ShimmerBox(height: 180, borderRadius: 18),
        ],
      ),
    );
  }
}

// ─────────── Sub-widgets ───────────

class _SummaryCard extends StatelessWidget {
  final String label, value, sub;
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
          decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, size: 16, color: color),
        ),
        const SizedBox(width: 10),
        Expanded(child: Text(label, style: const TextStyle(fontSize: 12, color: AppColors.text2))),
        Text(formatUzsToDisplay(value), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: color)),
      ],
    );
  }
}

class _TimeChip extends StatelessWidget {
  final String label, value;
  final Color color;
  const _TimeChip({required this.label, required this.value, required this.color});
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Text(label, style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w600)),
            const SizedBox(height: 2),
            Text(value, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: color), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

class _TxCountChip extends StatelessWidget {
  final String label;
  final int count;
  final Color color;
  const _TxCountChip({required this.label, required this.count, required this.color});
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.15)),
        ),
        child: Column(
          children: [
            Text('$count', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color)),
            Text(label, style: const TextStyle(fontSize: 10, color: AppColors.muted)),
          ],
        ),
      ),
    );
  }

}

class _HealthGauge extends StatelessWidget {
  final int score;
  const _HealthGauge({required this.score});

  Color get _color => score >= 80 ? AppColors.green : score >= 50 ? AppColors.orange : AppColors.red;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 70, height: 70,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CircularProgressIndicator(
            value: score / 100,
            strokeWidth: 7,
            backgroundColor: AppColors.border,
            color: _color,
          ),
          Text('$score', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: _color)),
        ],
      ),
    );
  }
}
