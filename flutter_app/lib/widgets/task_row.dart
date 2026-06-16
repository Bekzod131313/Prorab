import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/task.dart';
import '../theme/app_theme.dart';

const _statusColors = {
  'todo': AppColors.muted,
  'progress': Color(0xFFF59E0B),
  'done': Color(0xFF22C55E),
};

class TaskRow extends StatelessWidget {
  final ObTask task;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final VoidCallback? onDelete;
  final VoidCallback? onComplete;

  const TaskRow({super.key, required this.task, this.onTap, this.onLongPress, this.onDelete, this.onComplete});

  @override
  Widget build(BuildContext context) {
    final done = task.holat == 'done';
    final color = _statusColors[task.holat] ?? AppColors.muted;

    final tile = InkWell(
      onTap: onTap,
      onLongPress: onLongPress,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(12),
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.border),
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
                border: Border.all(color: done ? const Color(0xFF22C55E) : AppColors.border, width: 2),
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
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Text(task.statusLabel, style: TextStyle(fontSize: 11.5, color: color, fontWeight: FontWeight.w700)),
                      if (task.muddat != null) ...[
                        const SizedBox(width: 6),
                        Text(
                          '• ${DateFormat('dd.MM.yyyy').format(task.muddat!)}',
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                            color: !done && task.muddat!.isBefore(DateTime.now()) ? const Color(0xFFEF4444) : AppColors.muted,
                          ),
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
      key: Key(task.id),
      confirmDismiss: (direction) async => true,
      onDismissed: (direction) {
        if (direction == DismissDirection.endToStart) {
          onDelete?.call();
        } else {
          onComplete?.call();
        }
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
          color: onComplete != null
              ? const Color(0xFF22C55E).withOpacity(0.85)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(14),
        ),
        child: onComplete != null
            ? const Icon(Icons.check_circle_outline_rounded, color: Colors.white, size: 24)
            : null,
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
