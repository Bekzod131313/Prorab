import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../l10n/strings.dart';
import '../models/project.dart';
import '../models/transaction.dart';
import '../services/currency_service.dart';
import '../theme/app_theme.dart';
import '../utils/haptics.dart';

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
  final rounded = value.round();
  if (activeCurrency == 'USD') {
    final f = NumberFormat.decimalPattern('en_US');
    return '\$${f.format(rounded)}';
  } else {
    final f = NumberFormat.decimalPattern('uz');
    return "${f.format(rounded)} ${tr('currency_suffix')}";
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
    final usdVal = tx.summaUsd.round();
    final f = NumberFormat.decimalPattern('en_US');
    return '\$${f.format(usdVal)}';
  } else {
    final uzsVal = tx.summaUzs.round();
    final f = NumberFormat.decimalPattern('uz');
    return "${f.format(uzsVal)} ${tr('currency_suffix')}";
  }
}

class ProjectCard extends StatelessWidget {
  final Project project;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final bool isPinned;

  const ProjectCard({super.key, required this.project, this.onTap, this.onLongPress, this.isPinned = false});


  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: appLocaleNotifier,
      builder: (context, locale, _) {
        final color = colorForProject(project.nomi);
        final bal = project.balance;
        final balColor = bal >= 0 ? const Color(0xFF16A34A) : const Color(0xFFEF4444);
        final (_, left, progress) = project.schedule;
        final initial = project.nomi.isNotEmpty ? project.nomi[0].toUpperCase() : '?';

        final roleLabels = {
          'owner': tr('role_owner'),
          'member': tr('role_member'),
          'worker': tr('role_worker'),
        };

        return InkWell(
      onTap: onTap != null ? () { AppHaptics.light(); onTap!(); } : null,
      onLongPress: onLongPress != null ? () { AppHaptics.longPress(); onLongPress!(); } : null,
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
                          _RoleBadge(label: roleLabels[project.role] ?? project.role),
                          if (project.status == 'done') ...[
                            const SizedBox(width: 6),
                            _RoleBadge(label: tr('yakunlandi'), color: const Color(0xFF22C55E)),
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
                    label: tr('balance').toUpperCase(),
                    value: '${bal >= 0 ? '+' : ''}${formatUzsToDisplay(bal)}',
                    color: balColor,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _StatItem(
                    label: tr('income').toUpperCase(),
                    value: formatUzsToDisplay(project.kirim),
                    color: const Color(0xFF16A34A),
                  ),
                ),
              ],
            ),
            if (project.role == 'owner') ...[
              const SizedBox(height: 10),
              _HealthBadge(score: project.healthScore),
            ],
            const SizedBox(height: 8),
            Text(
              '$left ${tr('days_left')}',
              style: const TextStyle(color: AppColors.muted, fontSize: 12, fontWeight: FontWeight.w500),
            ),
          ],
        ),
      ),
    );
      },
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
