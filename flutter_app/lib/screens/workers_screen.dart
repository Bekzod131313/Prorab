import 'package:flutter/material.dart';

import '../data/transaction_repository.dart';
import '../data/worker_repository.dart';
import '../models/worker.dart';
import '../theme/app_theme.dart';
import '../widgets/member_row.dart' show colorForName;
import '../widgets/project_card.dart' show formatMoney;
import '../widgets/add_worker_global_sheet.dart';
import 'worker_detail_screen.dart';

class WorkersScreen extends StatefulWidget {
  const WorkersScreen({super.key});

  @override
  State<WorkersScreen> createState() => _WorkersScreenState();
}

class _WorkersScreenState extends State<WorkersScreen> {
  final _repo = WorkerRepository();
  final _txRepo = TransactionRepository();
  List<Worker> _workers = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final workers = await _repo.loadAll();
    if (!mounted) return;
    setState(() {
      _workers = workers;
      _loading = false;
    });
  }

  Future<void> _quickPayWorker(Worker worker) async {
    if (worker.balans <= 0 || worker.obsList.isEmpty) return;

    WorkerProject? selectedOb;
    final activeObs = worker.obsList.where((op) => op.balans > 0).toList();
    final listToChoose = activeObs.isNotEmpty ? activeObs : worker.obsList;

    if (listToChoose.length == 1) {
      selectedOb = listToChoose.first;
    } else {
      selectedOb = await showModalBottomSheet<WorkerProject>(
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
                const Text("To'lov uchun loyihani tanlang",
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 12),
                for (final op in listToChoose)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(op.obNomi),
                    subtitle: Text("Qarzdorlik: ${formatMoney(op.balans)} so'm"),
                    trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.muted),
                    onTap: () => Navigator.of(ctx).pop(op),
                  ),
              ],
            ),
          ),
        ),
      );
    }
    if (selectedOb == null || !mounted) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text("${worker.displayName}ga to'lash"),
        content: Text("${selectedOb!.obNomi} loyihasi uchun ${formatMoney(selectedOb.balans)} so'm berilsinmi?"),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Bekor')),
          ElevatedButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text("Ha, berish")),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    try {
      await _txRepo.addTransaction(
        obId: selectedOb.obId,
        isIncome: false,
        amount: selectedOb.balans,
        kategoriya: 'Mehnat haqi',
        toUserId: worker.userId,
      );
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("To'lov amalga oshirildi")));
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _openAddWorkerGlobal() async {
    final phoneCtrl = TextEditingController();
    final kasbCtrl = TextEditingController();

    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => AddWorkerGlobalSheet(
        phoneCtrl: phoneCtrl,
        kasbCtrl: kasbCtrl,
      ),
    );

    if (result == true) {
      setState(() => _loading = true);
      try {
        await _repo.addWorkerGlobal(
          phone: phoneCtrl.text.trim(),
          kasb: kasbCtrl.text.trim(),
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text("Yangi ishchi muvaffaqiyatli qo'shildi")),
          );
        }
        _load();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e.toString())),
          );
        }
        setState(() => _loading = false);
      }
    }

    Future.delayed(const Duration(milliseconds: 350), () {
      phoneCtrl.dispose();
      kasbCtrl.dispose();
    });
  }

  @override
  Widget build(BuildContext context) {
    final totalWorkers = _workers.length;
    final totalOwed = _workers.fold<num>(0, (s, w) => s + (w.balans > 0 ? w.balans : 0));
    final totalPaid = _workers.fold<num>(0, (s, w) => s + w.olingan);

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: const Text('Odamlar'),
        actions: [
          IconButton(
            icon: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppColors.accent,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.add_rounded, color: Colors.white, size: 20),
            ),
            onPressed: _openAddWorkerGlobal,
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _workers.isEmpty
                ? const Center(child: Text("Ishchilar yo'q", style: TextStyle(color: AppColors.muted)))
                : ListView(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                    children: [
                      // Summary row
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
                        child: Row(
                          children: [
                            _SumCol(label: 'Ishchilar', value: '$totalWorkers ta', color: AppColors.accent),
                            _SumCol(label: 'Qarzdorlik', value: '${formatMoney(totalOwed)} so\'m', color: AppColors.orange),
                            _SumCol(label: 'To\'langan', value: '${formatMoney(totalPaid)} so\'m', color: AppColors.green),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),

                      ..._workers.map((worker) {
                        final color = colorForName(worker.displayName);
                        final initials = worker.displayName.trim().isEmpty ? '?' : worker.displayName.trim()[0].toUpperCase();
                        final owed = worker.balans;
                        return Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
                          child: InkWell(
                            onTap: () async {
                              await Navigator.of(context).push(MaterialPageRoute(builder: (_) => WorkerDetailScreen(worker: worker)));
                              _load();
                            },
                            child: Row(
                              children: [
                                CircleAvatar(
                                  radius: 22,
                                  backgroundColor: color.withOpacity(0.15),
                                  child: Text(initials, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: color)),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(worker.displayName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                                      Row(
                                        children: [
                                          if (worker.kasb != null && worker.kasb!.isNotEmpty) ...[
                                            Text(worker.kasb!, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.accent)),
                                            const Text(' • ', style: TextStyle(fontSize: 12, color: AppColors.muted)),
                                          ],
                                          Text('${worker.obsCount} ta loyiha', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                                        ],
                                      ),
                                      if (owed > 0)
                                        Text('Qarzdorlik: ${formatMoney(owed)} so\'m', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.green)),
                                    ],
                                  ),
                                ),
                                if (owed > 0)
                                  TextButton(
                                    onPressed: () => _quickPayWorker(worker),
                                    style: TextButton.styleFrom(
                                      backgroundColor: AppColors.green.withOpacity(0.1),
                                      foregroundColor: AppColors.green,
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                    ),
                                    child: const Text("To'lash", style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                                  ),
                              ],
                            ),
                          ),
                        );
                      }),
                    ],
                  ),
      ),
    );
  }
}

class _SumCol extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _SumCol({required this.label, required this.value, required this.color});
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
