import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/project.dart';
import '../models/transaction.dart';
import '../services/currency_service.dart';
import '../theme/app_theme.dart';

const _cardColors = [
  Color(0xFFF97316),
  Color(0xFF3B82F6),
  Color(0xFFA855F7),
  Color(0xFF1D4ED8),
  Color(0xFFF59E0B),
];

Color colorForProject(String nomi) {
  var h = 0;
  for (final c in nomi.runes) {
    h += c;
  }
  return _cardColors[h % _cardColors.length];
}

String formatMoney(num value, {String? currency}) {
  final activeCurrency = currency ?? CurrencyService().displayCurrency;
  if (activeCurrency == 'USD') {
    final f = NumberFormat.decimalPattern('en_US');
    return '\$${f.format(value)}';
  } else {
    final f = NumberFormat.decimalPattern('uz');
    return '${f.format(value)} so\'m';
  }
}

String formatUzsToDisplay(num valueUzs) {
  final service = CurrencyService();
  final converted = service.convertUzsToDisplay(valueUzs.toDouble());
  return formatMoney(converted);
}

String formatTransactionAmount(ProjectTransaction tx) {
  final service = CurrencyService();
  if (service.displayCurrency == 'USD') {
    final usdVal = tx.summaUsd;
    final f = NumberFormat.decimalPattern('en_US');
    return '\$${f.format(usdVal)}';
  } else {
    final uzsVal = tx.summaUzs;
    final f = NumberFormat.decimalPattern('uz');
    return '${f.format(uzsVal)} so\'m';
  }
}

class ProjectCard extends StatelessWidget {
  final Project project;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final bool isPinned;

  const ProjectCard({super.key, required this.project, this.onTap, this.onLongPress, this.isPinned = false});

  static const _roleLabels = {
    'owner': 'Egasi',
    'member': 'Usta',
    'worker': 'Ishchi',
  };

  @override
  Widget build(BuildContext context) {
    final color = colorForProject(project.nomi);
    final bal = project.balance;
    final balColor = bal >= 0 ? const Color(0xFF16A34A) : const Color(0xFFEF4444);
    final (_, left, progress) = project.schedule;
    final initial = project.nomi.isNotEmpty ? project.nomi[0].toUpperCase() : '?';

    return InkWell(
      onTap: onTap,
      onLongPress: onLongPress,
      borderRadius: BorderRadius.circular(22),
      child: Container(
        padding: const EdgeInsets.all(18),
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: AppColors.border),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.025),
              blurRadius: 16,
              spreadRadius: -2,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: color.withOpacity(0.2), width: 1),
                  ),
                  child: Text(
                    initial,
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: color),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              project.nomi,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.3,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          if (isPinned)
                            const Icon(Icons.push_pin_rounded, size: 14, color: AppColors.accent),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Row(
                        children: [
                          _RoleBadge(label: _roleLabels[project.role] ?? project.role),
                          if (project.status == 'done') ...[
                            const SizedBox(width: 6),
                            const _RoleBadge(label: 'Yakunlandi', color: Color(0xFF22C55E)),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _StatItem(
                    label: 'QOLDIQ',
                    value: '${bal >= 0 ? '+' : ''}${formatUzsToDisplay(bal)}',
                    color: balColor,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: project.role == 'owner'
                      ? _StatItem(label: 'KIRIM', value: formatUzsToDisplay(project.kirim), color: const Color(0xFF16A34A))
                      : _StatItem(label: 'ISHHAQI', value: formatUzsToDisplay(project.ishaqi), color: AppColors.accentTeal),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: LinearProgressIndicator(
                      value: progress / 100,
                      minHeight: 5,
                      backgroundColor: AppColors.border,
                      valueColor: const AlwaysStoppedAnimation(AppColors.accentTeal),
                    ),
                  ),
                ),
                if (project.role == 'owner') ...[
                  const SizedBox(width: 10),
                  _HealthBadge(score: project.healthScore),
                ],
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '$left kun qoldi',
              style: const TextStyle(color: AppColors.muted, fontSize: 12, fontWeight: FontWeight.w500),
            ),
          ],
        ),
      ),
    );
  }
}

class _HealthBadge extends StatelessWidget {
  final int score;
  const _HealthBadge({required this.score});

  @override
  Widget build(BuildContext context) {
    final Color color;
    final String label;
    if (score >= 80) {
      color = const Color(0xFF22C55E);
      label = '●';
    } else if (score >= 50) {
      color = const Color(0xFFF59E0B);
      label = '●';
    } else {
      color = const Color(0xFFEF4444);
      label = '●';
    }
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: TextStyle(fontSize: 10, color: color)),
        const SizedBox(width: 3),
        Text('$score%', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: color)),
      ],
    );
  }
}

class _RoleBadge extends StatelessWidget {
  final String label;
  final Color color;
  const _RoleBadge({required this.label, this.color = AppColors.accent});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.2), width: 1),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: color),
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;
  final Color? color;

  const _StatItem({required this.label, required this.value, this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.bg,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 10, color: AppColors.muted, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
          const SizedBox(height: 3),
          Text(
            value,
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: color ?? AppColors.text),
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
