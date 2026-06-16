import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/task_repository.dart';
import '../main.dart';
import '../models/project.dart';
import '../models/task.dart';
import '../theme/app_theme.dart';
import '../widgets/task_row.dart';
import 'project_detail_screen.dart';

class TasksScreen extends StatefulWidget {
  final List<Project> projects;

  const TasksScreen({super.key, required this.projects});

  @override
  State<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends State<TasksScreen> {
  final _taskRepo = TaskRepository();
  List<_TaskItem> _items = [];
  bool _loading = true;
  String _filter = 'all';
  String _search = '';
  bool _showSearch = false;
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final items = <_TaskItem>[];
    for (final proj in widget.projects) {
      try {
        final tasks = await _taskRepo.loadForProject(proj.id);
        for (final t in tasks) {
          items.add(_TaskItem(task: t, project: proj));
        }
      } catch (_) {}
    }
    items.sort((a, b) {
      // overdue first, then by date, then undated
      final aOver = a.task.muddat != null && a.task.muddat!.isBefore(DateTime.now()) && a.task.holat != 'done';
      final bOver = b.task.muddat != null && b.task.muddat!.isBefore(DateTime.now()) && b.task.holat != 'done';
      if (aOver != bOver) return aOver ? -1 : 1;
      if (a.task.muddat != null && b.task.muddat != null) {
        return a.task.muddat!.compareTo(b.task.muddat!);
      }
      if (a.task.muddat != null) return -1;
      if (b.task.muddat != null) return 1;
      return a.task.holat.compareTo(b.task.holat);
    });
    if (mounted) setState(() { _items = items; _loading = false; });
  }

  Future<void> _deleteTask(ObTask task) async {
    await _taskRepo.deleteTask(task.id);
    _load();
  }

  Future<void> _completeTask(ObTask task) async {
    await _taskRepo.updateTaskStatus(task.id, 'done');
    _load();
  }

  List<_TaskItem> get _filtered {
    var list = _items;
    if (_filter == 'todo') list = list.where((i) => i.task.holat == 'todo').toList();
    else if (_filter == 'progress') list = list.where((i) => i.task.holat == 'progress').toList();
    else if (_filter == 'done') list = list.where((i) => i.task.holat == 'done').toList();
    else if (_filter == 'overdue') {
      list = list.where((i) => i.task.holat != 'done' && i.task.muddat != null && i.task.muddat!.isBefore(DateTime.now())).toList();
    }
    final q = _search.trim().toLowerCase();
    if (q.isNotEmpty) {
      list = list.where((i) =>
        i.task.nomi.toLowerCase().contains(q) ||
        i.project.nomi.toLowerCase().contains(q)
      ).toList();
    }
    return list;
  }

  int get _overdueCount => _items.where((i) =>
    i.task.holat != 'done' && i.task.muddat != null && i.task.muddat!.isBefore(DateTime.now())
  ).length;

