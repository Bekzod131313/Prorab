import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class PieChartData {
  final String label;
  final double value;
  final Color color;

  const PieChartData({required this.label, required this.value, required this.color});
}

class MoliyaPieChart extends StatelessWidget {
  final List<PieChartData> data;
  final double size;

  const MoliyaPieChart({super.key, required this.data, this.size = 140});

  @override
  Widget build(BuildContext context) {
    final total = data.fold<double>(0, (s, d) => s + d.value);
    if (total == 0) return const SizedBox();

    return Row(
      children: [
        CustomPaint(
          size: Size(size, size),
          painter: _PiePainter(data: data, total: total),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: data.map((d) {
              final pct = (d.value / total * 100).round();
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: [
                    Container(width: 10, height: 10, decoration: BoxDecoration(color: d.color, borderRadius: BorderRadius.circular(3))),
                    const SizedBox(width: 6),
                    Expanded(child: Text(d.label, style: const TextStyle(fontSize: 11, color: AppColors.text2), overflow: TextOverflow.ellipsis)),
                    Text('$pct%', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted)),
                  ],
                ),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }
}

class _PiePainter extends CustomPainter {
  final List<PieChartData> data;
  final double total;

  const _PiePainter({required this.data, required this.total});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 4;
    final paint = Paint()..style = PaintingStyle.fill;
    double startAngle = -math.pi / 2;

    for (final d in data) {
      final sweep = (d.value / total) * 2 * math.pi;
      paint.color = d.color;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        sweep,
        true,
        paint,
      );
      // Gap
      paint.color = AppColors.card;
      paint.strokeWidth = 2;
      paint.style = PaintingStyle.stroke;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        sweep,
        true,
        paint,
      );
      paint.style = PaintingStyle.fill;
      startAngle += sweep;
    }

    // Center hole
    paint.color = AppColors.card;
    canvas.drawCircle(center, radius * 0.55, paint);

  }

  @override
  bool shouldRepaint(_PiePainter old) => old.data != data;
}
