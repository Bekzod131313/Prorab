import 'package:flutter/material.dart';

import '../models/member.dart';
import '../theme/app_theme.dart';
import '../screens/profile_screen.dart';
import 'project_card.dart' show formatMoney, formatUzsToDisplay;

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
  final VoidCallback? onTap;

  const MemberRow({super.key, required this.member, this.onTap});

  @override
  Widget build(BuildContext context) {
    final name = member.displayName;
    final color = colorForName(name);
    final initial = name.isNotEmpty ? name[0].toUpperCase() : '?';

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          GestureDetector(
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => ProfileScreen(userId: member.userId),
                ),
              );
            },
            child: Container(
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
          ),
          const SizedBox(width: 12),
          Expanded(
            child: GestureDetector(
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ProfileScreen(userId: member.userId),
                  ),
                );
              },
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
          ),
          Builder(builder: (_) {
            final bal = member.balance;
            final balColor = bal >= 0 ? const Color(0xFF16A34A) : const Color(0xFFEF4444);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${bal >= 0 ? '+' : ''}${formatUzsToDisplay(bal)}',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: balColor),
                ),
                const SizedBox(height: 2),
                const Text('balans', style: TextStyle(fontSize: 11, color: AppColors.muted)),
              ],
            );
          }),
        ],
      ),
      ),
    );
  }
}
