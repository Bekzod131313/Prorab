import 'package:flutter/material.dart';

import '../models/member.dart';
import '../theme/app_theme.dart';
import 'project_card.dart' show formatMoney;

const _avatarColors = [
  Color(0xFF1D4ED8),
  Color(0xFF3B82F6),
  Color(0xFFA855F7),
  Color(0xFFEA580C),
  Color(0xFFF59E0B),
  Color(0xFFEF4444),
];

Color colorForName(String name) {
  var h = 0;
  for (final c in name.runes) {
    h += c;
  }
  return _avatarColors[h % _avatarColors.length];
}

class MemberRow extends StatelessWidget {
  final ObMember member;

  const MemberRow({super.key, required this.member});

  @override
  Widget build(BuildContext context) {
    final name = member.displayName;
    final color = colorForName(name);
    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
              color: color,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              initial,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  member.kasb?.isNotEmpty == true ? member.kasb! : member.roleLabel,
                  style: const TextStyle(fontSize: 12, color: AppColors.text2),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                formatMoney(member.balance),
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Color(0xFF16A34A)),
              ),
              const SizedBox(height: 2),
              const Text("qo'lida", style: TextStyle(fontSize: 11, color: AppColors.muted)),
            ],
          ),
        ],
      ),
    );
  }
}
