import 'package:flutter/material.dart';

import '../models/material.dart';
import '../theme/app_theme.dart';
import 'project_card.dart' show formatMoney;

const _statusColors = {
  'kerak': Color(0xFFF43F5E),
  'buyurtma': Color(0xFFF59E0B),
  'yetkazildi': Color(0xFF22C55E),
};

class MaterialRow extends StatelessWidget {
  final ObMaterial material;
  final VoidCallback? onTap;

  const MaterialRow({super.key, required this.material, this.onTap});

  @override
  Widget build(BuildContext context) {
    final color = _statusColors[material.holat] ?? AppColors.muted;

    return InkWell(
      onTap: onTap,
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
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: const Color(0xFFF59E0B).withOpacity(0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.inventory_2_outlined, color: Color(0xFFF59E0B), size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(material.nomi, style: const TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text(
                  '${material.statusLabel} • ${material.miqdor} ${material.birlik}',
                  style: TextStyle(fontSize: 11.5, color: color, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
          if (material.narx != null && material.narx! > 0)
            Text(formatMoney(material.total), style: const TextStyle(fontWeight: FontWeight.w900)),
        ],
      ),
    ),
    );
  }
}

