import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../main.dart';
import '../models/transaction.dart';
import '../theme/app_theme.dart';
import 'project_card.dart' show formatMoney;

class TransactionRow extends StatelessWidget {
  final ProjectTransaction tx;
  final VoidCallback? onTap;

  const TransactionRow({super.key, required this.tx, this.onTap});

  @override
  Widget build(BuildContext context) {
    final userId = supabase.auth.currentUser?.id;
    final isIn = tx.isIncomeFor(userId ?? '');
    final isOut = tx.isExpenseFor(userId ?? '');
    final color = isIn
        ? const Color(0xFF16A34A)
        : isOut
            ? const Color(0xFFEF4444)
            : AppColors.muted;
    final sign = isIn ? '+' : (isOut ? '-' : '');

    String title;
    switch (tx.tur) {
      case 'income':
        title = tx.izoh?.isNotEmpty == true ? tx.izoh! : 'Pul kirdi';
        break;
      case 'spend':
        title = tx.kategoriya ?? 'Xarajat';
        break;
      default:
        title = isIn ? "O'tkazma keldi" : "O'tkazma yuborildi";
    }

    final dateStr = DateFormat('dd.MM.yyyy HH:mm').format(tx.date);

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
              color: (isIn ? const Color(0xFF16A34A) : const Color(0xFFEF4444)).withOpacity(0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              isIn ? Icons.south_west_rounded : Icons.north_east_rounded,
              color: isIn ? const Color(0xFF16A34A) : const Color(0xFFEF4444),
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  tx.izoh?.isNotEmpty == true && tx.tur != 'income'
                      ? '${tx.izoh} • $dateStr'
                      : dateStr,
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          Text(
            '$sign${formatMoney(tx.summa)}',
            style: TextStyle(fontWeight: FontWeight.w800, color: color),
          ),
        ],
      ),
      ),
    );
  }
}
