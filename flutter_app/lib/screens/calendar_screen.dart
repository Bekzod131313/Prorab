import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/task_repository.dart';
import '../models/project.dart';
import '../models/task.dart';
import '../theme/app_theme.dart';
import 'project_detail_screen.dart';

class CalendarScreen extends StatefulWidget {
  final List<Project> projects;

  const CalendarScreen({super.key, required this.projects});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  final _taskRepo = TaskRepository();
  Map<String, List<_TaskWithProject>> _tasksByDate = {};
  bool _loading = true;
  DateTime _selectedWeekStart = _weekStart(DateTime.now());
  DateTime _selectedDay = DateTime.now();

  static DateTime _weekStart(DateTime date) {
    final weekday = date.weekday;
    return DateTime(date.year, date.month, date.day).subtract(Duration(days: weekday - 1));
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final Map<String, List<_TaskWithProject>> byDate = {};
    for (final proj in widget.projects) {
      try {
        final tasks = await _taskRepo.loadForProject(proj.id);
        for (final t in tasks) {
          if (t.muddat == null) continue;
          final key = _dateKey(t.muddat!);
          byDate.putIfAbsent(key, () => []).add(_TaskWithProject(task: t, project: proj));
        }
      } catch (_) {}
    }
    if (mounted) setState(() { _tasksByDate = byDate; _loading = false; });
  }

