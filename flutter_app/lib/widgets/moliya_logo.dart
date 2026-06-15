import 'package:flutter/material.dart';

/// Renders the Moliya "M / house / growth bars" mark used across the brand.
class MoliyaLogo extends StatelessWidget {
  final double size;

  const MoliyaLogo({super.key, this.size = 64});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _MoliyaLogoPainter()),
    );
  }
}

class _MoliyaLogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 100;

    final bluePath = Path()
      ..moveTo(26.5 * s, 25.5 * s)
      ..lineTo(40 * s, 25.5 * s)
      ..lineTo(40 * s, 74.5 * s)
      ..lineTo(26.5 * s, 74.5 * s)
      ..close()
      ..moveTo(26.5 * s, 25.5 * s)
      ..lineTo(40 * s, 25.5 * s)
      ..lineTo(50 * s, 40 * s)
      ..close();

    final tealPath = Path()
      ..moveTo(60 * s, 25.5 * s)
      ..lineTo(73.5 * s, 25.5 * s)
      ..lineTo(73.5 * s, 74.5 * s)
      ..lineTo(60 * s, 74.5 * s)
      ..close()
      ..moveTo(60 * s, 25.5 * s)
      ..lineTo(73.5 * s, 25.5 * s)
      ..lineTo(50 * s, 40 * s)
      ..close();

    final bluePaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [const Color(0xFF3B82F6), const Color(0xFF2563EB)],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));

    final tealPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [const Color(0xFF2DD4BF), const Color(0xFF14B8A6)],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));

    canvas.drawPath(bluePath, bluePaint);
    canvas.drawPath(tealPath, tealPaint);

    final barPaint = Paint()..color = Colors.white;
    void bar(double x, double y, double h) {
      final rect = Rect.fromLTWH(x * s, y * s, 8.5 * s, h * s);
      canvas.drawRRect(RRect.fromRectAndRadius(rect, Radius.circular(1.5 * s)), barPaint);
    }

    bar(32.75, 60.5, 14);
    bar(45.75, 52.5, 22);
    bar(58.75, 44.5, 30);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
