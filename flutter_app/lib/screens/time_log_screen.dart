import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/time_log_repository.dart';
import '../models/project.dart';
import '../theme/app_theme.dart';

class TimeLogScreen extends StatefulWidget {
  final Project project;
  final List<String> workerNames;

  const TimeLogScreen({super.key, required this.project, required this.workerNames});

  @override
  State<TimeLogScreen> createState() => _TimeLogScreenState();
}

class _TimeLogScreenState extends State<TimeLogScreen> {
  final _repo = TimeLogRepository();
  List<TimeEntry> _entries = [];
  bool _loading = true;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _load();
    _ticker = Timer.periodic(const Duration(seconds: 30), (_) {
      if (_entries.any((e) => e.isActive) && mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final entries = await _repo.loadForProject(widget.project.id);
    if (mounted) setState(() { _entries = entries; _loading = false; });
  }

  Future<void> _punchIn(String workerName) async {
    await _repo.punchIn(obId: widget.project.id, workerName: workerName);
    _load();
  }

  Future<void> _punchOut(String id) async {
    await _repo.punchOut(id);
    _load();
  }

  Future<void> _delete(String id) async {
    await _repo.delete(id);
    _load();
  }

  Future<void> _openAddCustomWorker() async {
    final ctrl = TextEditingController();
    final saved = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Kirish vaqtini boshlash', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 12),
            TextField(controller: ctrl, autofocus: true, decoration: const InputDecoration(hintText: 'Ishchi ismi')),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () { if (ctrl.text.trim().isNotEmpty) Navigator.pop(ctx, true); },
              child: const Text('Kirdi'),
            ),
          ],
        ),
      ),
    );
    if (saved == true && ctrl.text.trim().isNotEmpty) {
      await _punchIn(ctrl.text.trim());
    }
    ctrl.dispose();
  }

  String _formatDuration(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes % 60;
    if (h > 0) return '${h}s ${m}d';
    return '${m}d';
  }

  Map<String, Duration> get _todayTotals {
    final today = DateTime.now();
    final todayStart = DateTime(today.year, today.month, today.day);
    final totals = <String, Duration>{};
    for (final e in _entries) {
      if (e.punchIn.isBefore(todayStart)) continue;
      totals[e.workerName] = (totals[e.workerName] ?? Duration.zero) + e.duration;
    }
    return totals;
  }

  @override
  Widget build(BuildContext context) {
    final activeEntries = _entries.where((e) => e.isActive).toList();
    final completedToday = _entries.where((e) => !e.isActive && e.punchIn.isAfter(DateTime.now().subtract(const Duration(days: 1)))).toList();
    final totals = _todayTotals;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Text('Vaqt hisobi — ${widget.project.nomi}'),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          if (widget.workerNames.isEmpty) {
            await _openAddCustomWorker();
            return;
          }
          final name = await showModalBottomSheet<String>(
            context: context,
            backgroundColor: AppColors.card,
            shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
            builder: (ctx) => Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Ishchi kirdi', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 12),
                  for (final n in widget.workerNames)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: CircleAvatar(
                        backgroundColor: AppColors.accent.withOpacity(0.15),
                        child: Text(n[0].toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.accent)),
                      ),
                      title: Text(n),
                      subtitle: activeEntries.any((e) => e.workerName == n)
                          ? const Text('Hozir ishlayapti', style: TextStyle(fontSize: 11, color: Color(0xFF22C55E), fontWeight: FontWeight.w700))
                          : null,
                      onTap: () => Navigator.pop(ctx, n),
                    ),
                  const Divider(color: AppColors.border),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const CircleAvatar(
                      backgroundColor: AppColors.border,
                      child: Icon(Icons.add_rounded, color: AppColors.muted, size: 18),
                    ),
                    title: const Text('Boshqa ishchi'),
                    onTap: () { Navigator.pop(ctx); _openAddCustomWorker(); },
                  ),
                ],
              ),
            ),
          );
          if (name != null) await _punchIn(name);
        },
        icon: const Icon(Icons.login_rounded),
        label: const Text('Kirdi'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 80),
              children: [
                if (totals.isNotEmpty) ...[
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(18), border: Border.all(color: AppColors.border)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('BUGUNGI UMUMIY', style: TextStyle(fontSize: 10, color: AppColors.muted, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                        const SizedBox(height: 10),
                        for (final entry in totals.entries)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Row(
                              children: [
                                Text(entry.key, style: const TextStyle(fontWeight: FontWeight.w700)),
                                const Spacer(),
                                Text(_formatDuration(entry.value), style: const TextStyle(fontWeight: FontWeight.w900, color: AppColors.accentTeal)),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                if (activeEntries.isNotEmpty) ...[
                  const Text('Hozir ishlayaptilar', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                  const SizedBox(height: 8),
                  for (final entry in activeEntries)
                    _TimeEntryCard(
                      entry: entry,
                      formatDuration: _formatDuration,
                      onPunchOut: () => _punchOut(entry.id),
                      onDelete: () => _delete(entry.id),
                      isActive: true,
                    ),
                  const SizedBox(height: 16),
                ],
                if (completedToday.isNotEmpty) ...[
                  const Text('Bugun bajarildi', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                  const SizedBox(height: 8),
                  for (final entry in completedToday)
                    _TimeEntryCard(
                      entry: entry,
                      formatDuration: _formatDuration,
                      onPunchOut: null,
                      onDelete: () => _delete(entry.id),
                      isActive: false,
                    ),
                ],
                if (_entries.isEmpty)
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.only(top: 60),
                      child: Column(
                        children: [
                          Icon(Icons.timer_outlined, size: 48, color: AppColors.muted.withOpacity(0.5)),
                          const SizedBox(height: 12),
                          const Text('Vaqt yozuvlari yo\'q', style: TextStyle(color: AppColors.muted)),
                          const SizedBox(height: 6),
                          const Text('Ishchi kirganida "Kirdi" tugmasini bosing', style: TextStyle(color: AppColors.muted, fontSize: 12), textAlign: TextAlign.center),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}

class _TimeEntryCard extends StatelessWidget {
  final TimeEntry entry;
  final String Function(Duration) formatDuration;
  final VoidCallback? onPunchOut;
  final VoidCallback onDelete;
  final bool isActive;

  const _TimeEntryCard({
    required this.entry,
    required this.formatDuration,
    required this.onPunchOut,
    required this.onDelete,
    required this.isActive,
  });

  @override
  Widget build(BuildContext context) {
    final df = DateFormat('HH:mm');
    final dur = entry.duration;

    return Dismissible(
      key: Key('time_${entry.id}'),
      direction: DismissDirection.endToStart,
      confirmDismiss: (_) async => true,
      onDismissed: (_) => onDelete(),
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(color: const Color(0xFFEF4444).withOpacity(0.85), borderRadius: BorderRadius.circular(14)),
        child: const Icon(Icons.delete_outline_rounded, color: Colors.white, size: 24),
      ),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: isActive ? AppColors.accentTeal.withOpacity(0.4) : AppColors.border),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: isActive ? AppColors.accentTeal.withOpacity(0.15) : AppColors.border.withOpacity(0.5),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                isActive ? Icons.timer_rounded : Icons.timer_off_rounded,
                color: isActive ? AppColors.accentTeal : AppColors.muted,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(entry.workerName, style: const TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 2),
                  Text(
                    '${df.format(entry.punchIn)}${entry.punchOut != null ? ' – ${df.format(entry.punchOut!)}' : ' (hozir)'}',
                    style: const TextStyle(fontSize: 12, color: AppColors.muted),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  formatDuration(dur),
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14, color: isActive ? AppColors.accentTeal : AppColors.text),
                ),
                if (isActive && onPunchOut != null) ...[
                  const SizedBox(height: 4),
                  GestureDetector(
                    onTap: onPunchOut,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.redAccent.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.redAccent.withOpacity(0.3)),
                      ),
                      child: const Text('Chiqdi', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.redAccent)),
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
