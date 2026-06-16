import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/member_repository.dart';
import '../data/project_repository.dart';
import '../data/worker_repository.dart';
import '../models/worker.dart';
import '../theme/app_theme.dart';
import '../widgets/add_member_sheet.dart';
import '../widgets/member_row.dart' show colorForName;
import '../widgets/project_card.dart' show formatMoney;

class WorkersScreen extends StatefulWidget {
  const WorkersScreen({super.key});

  @override
  State<WorkersScreen> createState() => _WorkersScreenState();
}

class _WorkersScreenState extends State<WorkersScreen> {
  final _repo = WorkerRepository();
  final _projectRepo = ProjectRepository();
  final _memberRepo = MemberRepository();
  List<Worker> _workers = [];
  bool _loading = true;
  String _filter = 'all';
  String _search = '';
  String _sort = 'balans';

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

  List<Worker> get _filtered {
    var list = _workers;
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      list = list.where((w) => w.displayName.toLowerCase().contains(q) || (w.kasb ?? '').toLowerCase().contains(q)).toList();
    }
    switch (_filter) {
      case 'plus':
        list = list.where((w) => w.balans > 0).toList();
        break;
      case 'minus':
        list = list.where((w) => w.balans < 0).toList();
        break;
      case 'zero':
        list = list.where((w) => w.balans == 0).toList();
        break;
    }
    final sorted = List<Worker>.from(list);
    if (_sort == 'balans') {
      sorted.sort((a, b) => a.balans.compareTo(b.balans));
    } else if (_sort == 'ishaqi') {
      sorted.sort((a, b) => b.ishaqi.compareTo(a.ishaqi));
    } else {
      sorted.sort((a, b) => a.displayName.compareTo(b.displayName));
    }
    return sorted;
  }

  Future<void> _openAddWorker() async {
    final projects = await _projectRepo.loadProjects();
    final ownedProjects = projects.where((p) => p.role == 'owner').toList();
    final ownedProject = ownedProjects.isEmpty ? null : ownedProjects.first;
    if (ownedProject == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Sizda obyekt yo'q")),
      );
      return;
    }

    final phoneCtrl = TextEditingController(text: '+998');
    final kasbCtrl = TextEditingController();

    final result = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom,
        ),
        child: AddMemberSheet(phoneCtrl: phoneCtrl, kasbCtrl: kasbCtrl),
      ),
    );

    if (result == true) {
      try {
        await _memberRepo.addMember(
          obId: ownedProject.id,
          phone: phoneCtrl.text.trim(),
          kasb: kasbCtrl.text.trim(),
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Qo'shildi")),
        );
        _load();
      } catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    }
  }

  Future<void> _openWorkerDetail(Worker worker) async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.65,
        minChildSize: 0.4,
        maxChildSize: 0.9,
        expand: false,
        builder: (ctx, scrollController) => _WorkerDetailSheet(
          worker: worker,
          scrollController: scrollController,
          onChanged: _load,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final total = _workers.length;
    final plus = _workers.where((w) => w.balans > 0).length;
    final minus = _workers.where((w) => w.balans < 0).length;
    final zero = _workers.where((w) => w.balans == 0).length;
    final totalIshaqi = _workers.fold<num>(0, (s, w) => s + w.ishaqi);
    final totalOlingan = _workers.fold<num>(0, (s, w) => s + w.olingan);
    final totalBalans = totalIshaqi - totalOlingan;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(backgroundColor: AppColors.bg, title: const Text('Ishchilar')),
      floatingActionButton: FloatingActionButton(
        onPressed: _openAddWorker,
        child: const Icon(Icons.person_add_alt_1_rounded),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              children: [
                Expanded(child: _StatBox(label: 'JAMI', value: total.toString(), color: AppColors.text)),
                const SizedBox(width: 8),
                Expanded(child: _StatBox(label: 'MUSBAT', value: plus.toString(), color: const Color(0xFF16A34A))),
                const SizedBox(width: 8),
                Expanded(child: _StatBox(label: 'MANFIY', value: minus.toString(), color: const Color(0xFFEF4444))),
                const SizedBox(width: 8),
                Expanded(child: _StatBox(label: 'NOL', value: zero.toString(), color: AppColors.muted)),
              ],
            ),
            if (_workers.isNotEmpty) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('JAMI ISH HAQI', style: TextStyle(fontSize: 9.5, color: AppColors.muted, fontWeight: FontWeight.w700, letterSpacing: 0.4)),
                          const SizedBox(height: 3),
                          Text(formatMoney(totalIshaqi), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: Color(0xFF22C55E)), overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('JAMI OLINGAN', style: TextStyle(fontSize: 9.5, color: AppColors.muted, fontWeight: FontWeight.w700, letterSpacing: 0.4)),
                          const SizedBox(height: 3),
                          Text(formatMoney(totalOlingan), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: Color(0xFFF59E0B)), overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('UMUMIY QOLDIQ', style: TextStyle(fontSize: 9.5, color: AppColors.muted, fontWeight: FontWeight.w700, letterSpacing: 0.4)),
                          const SizedBox(height: 3),
                          Text(
                            '${totalBalans >= 0 ? '+' : ''}${formatMoney(totalBalans)}',
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: totalBalans >= 0 ? const Color(0xFF22C55E) : const Color(0xFFEF4444)),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 16),
            TextField(
              onChanged: (v) => setState(() => _search = v),
              decoration: const InputDecoration(
                hintText: 'Qidirish...',
                prefixIcon: Icon(Icons.search_rounded),
              ),
            ),
            const SizedBox(height: 12),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _FilterChip(label: 'Hammasi', selected: _filter == 'all', onTap: () => setState(() => _filter = 'all')),
                  const SizedBox(width: 8),
                  _FilterChip(label: 'Musbat', selected: _filter == 'plus', onTap: () => setState(() => _filter = 'plus')),
                  const SizedBox(width: 8),
                  _FilterChip(label: 'Manfiy', selected: _filter == 'minus', onTap: () => setState(() => _filter = 'minus')),
                  const SizedBox(width: 8),
                  _FilterChip(label: 'Nol', selected: _filter == 'zero', onTap: () => setState(() => _filter = 'zero')),
                  const SizedBox(width: 16),
                  const Text('|', style: TextStyle(color: AppColors.border, fontSize: 18)),
                  const SizedBox(width: 16),
                  _FilterChip(label: 'Balans ↑', selected: _sort == 'balans', onTap: () => setState(() => _sort = 'balans')),
                  const SizedBox(width: 8),
                  _FilterChip(label: 'Ish haqi ↓', selected: _sort == 'ishaqi', onTap: () => setState(() => _sort = 'ishaqi')),
                  const SizedBox(width: 8),
                  _FilterChip(label: 'Ism A-Z', selected: _sort == 'name', onTap: () => setState(() => _sort = 'name')),
                ],
              ),
            ),
            const SizedBox(height: 16),
            if (_loading)
              const Padding(
                padding: EdgeInsets.only(top: 40),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_filtered.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 40),
                child: Center(child: Text("Ishchilar yo'q", style: TextStyle(color: AppColors.muted))),
              )
            else
              ..._filtered.map((w) => _WorkerCard(worker: w, onTap: () => _openWorkerDetail(w))),
          ],
        ),
      ),
    );
  }
}

