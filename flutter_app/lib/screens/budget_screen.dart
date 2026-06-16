import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/budget_repository.dart';
import '../data/transaction_repository.dart';
import '../models/project.dart';
import '../models/transaction.dart';
import '../theme/app_theme.dart';

class BudgetScreen extends StatefulWidget {
  final Project project;

  const BudgetScreen({super.key, required this.project});

  @override
  State<BudgetScreen> createState() => _BudgetScreenState();
}

class _BudgetScreenState extends State<BudgetScreen> {
  final _budgetRepo = BudgetRepository();
  final _txRepo = TransactionRepository();
  final _fmt = NumberFormat('#,###', 'uz');

  Map<String, num> _budgets = {};
  List<ProjectTransaction> _txs = [];
  bool _loading = true;

  static const _expenseCategories = [
    'Mehnat haqi',
    'Materiallar',
    'Transport',
    'Asbob-uskuna',
    'Kommunal',
    'Boshqa xarajat',
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final results = await Future.wait([
      _budgetRepo.loadBudgets(widget.project.id),
      _txRepo.loadForProject(widget.project.id),
    ]);
    if (mounted) {
      setState(() {
        _budgets = results[0] as Map<String, num>;
        _txs = results[1] as List<ProjectTransaction>;
        _loading = false;
      });
    }
  }

  Map<String, num> get _actualSpend {
    final map = <String, num>{};
    for (final tx in _txs) {
      if (tx.tur == 'spend') {
        map[tx.kategoriya] = (map[tx.kategoriya] ?? 0) + tx.summa;
      }
    }
    return map;
  }

  num get _totalBudget => _budgets.values.fold(0, (a, b) => a + b);
  num get _totalSpend => _actualSpend.values.fold(0, (a, b) => a + b);

