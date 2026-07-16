import 'package:flutter/material.dart';

/// Renders the logo image asset used across the brand.
class MoliyaLogo extends StatelessWidget {
  final double size;

  const MoliyaLogo({super.key, this.size = 64});

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/logo.png',
      width: size,
      height: size,
      fit: BoxFit.contain,
    );
  }
}
