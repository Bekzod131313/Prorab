import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/project.dart';
import '../theme/app_theme.dart';
import '../widgets/project_card.dart' show formatMoney, colorForProject;

class CompareScreen extends StatefulWidget {
  final List<Project> projects;

  const CompareScreen({super.key, required this.projects});

  @override
  State<CompareScreen> createState() => _CompareScreenState();
}

class _CompareScreenState extends State<CompareScreen> {
  Project? _a;
  Project? _b;

  @override
  void initState() {
    super.initState();
    final owned = widget.projects.where((p) => p.role == 'owner').toList();
    if (owned.length >= 2) {
      _a = owned[0];
      _b = owned[1];
    } else if (owned.length == 1) {
      _a = owned[0];
    }
  }

  @override
  Widget build(BuildContext context) {
    final projects = widget.projects.where((p) => p.role == 'owner').toList();

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: const Text('Loyihalar taqqoslash'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          // Selectors
          Row(
            children: [
              Expanded(child: _ProjectSelector(
                label: 'Loyiha A',
                selected: _a,
                projects: projects,
                onChanged: (p) => setState(() => _a = p),
              )),
              const SizedBox(width: 12),
              const Text('VS', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: AppColors.muted)),
              const SizedBox(width: 12),
              Expanded(child: _ProjectSelector(
                label: 'Loyiha B',
                selected: _b,
                projects: projects,
                onChanged: (p) => setState(() => _b = p),
              )),
            ],
          ),
          const SizedBox(height: 16),

          if (_a != null && _b != null) ...[
            _CompareCard(a: _a!, b: _b!),
          ] else
            const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Text('Ikkita loyiha tanlang', style: TextStyle(color: AppColors.muted, fontSize: 14)),
              ),
            ),
        ],
      ),
    );
  }
}

class _ProjectSelector extends StatelessWidget {
  final String label;
  final Project? selected;
  final List<Project> projects;
  final ValueChanged<Project?> onChanged;

  const _ProjectSelector({required this.label, required this.selected, required this.projects, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<Project>(
          value: selected,
          hint: Text(label, style: const TextStyle(color: AppColors.muted, fontSize: 12)),
          isExpanded: true,
          dropdownColor: AppColors.card,
          style: const TextStyle(color: AppColors.text, fontSize: 13),
          items: projects.map((p) => DropdownMenuItem(value: p, child: Text(p.nomi, overflow: TextOverflow.ellipsis))).toList(),
          onChanged: onChanged,
        ),
      ),
    );
  }
}

class _CompareCard extends StatelessWidget {
  final Project a;
  final Project b;

  const _CompareCard({required this.a, required this.b});

  @override
  Widget build(BuildContext context) {
    final colorA = colorForProject(a.id);
    final colorB = colorForProject(b.id);

    return Column(
      children: [
        // Header
        Row(
          children: [
            Expanded(child: _HeaderChip(project: a, color: colorA)),
            const SizedBox(width: 8),
            Expanded(child: _HeaderChip(project: b, color: colorB)),
          ],
        ),
        const SizedBox(height: 12),

        // Comparison rows
        _CompareTable(a: a, b: b, colorA: colorA, colorB: colorB),
      ],
    );
  }
}

class _HeaderChip extends StatelessWidget {
  final Project project;
  final Color color;

  const _HeaderChip({required this.project, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              Expanded(child: Text(project.nomi, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12), overflow: TextOverflow.ellipsis)),
            ],
          ),
          if (project.manzil != null) ...[
            const SizedBox(height: 2),
            Text(project.manzil!, style: const TextStyle(fontSize: 10, color: AppColors.muted), overflow: TextOverflow.ellipsis),
          ],
        ],
      ),
    );
  }
}

class _CompareTable extends StatelessWidget {
  final Project a;
  final Project b;
  final Color colorA;
  final Color colorB;

  const _CompareTable({required this.a, required this.b, required this.colorA, required this.colorB});

  @override
  Widget build(BuildContext context) {
    final profitA = a.kirim - a.chiqim;
    final profitB = b.kirim - b.chiqim;
    final (passedA, leftA, progressA) = a.schedule;
    final (passedB, leftB, progressB) = b.schedule;
    final marginA = a.kirim > 0 ? (profitA / a.kirim * 100) : 0.0;
    final marginB = b.kirim > 0 ? (profitB / b.kirim * 100) : 0.0;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          _Row(label: 'Kirim', valA: '${formatMoney(a.kirim)} so\'m', valB: '${formatMoney(b.kirim)} so\'m',
              winnerIsA: a.kirim >= b.kirim, colorA: colorA, colorB: colorB),
          _Row(label: 'Chiqim', valA: '${formatMoney(a.chiqim)} so\'m', valB: '${formatMoney(b.chiqim)} so\'m',
              winnerIsA: a.chiqim <= b.chiqim, colorA: colorA, colorB: colorB),
          _Row(label: 'Foyda', valA: '${formatMoney(profitA)} so\'m', valB: '${formatMoney(profitB)} so\'m',
              winnerIsA: profitA >= profitB, colorA: colorA, colorB: colorB),
          _Row(label: 'Marj', valA: '${marginA.toStringAsFixed(1)}%', valB: '${marginB.toStringAsFixed(1)}%',
              winnerIsA: marginA >= marginB, colorA: colorA, colorB: colorB),
          _Row(label: 'Muddat', valA: '${a.muddat} kun', valB: '${b.muddat} kun',
              winnerIsA: a.muddat <= b.muddat, colorA: colorA, colorB: colorB),
          _Row(label: 'Jadval', valA: '$progressA%', valB: '$progressB%',
              winnerIsA: null, colorA: colorA, colorB: colorB),
          _Row(label: 'Holat', valA: a.status, valB: b.status,
              winnerIsA: null, colorA: colorA, colorB: colorB, isLast: true),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final String label;
  final String valA;
  final String valB;
  final bool? winnerIsA;
  final Color colorA;
  final Color colorB;
  final bool isLast;

  const _Row({
    required this.label,
    required this.valA,
    required this.valB,
    required this.winnerIsA,
    required this.colorA,
    required this.colorB,
    this.isLast = false,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Expanded(
                child: Row(
                  children: [
                    Text(valA, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13,
                        color: winnerIsA == true ? colorA : AppColors.text)),
                    if (winnerIsA == true) const SizedBox(width: 4),
                    if (winnerIsA == true) const Icon(Icons.arrow_upward_rounded, size: 12, color: Color(0xFF22C55E)),
                  ],
                ),
              ),
              Text(label, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
              Expanded(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    if (winnerIsA == false) const Icon(Icons.arrow_upward_rounded, size: 12, color: Color(0xFF22C55E)),
                    if (winnerIsA == false) const SizedBox(width: 4),
                    Text(valB, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13,
                        color: winnerIsA == false ? colorB : AppColors.text)),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (!isLast) const Divider(color: AppColors.border, height: 1),
      ],
    );
  }
}