class _StatBox extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _StatBox({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 6),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: color)),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _FilterChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? AppColors.accent : AppColors.card,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? AppColors.accent : AppColors.border),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: selected ? Colors.white : AppColors.text2,
          ),
        ),
      ),
    );
  }
}

class _WorkerCard extends StatelessWidget {
  final Worker worker;
  final VoidCallback onTap;

  const _WorkerCard({required this.worker, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final name = worker.displayName;
    final color = colorForName(name);
    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';
    final bal = worker.balans;
    final balColor = bal > 0
        ? const Color(0xFF16A34A)
        : bal < 0
            ? const Color(0xFFEF4444)
            : AppColors.muted;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(14)),
              child: Text(initial, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 3),
                  Text(
                    '${worker.kasb?.isNotEmpty == true ? worker.kasb! : 'Ishchi'} • ${worker.obsCount} loyiha',
                    style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
            Text(
              '${bal >= 0 ? '+' : '-'}${formatMoney(bal.abs())}',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: balColor),
            ),
          ],
        ),
      ),
    );
  }
}

class _WorkerDetailSheet extends StatefulWidget {
  final Worker worker;
  final ScrollController scrollController;
  final VoidCallback onChanged;

  const _WorkerDetailSheet({required this.worker, required this.scrollController, required this.onChanged});

  @override
  State<_WorkerDetailSheet> createState() => _WorkerDetailSheetState();
}

class _WorkerDetailSheetState extends State<_WorkerDetailSheet> {
  final _repo = WorkerRepository();

