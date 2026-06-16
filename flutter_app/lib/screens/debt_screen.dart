import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/debt_repository.dart';
import '../theme/app_theme.dart';
import '../widgets/project_card.dart' show formatMoney;

class DebtScreen extends StatefulWidget {
  const DebtScreen({super.key});

  @override
  State<DebtScreen> createState() => _DebtScreenState();
}

class _DebtScreenState extends State<DebtScreen> {
  final _repo = DebtRepository();
  List<Debt> _debts = [];
  bool _loading = true;
  bool _showPaid = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final debts = await _repo.load();
    if (mounted) setState(() { _debts = debts; _loading = false; });
  }

  List<Debt> get _filtered {
    if (_showPaid) return _debts;
    return _debts.where((d) => !d.isPaid).toList();
  }

  num get _totalGave => _debts.where((d) => d.direction == DebtDirection.gave && !d.isPaid).fold(0, (s, d) => s + d.amount);
  num get _totalReceived => _debts.where((d) => d.direction == DebtDirection.received && !d.isPaid).fold(0, (s, d) => s + d.amount);

  Future<void> _openAdd() async {
    final nameCtrl = TextEditingController();
    final amountCtrl = TextEditingController();
    final noteCtrl = TextEditingController();
    var direction = DebtDirection.gave;
    var date = DateTime.now();

    final saved = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Qarz qo\'shish', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              const SizedBox(height: 16),
              // Direction toggle
              Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setSheet(() => direction = DebtDirection.gave),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: direction == DebtDirection.gave
                              ? const Color(0xFFF59E0B).withOpacity(0.18)
                              : AppColors.bg,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: direction == DebtDirection.gave
                                ? const Color(0xFFF59E0B)
                                : AppColors.border,
                          ),
                        ),
                        child: Column(
                          children: [
                            Icon(Icons.arrow_upward_rounded,
                              color: direction == DebtDirection.gave ? const Color(0xFFF59E0B) : AppColors.muted, size: 20),
                            const SizedBox(height: 4),
                            Text('Men berdim',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: direction == DebtDirection.gave ? const Color(0xFFF59E0B) : AppColors.muted,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setSheet(() => direction = DebtDirection.received),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: direction == DebtDirection.received
                              ? const Color(0xFF22C55E).withOpacity(0.18)
                              : AppColors.bg,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: direction == DebtDirection.received
                                ? const Color(0xFF22C55E)
                                : AppColors.border,
                          ),
                        ),
                        child: Column(
                          children: [
                            Icon(Icons.arrow_downward_rounded,
                              color: direction == DebtDirection.received ? const Color(0xFF22C55E) : AppColors.muted, size: 20),
                            const SizedBox(height: 4),
                            Text('Men oldim',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: direction == DebtDirection.received ? const Color(0xFF22C55E) : AppColors.muted,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(hintText: 'Kim (ism yoki kompaniya)'),
                textCapitalization: TextCapitalization.words,
              ),
              const SizedBox(height: 10),
              TextField(
                controller: amountCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(hintText: 'Summa (so\'m)'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: noteCtrl,
                decoration: const InputDecoration(hintText: 'Izoh (ixtiyoriy)'),
              ),
              const SizedBox(height: 10),
              InkWell(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: ctx,
                    initialDate: date,
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2100),
                  );
                  if (picked != null) setSheet(() => date = picked);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                  decoration: BoxDecoration(
                    border: Border.all(color: AppColors.border),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.calendar_today_outlined, size: 18, color: AppColors.muted),
                      const SizedBox(width: 10),
                      Text(DateFormat('dd.MM.yyyy').format(date), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () {
                  if (nameCtrl.text.trim().isEmpty) return;
                  if (num.tryParse(amountCtrl.text.trim()) == null) return;
                  Navigator.pop(ctx, true);
                },
                child: const Text('Saqlash'),
              ),
            ],
          ),
        ),
      ),
    );

    if (saved == true) {
      final amount = num.parse(amountCtrl.text.trim());
      await _repo.add(Debt(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        name: nameCtrl.text.trim(),
        amount: amount,
        direction: direction,
        date: date,
        izoh: noteCtrl.text.trim().isEmpty ? null : noteCtrl.text.trim(),
      ));
      _load();
    }
  }

  Future<void> _markPaid(Debt debt) async {
    await _repo.markPaid(debt.id);
    _load();
  }

  Future<void> _delete(Debt debt) async {
    await _repo.delete(debt.id);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    final net = _totalReceived - _totalGave;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: const Text('Qarz daftari'),
        actions: [
          TextButton(
            onPressed: () => setState(() => _showPaid = !_showPaid),
            child: Text(_showPaid ? 'Faollar' : "To'langan", style: const TextStyle(fontSize: 13)),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openAdd,
        child: const Icon(Icons.add_rounded),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: CustomScrollView(
                slivers: [
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      child: Column(
                        children: [
                          // Summary card
                          Container(
                            padding: const EdgeInsets.all(20),
                            decoration: BoxDecoration(
                              color: AppColors.card,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: AppColors.border),
                            ),
                            child: Column(
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: _SummaryItem(
                                        label: 'Men berdim',
                                        amount: _totalGave,
                                        color: const Color(0xFFF59E0B),
                                        icon: Icons.arrow_upward_rounded,
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: _SummaryItem(
                                        label: 'Men oldim',
                                        amount: _totalReceived,
                                        color: const Color(0xFF22C55E),
                                        icon: Icons.arrow_downward_rounded,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                const Divider(color: AppColors.border, height: 1),
                                const SizedBox(height: 12),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    const Text('Sof holat', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                                    Text(
                                      net == 0 ? 'Teng' : (net > 0 ? '+${formatMoney(net)}' : '-${formatMoney(net.abs())}'),
                                      style: TextStyle(
                                        fontWeight: FontWeight.w900,
                                        fontSize: 15,
                                        color: net >= 0 ? const Color(0xFF22C55E) : const Color(0xFFF59E0B),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          if (filtered.isEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 40),
                              child: Column(
                                children: [
                                  Icon(Icons.book_outlined, size: 48, color: AppColors.muted.withOpacity(0.5)),
                                  const SizedBox(height: 12),
                                  Text(
                                    _showPaid ? 'Hali qarz yo\'q' : "To'langan qarzlar yo'q",
                                    style: const TextStyle(color: AppColors.muted),
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                    sliver: SliverList(
                      delegate: SliverChildBuilderDelegate(
                        (ctx, i) {
                          final debt = filtered[i];
                          return _DebtCard(
                            debt: debt,
                            onMarkPaid: debt.isPaid ? null : () => _markPaid(debt),
                            onDelete: () => _delete(debt),
                          );
                        },
                        childCount: filtered.length,
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _SummaryItem extends StatelessWidget {
  final String label;
  final num amount;
  final Color color;
  final IconData icon;

  const _SummaryItem({required this.label, required this.amount, required this.color, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: color),
              const SizedBox(width: 6),
              Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
            ],
          ),
          const SizedBox(height: 6),
          Text(formatMoney(amount), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: color)),
          const Text("so'm", style: TextStyle(fontSize: 10, color: AppColors.muted)),
        ],
      ),
    );
  }
}

class _DebtCard extends StatelessWidget {
  final Debt debt;
  final VoidCallback? onMarkPaid;
  final VoidCallback onDelete;

  const _DebtCard({required this.debt, this.onMarkPaid, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final isGave = debt.direction == DebtDirection.gave;
    final color = isGave ? const Color(0xFFF59E0B) : const Color(0xFF22C55E);
    final isPaid = debt.isPaid;

    return Dismissible(
      key: Key('debt_${debt.id}'),
      direction: DismissDirection.endToStart,
      confirmDismiss: (_) async => true,
      onDismissed: (_) => onDelete(),
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          color: const Color(0xFFEF4444).withOpacity(0.85),
          borderRadius: BorderRadius.circular(16),
        ),
        child: const Icon(Icons.delete_outline_rounded, color: Colors.white, size: 24),
      ),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isPaid ? AppColors.card.withOpacity(0.4) : AppColors.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: isPaid ? AppColors.border.withOpacity(0.4) : color.withOpacity(0.25)),
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: isPaid ? AppColors.border.withOpacity(0.3) : color.withOpacity(0.15),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(
                isPaid ? Icons.check_circle_rounded : (isGave ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded),
                color: isPaid ? AppColors.muted : color,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    debt.name,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                      decoration: isPaid ? TextDecoration.lineThrough : null,
                      color: isPaid ? AppColors.muted : AppColors.text,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Text(
                        DateFormat('dd.MM.yyyy').format(debt.date),
                        style: const TextStyle(fontSize: 12, color: AppColors.muted),
                      ),
                      if (debt.izoh?.isNotEmpty == true) ...[
                        const Text(' • ', style: TextStyle(fontSize: 12, color: AppColors.muted)),
                        Expanded(
                          child: Text(
                            debt.izoh!,
                            style: const TextStyle(fontSize: 12, color: AppColors.muted),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  formatMoney(debt.amount),
                  style: TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 14,
                    color: isPaid ? AppColors.muted : color,
                    decoration: isPaid ? TextDecoration.lineThrough : null,
                  ),
                ),
                if (!isPaid && onMarkPaid != null) ...[
                  const SizedBox(height: 4),
                  GestureDetector(
                    onTap: onMarkPaid,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFF22C55E).withOpacity(0.15),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.3)),
                      ),
                      child: const Text("To'landi", style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF22C55E))),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}
