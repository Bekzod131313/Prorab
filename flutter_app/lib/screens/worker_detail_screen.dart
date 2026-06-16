import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/transaction_repository.dart';
import '../main.dart';
import '../models/transaction.dart';
import '../models/worker.dart';
import '../theme/app_theme.dart';
import '../widgets/member_row.dart' show colorForName;
import '../widgets/project_card.dart' show formatMoney;

class WorkerDetailScreen extends StatefulWidget {
  final Worker worker;

  const WorkerDetailScreen({super.key, required this.worker});

  @override
  State<WorkerDetailScreen> createState() => _WorkerDetailScreenState();
}

class _WorkerDetailScreenState extends State<WorkerDetailScreen> {
  final _txRepo = TransactionRepository();
  final _dateFmt = DateFormat('dd MMM yyyy');
  List<ProjectTransaction> _payments = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    // Load transactions across all the worker's projects where they are the recipient
    final futures = widget.worker.obsList.map((ob) => _txRepo.loadForProject(ob.obId));
    final results = await Future.wait(futures);
    final all = results.expand((l) => l).where((tx) => tx.toUser == widget.worker.userId).toList();
    all.sort((a, b) => b.date.compareTo(a.date));
    if (mounted) setState(() { _payments = all; _loading = false; });
  }

  @override
  Widget build(BuildContext context) {
    final worker = widget.worker;
    final initials = worker.displayName.trim().isEmpty ? '?' : worker.displayName.trim()[0].toUpperCase();
    final color = colorForName(worker.displayName);
    final balans = worker.balans;
    final isPositive = balans > 0;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Text(worker.displayName),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                // Header card
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 26,
                            backgroundColor: color.withOpacity(0.2),
                            child: Text(initials, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20, color: color)),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(worker.displayName, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                                if (worker.kasb != null)
                                  Text(worker.kasb!, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                                Text('${worker.obsCount} ta loyiha', style: const TextStyle(fontSize: 12, color: AppColors.text2)),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      const Divider(color: AppColors.border, height: 1),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          _StatCol(label: 'Jami maosh', value: '${formatMoney(worker.ishaqi)} so\'m', color: AppColors.text),
                          _StatCol(label: 'Olingan', value: '${formatMoney(worker.olingan)} so\'m', color: const Color(0xFF22C55E)),
                          _StatCol(
                            label: isPositive ? 'Qarzdorlik' : 'Ortiqcha',
                            value: '${formatMoney(balans.abs())} so\'m',
                            color: isPositive ? const Color(0xFFF59E0B) : AppColors.muted,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Projects
                if (worker.obsList.isNotEmpty) ...[
                  const Padding(
                    padding: EdgeInsets.only(bottom: 8),
                    child: Text('Loyihalar', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.muted)),
                  ),
                  Container(
                    decoration: BoxDecoration(
                      color: AppColors.card,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      children: List.generate(worker.obsList.length, (i) {
                        final ob = worker.obsList[i];
                        return Column(
                          children: [
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(child: Text(ob.obNomi, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
                                  Text(
                                    '${formatMoney(ob.balans)} so\'m',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: ob.balans > 0 ? const Color(0xFFF59E0B) : AppColors.muted,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (i < worker.obsList.length - 1) const Divider(color: AppColors.border, height: 1, indent: 14),
                          ],
                        );
                      }),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // Payment history
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('To\'lovlar tarixi', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.muted)),
                      Text('${_payments.length} ta', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                    ],
                  ),
                ),
                if (_payments.isEmpty)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(32),
                      child: Text('To\'lovlar yo\'q', style: TextStyle(color: AppColors.muted, fontSize: 14)),
                    ),
                  )
                else
                  Container(
                    decoration: BoxDecoration(
                      color: AppColors.card,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      children: List.generate(_payments.length, (i) {
                        final tx = _payments[i];
                        return Column(
                          children: [
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                              child: Row(
                                children: [
                                  Container(
                                    width: 36,
                                    height: 36,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF22C55E).withOpacity(0.12),
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: const Icon(Icons.payments_rounded, size: 18, color: Color(0xFF22C55E)),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          tx.izoh ?? tx.kategoriya ?? 'To\'lov',
                                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                                        ),
                                        Text(
                                          _dateFmt.format(tx.date),
                                          style: const TextStyle(fontSize: 11, color: AppColors.muted),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Text(
                                    '+${formatMoney(tx.summa)} so\'m',
                                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF22C55E)),
                                  ),
                                ],
                              ),
                            ),
                            if (i < _payments.length - 1) const Divider(color: AppColors.border, height: 1, indent: 60),
                          ],
                        );
                      }),
                    ),
                  ),
              ],
            ),
    );
  }
}

class _StatCol extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _StatCol({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(label, style: const TextStyle(fontSize: 10, color: AppColors.muted), textAlign: TextAlign.center),
          const SizedBox(height: 4),
          Text(value, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color), textAlign: TextAlign.center),
        ],
      ),
    );
  }
}
