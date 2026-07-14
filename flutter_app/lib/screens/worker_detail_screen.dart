import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/transaction_repository.dart';
import '../data/worker_repository.dart';
import '../models/transaction.dart';
import '../models/worker.dart';
import '../theme/app_theme.dart';
import '../widgets/member_row.dart' show colorForName;
import '../widgets/project_card.dart' show formatMoney, formatUzsToDisplay, formatTransactionAmount;
import '../services/currency_service.dart';
import '../widgets/shimmer.dart';
import '../utils/price_formatter.dart';
import '../utils/phone_formatter.dart';

class WorkerDetailScreen extends StatefulWidget {
  final Worker worker;

  const WorkerDetailScreen({super.key, required this.worker});

  @override
  State<WorkerDetailScreen> createState() => _WorkerDetailScreenState();
}

class _WorkerDetailScreenState extends State<WorkerDetailScreen> {
  final _txRepo = TransactionRepository();
  final _dateFmt = DateFormat('dd.MM.yyyy');
  final _timeFmt = DateFormat('HH:mm');
  List<ProjectTransaction> _payments = [];
  bool _loading = true;
  late Worker _worker;

  @override
  void initState() {
    super.initState();
    _worker = widget.worker;
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final refreshedList = await WorkerRepository().loadAll();
      final updated = refreshedList.firstWhere(
          (w) => w.userId == widget.worker.userId,
          orElse: () => _worker);
      final futures =
          updated.obsList.map((ob) => _txRepo.loadForProject(ob.obId));
      final results = await Future.wait(futures);
      final all = results
          .expand((l) => l)
          .where((tx) => tx.toUser == updated.userId)
          .toList();
      all.sort((a, b) => b.date.compareTo(a.date));
      if (mounted) {
        setState(() {
          _payments = all;
          _worker = updated;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openAvansBerishSheet() async {
    final amountCtrl = TextEditingController();
    final noteCtrl = TextEditingController();
    WorkerProject? selectedOb =
        _worker.obsList.isNotEmpty ? _worker.obsList.first : null;
    DateTime selectedDate = DateTime.now();
    String selectedCurrencyCode = CurrencyService().displayCurrency;

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => Padding(
          padding: EdgeInsets.only(
              left: 20,
              right: 20,
              top: 24,
              bottom: 24 + MediaQuery.of(context).viewInsets.bottom),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 20),
                    decoration: BoxDecoration(
                        color: AppColors.border,
                        borderRadius: BorderRadius.circular(2)),
                  ),
                ),
                Text(
                  "Avans berish",
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w900, fontSize: 18),
                ),
                const SizedBox(height: 16),
                const Text("Kimga berilmoqda?",
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                        color: AppColors.text2)),
                const SizedBox(height: 6),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  decoration: BoxDecoration(
                    color: AppColors.bg,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Text(_worker.displayName,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 14)),
                ),
                const SizedBox(height: 16),
                const Text("Qaysi obyekt uchun?",
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                        color: AppColors.text2)),
                const SizedBox(height: 6),
                if (_worker.obsList.isEmpty)
                  const Text("Ishchi hech qaysi obyektda yo'q",
                      style: TextStyle(color: AppColors.red, fontSize: 13))
                else
                  DropdownButtonFormField<WorkerProject>(
                    value: selectedOb,
                    decoration: const InputDecoration(
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 12, vertical: 10)),
                    items: _worker.obsList.map((op) {
                      return DropdownMenuItem<WorkerProject>(
                        value: op,
                        child: Text(op.obNomi,
                            style: const TextStyle(
                                fontSize: 14, fontWeight: FontWeight.w600)),
                      );
                    }).toList(),
                    onChanged: (val) => setSt(() => selectedOb = val),
                  ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: ChoiceChip(
                        label: const Text('so\'m (UZS)'),
                        selected: selectedCurrencyCode == 'UZS',
                        onSelected: (val) {
                          if (val) setSt(() => selectedCurrencyCode = 'UZS');
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ChoiceChip(
                        label: const Text('Dollar (USD)'),
                        selected: selectedCurrencyCode == 'USD',
                        onSelected: (val) {
                          if (val) setSt(() => selectedCurrencyCode = 'USD');
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: amountCtrl,
                  keyboardType: TextInputType.number,
                  inputFormatters: [PriceInputFormatter()],
                  decoration: InputDecoration(
                      hintText: selectedCurrencyCode == 'UZS' ? "Miqdor (so'm)" : "Miqdor (\$)",
                      prefixIcon:
                          const Icon(Icons.payments_outlined, size: 18)),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: noteCtrl,
                  decoration: const InputDecoration(
                      hintText: "Izoh (ixtiyoriy)",
                      prefixIcon: Icon(Icons.description_outlined, size: 18)),
                ),
                const SizedBox(height: 16),
                const Text("Sana",
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                        color: AppColors.text2)),
                const SizedBox(height: 6),
                GestureDetector(
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: selectedDate,
                      firstDate: DateTime(2020),
                      lastDate: DateTime(2100),
                    );
                    if (picked != null) {
                      setSt(() => selectedDate = picked);
                    }
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 12),
                    decoration: BoxDecoration(
                      color: AppColors.bg,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(_dateFmt.format(selectedDate),
                            style: const TextStyle(
                                fontWeight: FontWeight.w600, fontSize: 14)),
                        const Icon(Icons.calendar_month_outlined,
                            size: 18, color: AppColors.muted),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () {
                    if (amountCtrl.text.trim().isEmpty || selectedOb == null) {
                      return;
                    }
                    Navigator.of(context).pop(true);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFEA580C),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                  ),
                  child: const Text("Tasdiqlash",
                      style: TextStyle(fontWeight: FontWeight.w800)),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    if (confirmed == true && selectedOb != null) {
      final amount = num.tryParse(amountCtrl.text.replaceAll(' ', '')) ?? 0;
      if (amount <= 0) return;
      try {
        await WorkerRepository().giveAvans(
          obId: selectedOb!.obId,
          toUserId: _worker.userId,
          amount: amount,
          izoh: noteCtrl.text.trim(),
          txDate: selectedDate,
          currency: selectedCurrencyCode,
        );
        _load();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(e.toString())));
        }
      }
    }

    amountCtrl.dispose();
    noteCtrl.dispose();
  }

  Future<void> _openIshHaqiYozishSheet() async {
    final amountCtrl = TextEditingController();
    final noteCtrl = TextEditingController();
    WorkerProject? selectedOb =
        _worker.obsList.isNotEmpty ? _worker.obsList.first : null;
    DateTime selectedDate = DateTime.now();
    String selectedCurrencyCode = CurrencyService().displayCurrency;

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => Padding(
          padding: EdgeInsets.only(
              left: 20,
              right: 20,
              top: 24,
              bottom: 24 + MediaQuery.of(context).viewInsets.bottom),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 20),
                    decoration: BoxDecoration(
                        color: AppColors.border,
                        borderRadius: BorderRadius.circular(2)),
                  ),
                ),
                Text(
                  "Ish haqi yozish",
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w900, fontSize: 18),
                ),
                const SizedBox(height: 16),
                const Text("Kimga yozilmoqda?",
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                        color: AppColors.text2)),
                const SizedBox(height: 6),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  decoration: BoxDecoration(
                    color: AppColors.bg,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Text(_worker.displayName,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 14)),
                ),
                const SizedBox(height: 16),
                const Text("Qaysi obyekt uchun?",
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                        color: AppColors.text2)),
                const SizedBox(height: 6),
                if (_worker.obsList.isEmpty)
                  const Text("Ishchi hech qaysi obyektda yo'q",
                      style: TextStyle(color: AppColors.red, fontSize: 13))
                else
                  DropdownButtonFormField<WorkerProject>(
                    value: selectedOb,
                    decoration: const InputDecoration(
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 12, vertical: 10)),
                    items: _worker.obsList.map((op) {
                      return DropdownMenuItem<WorkerProject>(
                        value: op,
                        child: Text(op.obNomi,
                            style: const TextStyle(
                                fontSize: 14, fontWeight: FontWeight.w600)),
                      );
                    }).toList(),
                    onChanged: (val) => setSt(() => selectedOb = val),
                  ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: ChoiceChip(
                        label: const Text('so\'m (UZS)'),
                        selected: selectedCurrencyCode == 'UZS',
                        onSelected: (val) {
                          if (val) setSt(() => selectedCurrencyCode = 'UZS');
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ChoiceChip(
                        label: const Text('Dollar (USD)'),
                        selected: selectedCurrencyCode == 'USD',
                        onSelected: (val) {
                          if (val) setSt(() => selectedCurrencyCode = 'USD');
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: amountCtrl,
                  keyboardType: TextInputType.number,
                  inputFormatters: [PriceInputFormatter()],
                  decoration: InputDecoration(
                      hintText: selectedCurrencyCode == 'UZS' ? "Miqdor (so'm)" : "Miqdor (\$)",
                      prefixIcon:
                          const Icon(Icons.payments_outlined, size: 18)),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: noteCtrl,
                  decoration: const InputDecoration(
                      hintText: "Izoh (ixtiyoriy)",
                      prefixIcon: Icon(Icons.description_outlined, size: 18)),
                ),
                const SizedBox(height: 16),
                const Text("Sana",
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                        color: AppColors.text2)),
                const SizedBox(height: 6),
                GestureDetector(
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: selectedDate,
                      firstDate: DateTime(2020),
                      lastDate: DateTime(2100),
                    );
                    if (picked != null) {
                      setSt(() => selectedDate = picked);
                    }
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 12),
                    decoration: BoxDecoration(
                      color: AppColors.bg,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(_dateFmt.format(selectedDate),
                            style: const TextStyle(
                                fontWeight: FontWeight.w600, fontSize: 14)),
                        const Icon(Icons.calendar_month_outlined,
                            size: 18, color: AppColors.muted),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () {
                    if (amountCtrl.text.trim().isEmpty || selectedOb == null) {
                      return;
                    }
                    Navigator.of(context).pop(true);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF16A34A),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                  ),
                  child: const Text("Tasdiqlash",
                      style: TextStyle(fontWeight: FontWeight.w800)),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    if (confirmed == true && selectedOb != null) {
      final amount = num.tryParse(amountCtrl.text.replaceAll(' ', '')) ?? 0;
      if (amount <= 0) return;
      try {
        await WorkerRepository().giveIshHaqi(
          obId: selectedOb!.obId,
          toUserId: _worker.userId,
          amount: amount,
          izoh: noteCtrl.text.trim(),
          txDate: selectedDate,
          currency: selectedCurrencyCode,
        );
        _load();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(e.toString())));
        }
      }
    }

    amountCtrl.dispose();
    noteCtrl.dispose();
  }

  void _showReport() {
    final buffer = StringBuffer();
    buffer.writeln("Ishchi: ${_worker.displayName}");
    if (_worker.kasb != null) buffer.writeln("Kasbi: ${_worker.kasb}");
    buffer.writeln("Ish haqi: ${formatUzsToDisplay(_worker.ishaqi)}");
    buffer.writeln("Olingan avans: ${formatUzsToDisplay(_worker.olingan)}");
    buffer.writeln("Balans: ${formatUzsToDisplay(_worker.balans)}");
    buffer.writeln("\nLoyihalar bo'yicha:");
    for (final ob in _worker.obsList) {
      buffer.writeln("- ${ob.obNomi}: ${formatUzsToDisplay(ob.balans)}");
    }

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Hisobot"),
        content: SingleChildScrollView(
            child: Text(buffer.toString(),
                style: const TextStyle(fontFamily: 'monospace', fontSize: 13))),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text("Yopish")),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final worker = _worker;
    final initials = worker.displayName.trim().isEmpty
        ? '?'
        : worker.displayName.trim()[0].toUpperCase();
    final color = colorForName(worker.displayName);
    final balans = worker.balans;
    final isPositive = balans > 0;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Text(worker.displayName),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Row(
            children: [
              Expanded(
                child: ElevatedButton(
                  onPressed: _openAvansBerishSheet,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.accent,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16)),
                    elevation: 0,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.2),
                            shape: BoxShape.circle),
                        child: const Icon(Icons.payments_outlined,
                            size: 16, color: Colors.white),
                      ),
                      const SizedBox(width: 8),
                      const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text("Avans",
                              style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white)),
                          Text("Berish",
                              style: TextStyle(
                                  fontSize: 9, color: Colors.white70)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: _openIshHaqiYozishSheet,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.green,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16)),
                    elevation: 0,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.2),
                            shape: BoxShape.circle),
                        child: const Icon(Icons.edit_note_rounded,
                            size: 18, color: Colors.white),
                      ),
                      const SizedBox(width: 8),
                      const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text("Ish haqi",
                              style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white)),
                          Text("Yozish",
                              style: TextStyle(
                                  fontSize: 9, color: Colors.white70)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      body: _loading
          ? _buildShimmerLoading()
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
                            backgroundColor: color.withOpacity(0.15),
                            child: Text(initials,
                                style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 20,
                                    color: color)),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(worker.displayName,
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w800,
                                            fontSize: 16)),
                                    const SizedBox(width: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 8, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF22C55E)
                                            .withOpacity(0.1),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: const Text(
                                        "Faol",
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w800,
                                          color: Color(0xFF22C55E),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                if (worker.kasb != null &&
                                    worker.kasb!.isNotEmpty)
                                  Text(worker.kasb!,
                                      style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                          color: AppColors.muted)),
                                if (worker.profile?.phone != null &&
                                    worker.profile!.phone.isNotEmpty)
                                  Row(
                                    children: [
                                      Text(PhoneFormatter.format(worker.profile!.phone),
                                          style: const TextStyle(
                                              fontSize: 12,
                                              color: AppColors.text2)),
                                      const SizedBox(width: 4),
                                      const Icon(Icons.phone_outlined,
                                          size: 14, color: AppColors.muted),
                                    ],
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          _StatCard(
                            label: 'Ish haqi',
                            value: formatUzsToDisplay(worker.ishaqi),
                            color: const Color(0xFF2563EB),
                            bgColor: const Color(0xFF2563EB).withOpacity(0.06),
                          ),
                          const SizedBox(width: 8),
                          _StatCard(
                            label: 'Olingan',
                            value: formatUzsToDisplay(worker.olingan),
                            color: const Color(0xFFEA580C),
                            bgColor: const Color(0xFFEA580C).withOpacity(0.06),
                          ),
                          const SizedBox(width: 8),
                          _StatCard(
                            label: 'Balans',
                            value:
                                '${isPositive ? "" : "-"}${formatUzsToDisplay(balans.abs())}',
                            color: isPositive
                                ? const Color(0xFF22C55E)
                                : const Color(0xFFDC2626),
                            bgColor: (isPositive
                                    ? const Color(0xFF22C55E)
                                    : const Color(0xFFDC2626))
                                .withOpacity(0.06),
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
                    child: Text('Loyihalar',
                        style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 13,
                            color: AppColors.muted)),
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
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 12),
                              child: Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                      child: Text(ob.obNomi,
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w600,
                                              fontSize: 13))),
                                  Text(
                                    '${ob.balans > 0 ? "" : "-"}${formatUzsToDisplay(ob.balans.abs())}',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: ob.balans > 0
                                          ? const Color(0xFF22C55E)
                                          : const Color(0xFFDC2626),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (i < worker.obsList.length - 1)
                              const Divider(
                                  color: AppColors.border,
                                  height: 1,
                                  indent: 14),
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
                      const Text('So\'nggi operatsiyalar',
                          style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                              color: AppColors.muted)),
                      Text('${_payments.length} ta',
                          style: const TextStyle(
                              fontSize: 12, color: AppColors.muted)),
                    ],
                  ),
                ),
                if (_payments.isEmpty)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.all(32),
                      child: Text('Operatsiyalar yo\'q',
                          style:
                              TextStyle(color: AppColors.muted, fontSize: 14)),
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
                        final isWage = tx.tur == 'ishhaqi';
                        final icon = isWage
                            ? Icons.arrow_upward_rounded
                            : Icons.arrow_downward_rounded;
                        final color = isWage
                            ? const Color(0xFF16A34A)
                            : const Color(0xFFDC2626);
                        final label = tx.izoh?.isNotEmpty == true
                            ? tx.izoh!
                            : (isWage ? "Ish haqi yozildi" : "Avans oldi");
                        final timeStr = _timeFmt.format(tx.date);
                        final dateStr =
                            DateTime.now().difference(tx.date).inDays == 0
                                ? "Bugun"
                                : DateTime.now()
                                            .difference(tx.date)
                                            .inDays ==
                                        1
                                    ? "Kecha"
                                    : _dateFmt.format(tx.date);

                        return Column(
                          children: [
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 12),
                              child: Row(
                                children: [
                                  Container(
                                    width: 36,
                                    height: 36,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: color.withOpacity(0.12),
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: Icon(icon, size: 18, color: color),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          label,
                                          style: const TextStyle(
                                              fontSize: 13,
                                              fontWeight: FontWeight.w600),
                                        ),
                                        Text(
                                          "$dateStr, $timeStr",
                                          style: const TextStyle(
                                              fontSize: 11,
                                              color: AppColors.muted),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Text(
                                    '${isWage ? "+" : "-"}${formatTransactionAmount(tx)}',
                                    style: TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700,
                                        color: color),
                                  ),
                                ],
                              ),
                            ),
                            if (i < _payments.length - 1)
                              const Divider(
                                  color: AppColors.border,
                                  height: 1,
                                  indent: 60),
                          ],
                        );
                      }),
                    ),
                  ),
              ],
            ),
    );
  }

  Widget _buildShimmerLoading() {
    return Shimmer(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          ShimmerBox(height: 150, borderRadius: 18),
          SizedBox(height: 16),
          ShimmerBox(height: 180, borderRadius: 18),
          SizedBox(height: 24),
          ShimmerBox(height: 32, width: 120, borderRadius: 6),
          SizedBox(height: 12),
          ShimmerBox(height: 90, borderRadius: 14),
          SizedBox(height: 12),
          ShimmerBox(height: 90, borderRadius: 14),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final Color bgColor;

  const _StatCard({
    required this.label,
    required this.value,
    required this.color,
    required this.bgColor,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Text(
              label,
              style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppColors.text2),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w900, color: color),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
