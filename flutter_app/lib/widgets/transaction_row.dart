import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../main.dart';
import '../models/transaction.dart';
import '../theme/app_theme.dart';
import 'project_card.dart' show formatMoney;

class TransactionRow extends StatelessWidget {
  final ProjectTransaction tx;
  final VoidCallback? onTap;
  final VoidCallback? onDelete;

  const TransactionRow({super.key, required this.tx, this.onTap, this.onDelete});

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

    const _catLabels = {
      'mijoz': 'Mijozdan',
      'kredit': 'Kredit',
      'owner': 'Prorab avans',
      'ishchi': 'Ishchi',
      'usta': 'Usta',
      'boshqa': 'Boshqa',
    };

    String title;
    switch (tx.tur) {
      case 'income':
        title = tx.izoh?.isNotEmpty == true ? tx.izoh! : 'Pul kirdi';
        break;
      case 'spend':
        final cat = tx.kategoriya;
        title = (cat != null && cat.isNotEmpty) ? (_catLabels[cat] ?? cat) : 'Xarajat';
        break;
      case 'ishhaqi':
        title = isIn ? 'Ish haqi olindi' : 'Ish haqi yozildi';
        break;
      case 'send':
        title = isIn ? 'Avans olindi' : 'Avans yuborildi';
        break;
      default:
        title = tx.izoh?.isNotEmpty == true ? tx.izoh! : tx.tur;
    }

    final dateStr = DateFormat('dd.MM.yyyy HH:mm').format(tx.date);

    final tile = InkWell(
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

    if (onDelete == null) return tile;
    return Dismissible(
      key: Key(tx.id),
      direction: DismissDirection.endToStart,
      confirmDismiss: (_) async => true,
      onDismissed: (_) => onDelete!(),
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          color: const Color(0xFFEF4444).withOpacity(0.85),
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Icon(Icons.delete_outline_rounded, color: Colors.white, size: 24),
      ),
      child: tile,
    );
  }
}