  String _dateKey(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  List<_TaskWithProject> _tasksForDay(DateTime day) => _tasksByDate[_dateKey(day)] ?? [];

  void _prevWeek() => setState(() {
    _selectedWeekStart = _selectedWeekStart.subtract(const Duration(days: 7));
    _selectedDay = _selectedWeekStart;
  });

  void _nextWeek() => setState(() {
    _selectedWeekStart = _selectedWeekStart.add(const Duration(days: 7));
    _selectedDay = _selectedWeekStart;
  });

  @override
  Widget build(BuildContext context) {
    final days = List.generate(7, (i) => _selectedWeekStart.add(Duration(days: i)));
    final selectedTasks = _tasksForDay(_selectedDay);
    final df = DateFormat('d MMM', 'uz');
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: const Text('Jadval'),
        actions: [
          IconButton(
            icon: const Icon(Icons.today_rounded),
            onPressed: () => setState(() {
              _selectedWeekStart = _weekStart(now);
              _selectedDay = today;
            }),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: Column(
                children: [
                  // Week navigation
                  Container(
                    color: AppColors.card.withOpacity(0.5),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Row(
                      children: [
                        IconButton(
                          icon: const Icon(Icons.chevron_left_rounded),
                          onPressed: _prevWeek,
                          color: AppColors.text2,
                        ),
                        Expanded(
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceAround,
                            children: days.map((day) {
                              final isSelected = _dateKey(day) == _dateKey(_selectedDay);
                              final isToday = _dateKey(day) == _dateKey(today);
                              final count = _tasksForDay(day).length;
                              final hasOverdue = _tasksForDay(day).any((t) => t.task.holat != 'done' && day.isBefore(today));
                              return GestureDetector(
                                onTap: () => setState(() => _selectedDay = day),
                                child: AnimatedContainer(
                                  duration: const Duration(milliseconds: 200),
                                  width: 38,
                                  padding: const EdgeInsets.symmetric(vertical: 8),
                                  decoration: BoxDecoration(
                                    color: isSelected ? AppColors.accent : Colors.transparent,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Column(
                                    children: [
                                      Text(
                                        _dayLetter(day.weekday),
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w700,
                                          color: isSelected ? Colors.white : AppColors.muted,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        '${day.day}',
                                        style: TextStyle(
                                          fontSize: 16,
                                          fontWeight: FontWeight.w800,
                                          color: isSelected ? Colors.white : (isToday ? AppColors.accent : AppColors.text),
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      if (count > 0)
                                        Container(
                                          width: 6,
                                          height: 6,
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: isSelected
                                                ? Colors.white.withOpacity(0.8)
                                                : (hasOverdue ? Colors.redAccent : const Color(0xFFF59E0B)),
                                          ),
                                        )
                                      else
                                        const SizedBox(height: 6),
                                    ],
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.chevron_right_rounded),
                          onPressed: _nextWeek,
                          color: AppColors.text2,
                        ),
                      ],
                    ),
                  ),
                  // Selected day header
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                    child: Row(
                      children: [
                        Text(
                          df.format(_selectedDay),
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(width: 8),
                        if (_dateKey(_selectedDay) == _dateKey(today))
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: AppColors.accent.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text('Bugun', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.accent)),
                          ),
                        const Spacer(),
                        if (selectedTasks.isNotEmpty)
                          Text('${selectedTasks.length} ta vazifa', style: const TextStyle(fontSize: 13, color: AppColors.muted, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                  // Tasks list
                  Expanded(
                    child: selectedTasks.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.event_available_rounded, size: 48, color: AppColors.muted.withOpacity(0.4)),
                                const SizedBox(height: 12),
                                const Text('Bu kunda vazifa yo\'q', style: TextStyle(color: AppColors.muted)),
                              ],
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                            itemCount: selectedTasks.length,
                            itemBuilder: (ctx, i) {
                              final item = selectedTasks[i];
                              final task = item.task;
                              final done = task.holat == 'done';
                              final isOverdue = !done && _selectedDay.isBefore(today);
                              return GestureDetector(
                                onTap: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: item.project)),
                                ).then((_) => _load()),
                                child: Container(
                                  margin: const EdgeInsets.only(bottom: 10),
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                    color: AppColors.card,
                                    borderRadius: BorderRadius.circular(16),
                                    border: Border.all(
                                      color: isOverdue ? Colors.redAccent.withOpacity(0.35)
                                          : done ? const Color(0xFF22C55E).withOpacity(0.25)
                                          : AppColors.border,
                                    ),
                                  ),
                                  child: Row(
                                    children: [
                                      Container(
                                        width: 28,
                                        height: 28,
                                        alignment: Alignment.center,
                                        decoration: BoxDecoration(
                                          shape: BoxShape.circle,
                                          color: done ? const Color(0xFF22C55E) : Colors.transparent,
                                          border: Border.all(
                                            color: done ? const Color(0xFF22C55E) : (isOverdue ? Colors.redAccent : AppColors.border),
                                            width: 2,
                                          ),
                                        ),
                                        child: done ? const Icon(Icons.check, size: 16, color: Colors.white) : null,
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
                                                fontSize: 14,
                                                decoration: done ? TextDecoration.lineThrough : null,
                                                color: done ? AppColors.muted : AppColors.text,
                                              ),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                            const SizedBox(height: 2),
                                            Text(
                                              item.project.nomi,
                                              style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ],
                                        ),
                                      ),
                                      _StatusChip(holat: task.holat, isOverdue: isOverdue),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                  ),
                ],
              ),
            ),
    );
  }

  String _dayLetter(int weekday) {
    const letters = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
    return letters[(weekday - 1) % 7];
  }
}

class _TaskWithProject {
  final ObTask task;
  final Project project;
  _TaskWithProject({required this.task, required this.project});
}

class _StatusChip extends StatelessWidget {
  final String holat;
  final bool isOverdue;

  const _StatusChip({required this.holat, required this.isOverdue});

  @override
  Widget build(BuildContext context) {
    if (isOverdue) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: Colors.redAccent.withOpacity(0.12),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Text('Kechikkan', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.redAccent)),
      );
    }
    if (holat == 'done') {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: const Color(0xFF22C55E).withOpacity(0.12),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Text('Bajarildi', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF22C55E))),
      );
    }
    if (holat == 'progress') {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: const Color(0xFFF59E0B).withOpacity(0.12),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Text('Jarayon', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFFF59E0B))),
      );
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.border,
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Text('Kutmoqda', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted)),
    );
  }
}