  Future<void> _openAmountSheet({required String title, required bool isAvans}) async {
    final worker = widget.worker;
    final amountCtrl = TextEditingController();
    final noteCtrl = TextEditingController();
    String selectedObId = worker.obsList.first.obId;
    DateTime txDate = DateTime.now();

    final result = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title, style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 16),
              if (worker.obsList.length > 1)
                DropdownButtonFormField<String>(
                  value: selectedObId,
                  decoration: const InputDecoration(labelText: 'Obyekt'),
                  items: worker.obsList
                      .map((o) => DropdownMenuItem(value: o.obId, child: Text(o.obNomi)))
                      .toList(),
                  onChanged: (v) => setSheetState(() => selectedObId = v ?? selectedObId),
                ),
              if (worker.obsList.length > 1) const SizedBox(height: 12),
              TextField(
                controller: amountCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(hintText: 'Summa'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: noteCtrl,
                decoration: const InputDecoration(hintText: 'Izoh (ixtiyoriy)'),
              ),
              const SizedBox(height: 12),
              InkWell(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: ctx,
                    initialDate: txDate,
                    firstDate: DateTime(2020),
                    lastDate: DateTime.now().add(const Duration(days: 1)),
                  );
                  if (picked != null) setSheetState(() => txDate = picked);
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
                      Text(
                        DateFormat('dd.MM.yyyy').format(txDate),
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: () {
                  final amount = num.tryParse(amountCtrl.text.trim());
                  if (amount == null || amount <= 0) return;
                  Navigator.of(ctx).pop(true);
                },
                child: const Text('Saqlash'),
              ),
            ],
          ),
        ),
      ),
    );

    if (result == true) {
      final amount = num.tryParse(amountCtrl.text.trim()) ?? 0;
      if (isAvans) {
        await _repo.giveAvans(obId: selectedObId, toUserId: worker.userId, amount: amount, izoh: noteCtrl.text.trim(), txDate: txDate);
      } else {
        await _repo.giveIshHaqi(obId: selectedObId, toUserId: worker.userId, amount: amount, izoh: noteCtrl.text.trim(), txDate: txDate);
      }
      if (!mounted) return;
      widget.onChanged();
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final worker = widget.worker;
    final name = worker.displayName;
    final color = colorForName(name);
    final bal = worker.balans;
    final balColor = bal > 0
        ? const Color(0xFF16A34A)
        : bal < 0
            ? const Color(0xFFEF4444)
            : AppColors.muted;

    return ListView(
      controller: widget.scrollController,
      padding: const EdgeInsets.all(20),
      children: [
        Row(
          children: [
            Container(
              width: 58,
              height: 58,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(18)),
              child: Text(
                name.isNotEmpty ? name[0].toUpperCase() : '?',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 22),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 3),
                  Text(
                    worker.kasb?.isNotEmpty == true ? worker.kasb! : 'Ishchi',
                    style: const TextStyle(fontSize: 13, color: AppColors.muted),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(child: _DetailStat(label: 'ISH HAQI', value: formatMoney(worker.ishaqi), color: AppColors.accent)),
            const SizedBox(width: 8),
            Expanded(child: _DetailStat(label: 'OLINGAN', value: formatMoney(worker.olingan), color: const Color(0xFFF59E0B))),
            const SizedBox(width: 8),
            Expanded(child: _DetailStat(label: 'BALANS', value: '${bal >= 0 ? '+' : '-'}${formatMoney(bal.abs())}', color: balColor)),
          ],
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: ElevatedButton(
                onPressed: () => _openAmountSheet(title: 'Avans berish', isAvans: true),
                child: const Text('Avans berish'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: OutlinedButton(
                onPressed: () => _openAmountSheet(title: "Ish haqi yozish", isAvans: false),
                child: const Text("Ish haqi yozish"),
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        if (worker.obsList.isNotEmpty) ...[
          const Text('Obyektlar', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          Container(
            decoration: BoxDecoration(
              color: AppColors.bg,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              children: [
                for (var i = 0; i < worker.obsList.length; i++)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      border: i < worker.obsList.length - 1
                          ? const Border(bottom: BorderSide(color: AppColors.border))
                          : null,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(worker.obsList[i].obNomi, style: const TextStyle(fontWeight: FontWeight.w700)),
                        Text(
                          '${worker.obsList[i].balans >= 0 ? '+' : '-'}${formatMoney(worker.obsList[i].balans.abs())}',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            color: worker.obsList[i].balans >= 0 ? const Color(0xFF16A34A) : const Color(0xFFEF4444),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _DetailStat extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _DetailStat({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
      decoration: BoxDecoration(
        color: AppColors.bg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: color)),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700, color: AppColors.muted)),
        ],
      ),
    );
  }
}
