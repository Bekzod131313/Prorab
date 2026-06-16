import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/transaction_repository.dart';
import '../models/project.dart';
import '../models/transaction.dart';
import '../theme/app_theme.dart';

class AnalyticsScreen extends StatefulWidget {
  final Project project;

  const AnalyticsScreen({super.key, required this.project});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  final _txRepo = TransactionRepository();
  final _moneyFmt = NumberFormat('#,###', 'uz');
  final _dateFmt = DateFormat('dd MMM yyyy');

  List<ProjectTransaction> _txs = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final txs = await _txRepo.loadForProject(widget.project.id);
    if (mounted) setState(() { _txs = txs; _loading = false; });
  }

  // ---- Analytics helpers ----

  List<_MonthBucket> get _monthlyData {
    final map = <String, _MonthBucket>{};
    for (final tx in _txs) {
      final key = '${tx.date.year}-${tx.date.month.toString().padLeft(2, '0')}';
      map.putIfAbsent(key, () => _MonthBucket(tx.date.year, tx.date.month));
      if (tx.tur == 'income') {
        map[key]!.income += tx.summa;
      } else {
        map[key]!.spend += tx.summa;
      }
    }
    final list = map.values.toList()..sort((a, b) => a.year != b.year ? a.year - b.year : a.month - b.month);
    return list;
  }

  /// Average daily spend over the last 30 days
  double get _burnRate {
    final cutoff = DateTime.now().subtract(const Duration(days: 30));
    final recent = _txs.where((tx) => tx.tur != 'income' && tx.date.isAfter(cutoff));
    final total = recent.fold<num>(0, (s, tx) => s + tx.summa);
    return total / 30;
  }

  /// Estimated days until budget runs out (income - chiqim) / burn rate
  int? get _daysUntilDepleted {
    final burn = _burnRate;
    if (burn <= 0) return null;
    final remaining = widget.project.kirim - widget.project.chiqim;
    if (remaining <= 0) return 0;
    return (remaining / burn).round();
  }

  Map<String, num> get _byCategory {
    final map = <String, num>{};
    for (final tx in _txs.where((t) => t.tur != 'income')) {
      final cat = tx.kategoriya ?? 'Boshqa';
      map[cat] = (map[cat] ?? 0) + tx.summa;
    }
    final sorted = map.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    return Map.fromEntries(sorted);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        backgroundColor: AppColors.bg,
        appBar: AppBar(backgroundColor: AppColors.bg, title: Text('Tahlil — ${widget.project.nomi}')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final project = widget.project;
    final months = _monthlyData;
    final burn = _burnRate;
    final daysLeft = _daysUntilDepleted;
    final byCategory = _byCategory;
    final totalSpend = project.chiqim;
    final maxCatSpend = byCategory.values.isEmpty ? 1.0 : byCategory.values.first.toDouble();

    // Forecast: based on burn rate, when will project finish?
    final forecastDate = burn > 0
        ? DateTime.now().add(Duration(days: daysLeft ?? 0))
        : null;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Text('Tahlil — ${project.nomi}'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          // Burn rate card
          _SectionCard(
            title: 'Xarajat tezligi',
            child: Column(
              children: [
                _MetricRow(
                  label: 'Kunlik o\'rtacha xarajat (30 kun)',
                  value: '${_moneyFmt.format(burn.round())} so\'m/kun',
                  icon: Icons.local_fire_department_rounded,
                  iconColor: const Color(0xFFF59E0B),
                ),
                const Divider(color: AppColors.border, height: 20),
                _MetricRow(
                  label: 'Jami kirim',
                  value: '${_moneyFmt.format(project.kirim)} so\'m',
                  icon: Icons.arrow_downward_rounded,
                  iconColor: const Color(0xFF22C55E),
                ),
                const SizedBox(height: 8),
                _MetricRow(
                  label: 'Jami xarajat',
                  value: '${_moneyFmt.format(project.chiqim)} so\'m',
                  icon: Icons.arrow_upward_rounded,
                  iconColor: const Color(0xFFEF4444),
                ),
                const SizedBox(height: 8),
                _MetricRow(
                  label: 'Balans',
                  value: '${_moneyFmt.format(project.kirim - project.chiqim)} so\'m',
                  icon: Icons.account_balance_rounded,
                  iconColor: (project.kirim - project.chiqim) >= 0
                      ? const Color(0xFF22C55E)
                      : const Color(0xFFEF4444),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Forecast card
          if (burn > 0)
            _SectionCard(
              title: 'Prognoz',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (daysLeft != null && daysLeft > 0) ...[
                    _MetricRow(
                      label: 'Joriy tezlikda pul tugashi',
                      value: '$daysLeft kun ichida',
                      icon: Icons.hourglass_bottom_rounded,
                      iconColor: daysLeft < 30
                          ? const Color(0xFFEF4444)
                          : daysLeft < 60
                              ? const Color(0xFFF59E0B)
                              : AppColors.accent,
                    ),
                    if (forecastDate != null) ...[
                      const SizedBox(height: 8),
                      _MetricRow(
                        label: 'Taxminiy tugash sanasi',
                        value: _dateFmt.format(forecastDate),
                        icon: Icons.event_rounded,
                        iconColor: AppColors.accentTeal,
                      ),
                    ],
                  ] else
                    const _MetricRow(
                      label: 'Holat',
                      value: 'Balans sifr yoki manfiy',
                      icon: Icons.warning_amber_rounded,
                      iconColor: Color(0xFFEF4444),
                    ),

                  const Divider(color: AppColors.border, height: 20),

                  // Timeline comparison
                  Builder(builder: (_) {
                    final (passed, left, progress) = project.schedule;
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('Jadval: $passed / ${project.muddat} kun', style: const TextStyle(fontSize: 12, color: AppColors.text2)),
                            Text('$progress%', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: progress >= 100 ? const Color(0xFFEF4444) : AppColors.accent)),
                          ],
                        ),
                        const SizedBox(height: 6),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: (progress / 100).clamp(0.0, 1.0),
                            minHeight: 6,
                            backgroundColor: AppColors.border,
                            valueColor: AlwaysStoppedAnimation(
                              progress >= 100 ? const Color(0xFFEF4444) : AppColors.accent,
                            ),
                          ),
                        ),
                        if (left == 0)
                          const Padding(
                            padding: EdgeInsets.only(top: 6),
                            child: Text('Muddat tugagan!', style: TextStyle(fontSize: 11, color: Color(0xFFEF4444), fontWeight: FontWeight.w700)),
                          )
                        else
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Text('$left kun qoldi', style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                          ),
                      ],
                    );
                  }),
                ],
              ),
            ),
          if (burn > 0) const SizedBox(height: 12),

          // Monthly trend
          if (months.isNotEmpty) ...[
            _SectionCard(
              title: 'Oylik tendentsiya',
              child: Column(
                children: months.map((m) {
                  final maxVal = months.fold<num>(1, (mx, b) => mx > b.income ? mx : (mx > b.spend ? mx : b.spend));
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          DateFormat('MMM yyyy').format(DateTime(m.year, m.month)),
                          style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            const SizedBox(width: 4),
                            Expanded(
                              child: Column(
                                children: [
                                  _BarRow(label: 'Kirim', value: m.income, maxValue: maxVal, color: const Color(0xFF22C55E), fmt: _moneyFmt),
                                  const SizedBox(height: 3),
                                  _BarRow(label: 'Chiqim', value: m.spend, maxValue: maxVal, color: const Color(0xFFEF4444), fmt: _moneyFmt),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 12),
          ],

          // Spend by category
          if (byCategory.isNotEmpty)
            _SectionCard(
              title: 'Xarajat kategoriyalari',
              child: Column(
                children: byCategory.entries.map((e) {
                  final ratio = totalSpend > 0 ? e.value / totalSpend : 0.0;
                  final barRatio = e.value / maxCatSpend;
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(e.key, style: const TextStyle(fontSize: 12, color: AppColors.text2)),
                            Text(
                              '${_moneyFmt.format(e.value)} so\'m (${(ratio * 100).round()}%)',
                              style: const TextStyle(fontSize: 11, color: AppColors.muted),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: barRatio.clamp(0.0, 1.0).toDouble(),
                            minHeight: 5,
                            backgroundColor: AppColors.border,
                            valueColor: const AlwaysStoppedAnimation(AppColors.accent),
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
        ],
      ),
    );
  }
}

class _MonthBucket {
  final int year;
  final int month;
  num income = 0;
  num spend = 0;
  _MonthBucket(this.year, this.month);
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;

  const _SectionCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.muted)),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _MetricRow extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color iconColor;

  const _MetricRow({required this.label, required this.value, required this.icon, required this.iconColor});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 32,
          height: 32,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: iconColor.withOpacity(0.12),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 16, color: iconColor),
        ),
        const SizedBox(width: 10),
        Expanded(child: Text(label, style: const TextStyle(fontSize: 12, color: AppColors.text2))),
        Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
      ],
    );
  }
}

class _BarRow extends StatelessWidget {
  final String label;
  final num value;
  final num maxValue;
  final Color color;
  final NumberFormat fmt;

  const _BarRow({required this.label, required this.value, required this.maxValue, required this.color, required this.fmt});

  @override
  Widget build(BuildContext context) {
    final ratio = maxValue > 0 ? (value / maxValue).clamp(0.0, 1.0).toDouble() : 0.0;
    return Row(
      children: [
        SizedBox(width: 38, child: Text(label, style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.w600))),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: ratio,
              minHeight: 8,
              backgroundColor: AppColors.border,
              valueColor: AlwaysStoppedAnimation(color),
            ),
          ),
        ),
        const SizedBox(width: 6),
        SizedBox(
          width: 72,
          child: Text(
            '${fmt.format(value)} so\'m',
            style: const TextStyle(fontSize: 9, color: AppColors.muted),
            textAlign: TextAlign.right,
          ),
        ),
      ],
    );
  }
}