  Future<void> _editBudget(String category) async {
    final ctrl = TextEditingController(text: _budgets[category]?.toString() ?? '');
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('$category — Byudjet belgilash', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            const SizedBox(height: 16),
            TextField(
              controller: ctrl,
              autofocus: true,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(hintText: 'Miqdor (so\'m)', suffixText: 'so\'m'),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Bekor'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    child: const Text('Saqlash'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
    if (saved == true) {
      final val = num.tryParse(ctrl.text.replaceAll(',', '').trim()) ?? 0;
      await _budgetRepo.setBudget(widget.project.id, category, val);
      _load();
    }
    ctrl.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final actual = _actualSpend;
    final totalBudget = _totalBudget;
    final totalSpend = _totalSpend;
    final overallProgress = totalBudget > 0 ? (totalSpend / totalBudget).clamp(0.0, 1.0) : 0.0;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Text('Byudjet — ${widget.project.nomi}'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                // Summary card
                _SummaryCard(
                  totalBudget: totalBudget,
                  totalSpend: totalSpend,
                  progress: overallProgress.toDouble(),
                  fmt: _fmt,
                ),
                const SizedBox(height: 16),

                // Category rows
                const Padding(
                  padding: EdgeInsets.only(bottom: 8),
                  child: Text('Kategoriyalar bo\'yicha', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.muted)),
                ),
                Container(
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    children: List.generate(_expenseCategories.length, (i) {
                      final cat = _expenseCategories[i];
                      final budget = _budgets[cat] ?? 0;
                      final spend = actual[cat] ?? 0;
                      final progress = budget > 0 ? (spend / budget).clamp(0.0, 1.0).toDouble() : 0.0;
                      final isOver = spend > budget && budget > 0;
                      return Column(
                        children: [
                          InkWell(
                            onTap: () => _editBudget(cat),
                            borderRadius: i == 0
                                ? const BorderRadius.vertical(top: Radius.circular(16))
                                : i == _expenseCategories.length - 1
                                    ? const BorderRadius.vertical(bottom: Radius.circular(16))
                                    : BorderRadius.zero,
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Text(cat, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                                      ),
                                      if (isOver)
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFFEF4444).withOpacity(0.15),
                                            borderRadius: BorderRadius.circular(6),
                                          ),
                                          child: const Text('Oshib ketdi', style: TextStyle(fontSize: 10, color: Color(0xFFEF4444), fontWeight: FontWeight.w700)),
                                        ),
                                      const SizedBox(width: 8),
                                      Icon(Icons.edit_rounded, size: 14, color: AppColors.muted.withOpacity(0.5)),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(
                                        'Xarajat: ${_fmt.format(spend)} so\'m',
                                        style: const TextStyle(fontSize: 12, color: AppColors.text2),
                                      ),
                                      Text(
                                        budget > 0 ? 'Limit: ${_fmt.format(budget)} so\'m' : 'Limit yo\'q',
                                        style: TextStyle(fontSize: 12, color: budget > 0 ? AppColors.muted : AppColors.muted.withOpacity(0.5)),
                                      ),
                                    ],
                                  ),
                                  if (budget > 0) ...[
                                    const SizedBox(height: 8),
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(4),
                                      child: LinearProgressIndicator(
                                        value: progress,
                                        minHeight: 5,
                                        backgroundColor: AppColors.border,
                                        valueColor: AlwaysStoppedAnimation(
                                          isOver ? const Color(0xFFEF4444) : progress > 0.8 ? const Color(0xFFF59E0B) : AppColors.accent,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      '${(progress * 100).round()}% ishlatildi',
                                      style: TextStyle(
                                        fontSize: 10,
                                        color: isOver ? const Color(0xFFEF4444) : AppColors.muted,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                          if (i < _expenseCategories.length - 1) const Divider(color: AppColors.border, height: 1, indent: 14),
                        ],
                      );
                    }),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Kategoriyaga bosib byudjet limitini belgilang',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 11, color: AppColors.muted),
                ),
              ],
            ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final num totalBudget;
  final num totalSpend;
  final double progress;
  final NumberFormat fmt;

  const _SummaryCard({
    required this.totalBudget,
    required this.totalSpend,
    required this.progress,
    required this.fmt,
  });

  @override
  Widget build(BuildContext context) {
    final remaining = totalBudget - totalSpend;
    final isOver = remaining < 0;
    final progressColor = progress >= 1.0
        ? const Color(0xFFEF4444)
        : progress >= 0.8
            ? const Color(0xFFF59E0B)
            : AppColors.accent;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Umumiy byudjet holati', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
          const SizedBox(height: 14),
          Row(
            children: [
              _StatCol(label: 'Belgilangan', value: fmt.format(totalBudget), unit: 'so\'m', color: AppColors.text),
              _StatCol(label: 'Sarflangan', value: fmt.format(totalSpend), unit: 'so\'m', color: const Color(0xFFEF4444)),
              _StatCol(
                label: isOver ? 'Ortiqcha' : 'Qolgan',
                value: fmt.format(remaining.abs()),
                unit: 'so\'m',
                color: isOver ? const Color(0xFFEF4444) : const Color(0xFF22C55E),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (totalBudget > 0) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('${(progress * 100).round()}% ishlatildi', style: const TextStyle(fontSize: 12, color: AppColors.text2)),
                Text(isOver ? 'Byudjet oshib ketdi!' : '', style: const TextStyle(fontSize: 11, color: Color(0xFFEF4444), fontWeight: FontWeight.w700)),
              ],
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: progress.clamp(0.0, 1.0),
                minHeight: 8,
                backgroundColor: AppColors.border,
                valueColor: AlwaysStoppedAnimation(progressColor),
              ),
            ),
          ] else
            const Text('Byudjet limitlari hali belgilanmagan', style: TextStyle(fontSize: 12, color: AppColors.muted)),
        ],
      ),
    );
  }
}

class _StatCol extends StatelessWidget {
  final String label;
  final String value;
  final String unit;
  final Color color;

  const _StatCol({required this.label, required this.value, required this.unit, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(label, style: const TextStyle(fontSize: 10, color: AppColors.muted), textAlign: TextAlign.center),
          const SizedBox(height: 4),
          Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: color), textAlign: TextAlign.center),
          Text(unit, style: const TextStyle(fontSize: 10, color: AppColors.muted), textAlign: TextAlign.center),
        ],
      ),
    );
  }
}