  int get _todoCount => _items.where((i) => i.task.holat == 'todo').length;
  int get _progressCount => _items.where((i) => i.task.holat == 'progress').length;
  int get _doneCount => _items.where((i) => i.task.holat == 'done').length;

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: _showSearch
            ? TextField(
                controller: _searchCtrl,
                autofocus: true,
                style: const TextStyle(color: AppColors.text),
                decoration: const InputDecoration(
                  hintText: 'Vazifalarni qidirish...',
                  hintStyle: TextStyle(color: AppColors.muted),
                  border: InputBorder.none,
                ),
                onChanged: (v) => setState(() => _search = v),
              )
            : const Text('Vazifalar'),
        actions: [
          IconButton(
            icon: Icon(_showSearch ? Icons.close : Icons.search),
            onPressed: () => setState(() {
              _showSearch = !_showSearch;
              if (!_showSearch) { _search = ''; _searchCtrl.clear(); }
            }),
          ),
        ],
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
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Stats row
                          Row(
                            children: [
                              _StatChip(label: 'Hammasi', count: _items.length, active: _filter == 'all', onTap: () => setState(() => _filter = 'all')),
                              const SizedBox(width: 8),
                              _StatChip(label: 'Kechikkan', count: _overdueCount, active: _filter == 'overdue', color: Colors.redAccent, onTap: () => setState(() => _filter = 'overdue')),
                              const SizedBox(width: 8),
                              _StatChip(label: 'Jarayon', count: _progressCount, active: _filter == 'progress', color: const Color(0xFFF59E0B), onTap: () => setState(() => _filter = 'progress')),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              _StatChip(label: 'Bajarilmagan', count: _todoCount, active: _filter == 'todo', onTap: () => setState(() => _filter = 'todo')),
                              const SizedBox(width: 8),
                              _StatChip(label: 'Bajarildi', count: _doneCount, active: _filter == 'done', color: const Color(0xFF22C55E), onTap: () => setState(() => _filter = 'done')),
                            ],
                          ),
                          const SizedBox(height: 16),
                          if (filtered.isEmpty)
                            Center(
                              child: Padding(
                                padding: const EdgeInsets.only(top: 40),
                                child: Column(
                                  children: [
                                    Icon(Icons.task_alt_rounded, size: 48, color: AppColors.muted.withOpacity(0.5)),
                                    const SizedBox(height: 12),
                                    const Text('Vazifalar topilmadi', style: TextStyle(color: AppColors.muted)),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    sliver: SliverList(
                      delegate: SliverChildBuilderDelegate(
                        (ctx, i) {
                          final item = filtered[i];
                          return _TaskItemCard(
                            item: item,
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: item.project)),
                            ).then((_) => _load()),
                            onDelete: () => _deleteTask(item.task),
                            onComplete: item.task.holat != 'done' ? () => _completeTask(item.task) : null,
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

class _TaskItem {
  final ObTask task;
  final Project project;
  _TaskItem({required this.task, required this.project});
}

class _StatChip extends StatelessWidget {
  final String label;
  final int count;
  final bool active;
  final Color? color;
  final VoidCallback onTap;

  const _StatChip({required this.label, required this.count, required this.active, required this.onTap, this.color});

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.accent;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: active ? c.withOpacity(0.18) : AppColors.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: active ? c.withOpacity(0.5) : AppColors.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: active ? c : AppColors.text2)),
            if (count > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: c.withOpacity(0.2), borderRadius: BorderRadius.circular(8)),
                child: Text('$count', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: c)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _TaskItemCard extends StatelessWidget {
  final _TaskItem item;
  final VoidCallback onTap;
  final VoidCallback? onDelete;
  final VoidCallback? onComplete;

  const _TaskItemCard({required this.item, required this.onTap, this.onDelete, this.onComplete});

  @override
  Widget build(BuildContext context) {
    final task = item.task;
    final project = item.project;
    final done = task.holat == 'done';
    final isOverdue = !done && task.muddat != null && task.muddat!.isBefore(DateTime.now());
    final dateColor = isOverdue ? Colors.redAccent : AppColors.muted;

    final tile = InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(12),
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: isOverdue ? Colors.redAccent.withOpacity(0.35) : AppColors.border),
        ),
        child: Row(
          children: [
            Container(
              width: 24,
              height: 24,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: done ? const Color(0xFF22C55E) : Colors.transparent,
                border: Border.all(
                  color: done ? const Color(0xFF22C55E) : (isOverdue ? Colors.redAccent : AppColors.border),
                  width: 2,
                ),
              ),
              child: done ? const Icon(Icons.check, size: 14, color: Colors.white) : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    task.nomi,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      decoration: done ? TextDecoration.lineThrough : null,
                      color: done ? AppColors.muted : AppColors.text,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          project.nomi,
                          style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (task.muddat != null) ...[
                        const SizedBox(width: 8),
                        Text(
                          isOverdue ? 'Kechikkan' : DateFormat('dd.MM.yyyy').format(task.muddat!),
                          style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: dateColor),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );

    if (onDelete == null && onComplete == null) return tile;

    return Dismissible(
      key: Key('tasks_screen_${task.id}'),
      confirmDismiss: (_) async => true,
      onDismissed: (dir) {
        if (dir == DismissDirection.endToStart) onDelete?.call();
        else onComplete?.call();
      },
      direction: onComplete != null && onDelete != null
          ? DismissDirection.horizontal
          : onDelete != null
              ? DismissDirection.endToStart
              : DismissDirection.startToEnd,
      background: Container(
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.only(left: 20),
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: onComplete != null ? const Color(0xFF22C55E).withOpacity(0.85) : Colors.transparent,
          borderRadius: BorderRadius.circular(14),
        ),
        child: onComplete != null ? const Icon(Icons.check_circle_outline_rounded, color: Colors.white, size: 24) : null,
      ),
      secondaryBackground: onDelete != null
          ? Container(
              alignment: Alignment.centerRight,
              padding: const EdgeInsets.only(right: 20),
              margin: const EdgeInsets.only(bottom: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFEF4444).withOpacity(0.85),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Icon(Icons.delete_outline_rounded, color: Colors.white, size: 24),
            )
          : null,
      child: tile,
    );
  }
}
