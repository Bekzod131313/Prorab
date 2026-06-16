import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/task_repository.dart';
import '../models/project.dart';
import '../models/task.dart';
import '../theme/app_theme.dart';

class KanbanScreen extends StatefulWidget {
  final Project project;

  const KanbanScreen({super.key, required this.project});

  @override
  State<KanbanScreen> createState() => _KanbanScreenState();
}

class _KanbanScreenState extends State<KanbanScreen> {
  final _taskRepo = TaskRepository();
  List<ObTask> _tasks = [];
  bool _loading = true;

  static const _columns = [
    ('todo', 'Boshlanmagan', Color(0xFF6B7280)),
    ('progress', 'Jarayonda', Color(0xFFF59E0B)),
    ('done', 'Bajarildi', Color(0xFF22C55E)),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final tasks = await _taskRepo.loadForProject(widget.project.id);
    if (mounted) setState(() { _tasks = tasks; _loading = false; });
  }

  Future<void> _moveTask(ObTask task, String newStatus) async {
    await _taskRepo.updateTaskStatus(task.id, newStatus);
    _load();
  }

  Future<void> _addTask(String status) async {
    final ctrl = TextEditingController();
    DateTime? deadline;

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => Padding(
          padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Yangi vazifa', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 12),
              TextField(controller: ctrl, autofocus: true, decoration: const InputDecoration(hintText: 'Vazifa nomi *')),
              const SizedBox(height: 10),
              GestureDetector(
                onTap: () async {
                  final d = await showDatePicker(
                    context: ctx,
                    initialDate: DateTime.now().add(const Duration(days: 7)),
                    firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 365)),
                    builder: (ctx, child) => Theme(data: ThemeData.dark(), child: child!),
                  );
                  if (d != null) setSt(() => deadline = d);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  decoration: BoxDecoration(
                    border: Border.all(color: AppColors.border),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.calendar_today_rounded, size: 16, color: AppColors.muted),
                      const SizedBox(width: 8),
                      Text(
                        deadline != null ? DateFormat('dd MMM yyyy').format(deadline!) : 'Muddat (ixtiyoriy)',
                        style: TextStyle(color: deadline != null ? AppColors.text : AppColors.muted, fontSize: 14),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () { if (ctrl.text.trim().isNotEmpty) Navigator.pop(ctx, true); },
                child: const Text('Qo\'shish'),
              ),
            ],
          ),
        ),
      ),
    );

    if (saved == true && ctrl.text.trim().isNotEmpty) {
      await _taskRepo.addTask(
        widget.project.id,
        ctrl.text.trim(),
        holat: status,
        muddat: deadline,
      );
      _load();
    }
    ctrl.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Text('Kanban — ${widget.project.nomi}'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: _columns.map((col) {
                final status = col.$1;
                final label = col.$2;
                final color = col.$3;
                final colTasks = _tasks.where((t) => t.holat == status).toList();

                return Expanded(
                  child: DragTarget<ObTask>(
                    onWillAcceptWithDetails: (details) => details.data.holat != status,
                    onAcceptWithDetails: (details) => _moveTask(details.data, status),
                    builder: (ctx, candidateData, rejectedData) {
                      final isDraggingOver = candidateData.isNotEmpty;
                      return AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        margin: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: isDraggingOver ? color.withOpacity(0.08) : AppColors.card.withOpacity(0.5),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: isDraggingOver ? color.withOpacity(0.4) : AppColors.border),
                        ),
                        child: Column(
                          children: [
                            // Column header
                            Padding(
                              padding: const EdgeInsets.fromLTRB(10, 10, 6, 8),
                              child: Row(
                                children: [
                                  Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
                                  const SizedBox(width: 6),
                                  Expanded(child: Text(label, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 11, color: color))),
                                  Text('${colTasks.length}', style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w700)),
                                ],
                              ),
                            ),
                            const Divider(color: AppColors.border, height: 1),
                            // Task cards
                            Expanded(
                              child: ListView(
                                padding: const EdgeInsets.all(6),
                                children: [
                                  ...colTasks.map((task) => Padding(
                                    padding: const EdgeInsets.only(bottom: 6),
                                    child: Draggable<ObTask>(
                                      data: task,
                                      feedback: Material(
                                        color: Colors.transparent,
                                        child: _KanbanCard(task: task, color: color, isDragging: true),
                                      ),
                                      childWhenDragging: Opacity(opacity: 0.3, child: _KanbanCard(task: task, color: color)),
                                      child: _KanbanCard(
                                        task: task,
                                        color: color,
                                        onStatusCycle: () => _moveTask(task, task.next),
                                      ),
                                    ),
                                  )),
                                  // Add button
                                  GestureDetector(
                                    onTap: () => _addTask(status),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(vertical: 8),
                                      child: Row(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        children: [
                                          Icon(Icons.add_rounded, size: 14, color: color.withOpacity(0.6)),
                                          const SizedBox(width: 4),
                                          Text('Qo\'shish', style: TextStyle(fontSize: 11, color: color.withOpacity(0.6))),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                );
              }).toList(),
            ),
    );
  }
}

class _KanbanCard extends StatelessWidget {
  final ObTask task;
  final Color color;
  final bool isDragging;
  final VoidCallback? onStatusCycle;

  const _KanbanCard({required this.task, required this.color, this.isDragging = false, this.onStatusCycle});

  @override
  Widget build(BuildContext context) {
    final isOverdue = task.muddat != null && task.muddat!.isBefore(DateTime.now()) && task.holat != 'done';
    return Container(
      width: isDragging ? 120 : null,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: isOverdue ? const Color(0xFFEF4444).withOpacity(0.4) : AppColors.border),
        boxShadow: isDragging ? [BoxShadow(color: color.withOpacity(0.3), blurRadius: 8)] : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            task.nomi,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: task.holat == 'done' ? AppColors.muted : AppColors.text,
              decoration: task.holat == 'done' ? TextDecoration.lineThrough : null,
            ),
            maxLines: isDragging ? 1 : 3,
            overflow: TextOverflow.ellipsis,
          ),
          if (task.muddat != null && !isDragging) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                Icon(Icons.schedule_rounded, size: 10, color: isOverdue ? const Color(0xFFEF4444) : AppColors.muted),
                const SizedBox(width: 3),
                Text(
                  DateFormat('dd MMM').format(task.muddat!),
                  style: TextStyle(fontSize: 10, color: isOverdue ? const Color(0xFFEF4444) : AppColors.muted),
                ),
              ],
            ),
          ],
          if (onStatusCycle != null && !isDragging) ...[
            const SizedBox(height: 6),
            GestureDetector(
              onTap: onStatusCycle,
              child: Icon(Icons.arrow_forward_rounded, size: 14, color: color.withOpacity(0.6)),
            ),
          ],
        ],
      ),
    );
  }
}
