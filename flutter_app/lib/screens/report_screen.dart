import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';

import '../data/project_repository.dart';
import '../data/report_repository.dart';
import '../main.dart';
import '../models/project.dart';
import '../theme/app_theme.dart';
import '../widgets/project_card.dart' show formatMoney;
import 'materials_screen.dart';
import 'compare_screen.dart';

class ReportScreen extends StatefulWidget {
  const ReportScreen({super.key});

  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  final _projectRepo = ProjectRepository();
  final _reportRepo = ReportRepository();

  String _period = 'all';
  bool _loading = true;
  String? _error;
  ReportData? _data;
  List<Project> _projects = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final projects = await _projectRepo.loadProjects();
      final data = await _reportRepo.load(projects, period: _period);
      if (!mounted) return;
      setState(() {
        _projects = projects;
        _data = data;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _setPeriod(String period) {
    if (_period == period) return;
    setState(() => _period = period);
    _load();
  }

  Future<void> _exportCsv() async {
    final data = _data;
    if (data == null) return;

    final userId = supabase.auth.currentUser?.id ?? '';
    final buf = StringBuffer();
    buf.writeln('Sana,Obyekt,Tur,Izoh,Summa');
    for (final tx in data.txs) {
      if (!tx.isIncomeFor(userId) && !tx.isExpenseFor(userId)) continue;
      final dateStr = DateFormat('dd.MM.yyyy HH:mm').format(tx.date);
      final obNomi = data.obNames[tx.obId] ?? '';
      final izoh = (tx.izoh ?? '').replaceAll(',', ' ').replaceAll('\n', ' ');
      buf.writeln('$dateStr,$obNomi,${tx.tur},$izoh,${tx.summa}');
    }
    buf.writeln();
    buf.writeln('KIRIM,${data.totalIn}');
    buf.writeln('CHIQIM,${data.totalOut}');
    buf.writeln('FOYDA,${data.foyda}');

    final date = DateTime.now().toIso8601String().substring(0, 10);
    await Share.share(buf.toString(), subject: 'moliya-hisobot-$date.csv');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: const Text('Hisobot'),
        actions: [
          IconButton(
            icon: const Icon(Icons.compare_arrows_rounded),
            tooltip: 'Taqqoslash',
            onPressed: _projects.length >= 2 ? () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => CompareScreen(projects: _projects)),
            ) : null,
          ),
          IconButton(
            icon: const Icon(Icons.inventory_2_outlined),
            tooltip: 'Materiallar',
            onPressed: _projects.isEmpty ? null : () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => MaterialsScreen(projects: _projects)),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.ios_share_rounded),
            onPressed: _data == null ? null : _exportCsv,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return ListView(
        children: [
          const SizedBox(height: 80),
          Center(
            child: Text('Xatolik: $_error', style: const TextStyle(color: Colors.redAccent)),
          ),
        ],
      );
    }

    final data = _data!;
    final maxVal = [data.totalIn, data.totalOut, 1].reduce((a, b) => a > b ? a : b);
    final userId = supabase.auth.currentUser?.id ?? '';

    // build monthly trend (last 6 months that have data)
    final monthIn = <String, num>{};
    final monthOut = <String, num>{};
    for (final tx in data.txs) {
      final key = '${tx.date.year}-${tx.date.month.toString().padLeft(2, '0')}';
      if (tx.isIncomeFor(userId)) monthIn[key] = (monthIn[key] ?? 0) + tx.summa;
      if (tx.isExpenseFor(userId)) monthOut[key] = (monthOut[key] ?? 0) + tx.summa;
    }
    final allMonths = {...monthIn.keys, ...monthOut.keys}.toList()..sort();
    final trendMonths = allMonths.length > 6 ? allMonths.sublist(allMonths.length - 6) : allMonths;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        Row(
          children: [
            _PeriodChip(label: 'Hammasi', selected: _period == 'all', onTap: () => _setPeriod('all')),
            const SizedBox(width: 8),
            _PeriodChip(label: 'Bu oy', selected: _period == 'month', onTap: () => _setPeriod('month')),
            const SizedBox(width: 8),
            _PeriodChip(label: 'Bu hafta', selected: _period == 'week', onTap: () => _setPeriod('week')),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: _StatCard(label: "O'rtacha kunlik", value: data.avgDaily, color: const Color(0xFFA855F7)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _ActiveDayCard(day: data.activeDay),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(child: _StatCard(label: 'Kirim', value: data.totalIn, color: const Color(0xFF22C55E))),
            const SizedBox(width: 10),
            Expanded(child: _StatCard(label: 'Chiqim', value: data.totalOut, color: const Color(0xFFF43F5E))),
            const SizedBox(width: 10),
            Expanded(child: _StatCard(label: 'Foyda', value: data.foyda, color: data.foyda >= 0 ? const Color(0xFF22C55E) : const Color(0xFFF43F5E))),
          ],
        ),
        const SizedBox(height: 20),
        _SectionCard(
          title: 'Kirim vs Chiqim',
          child: Column(
            children: [
              _ProgressBar(label: 'Kirim', value: data.totalIn, max: maxVal, color: const Color(0xFF22C55E)),
              const SizedBox(height: 14),
              _ProgressBar(label: 'Chiqim', value: data.totalOut, max: maxVal, color: const Color(0xFFF43F5E)),
              const SizedBox(height: 14),
              const Divider(color: AppColors.border, height: 1),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Foyda', style: TextStyle(fontWeight: FontWeight.w800)),
                  Text(
                    '${data.foyda >= 0 ? '+' : ''}${formatMoney(data.foyda)}',
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 15,
                      color: data.foyda >= 0 ? const Color(0xFF22C55E) : const Color(0xFFF43F5E),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        if (data.catTotals.isNotEmpty) ...[
          const SizedBox(height: 16),
          _SectionCard(
            title: 'Xarajat kategoriyalari',
            child: Builder(
              builder: (context) {
                final entries = data.catTotals.entries.toList()
                  ..sort((a, b) => b.value.compareTo(a.value));
                final maxCat = entries.first.value;
                final total = entries.fold<num>(0, (s, e) => s + e.value);
                const pieColors = [
                  Color(0xFF3B82F6), Color(0xFFF59E0B), Color(0xFFF43F5E),
                  Color(0xFFA855F7), Color(0xFF22C55E), Color(0xFF0891B2),
                  Color(0xFFEC4899), Color(0xFF84CC16),
                ];
                return Column(
                  children: [
                    SizedBox(
                      height: 160,
                      child: Row(
                        children: [
                          Expanded(
                            child: CustomPaint(
                              painter: _PieChartPainter(
                                values: entries.map((e) => e.value.toDouble()).toList(),
                                colors: List.generate(entries.length, (i) => pieColors[i % pieColors.length]),
                              ),
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                for (var i = 0; i < entries.length && i < 5; i++) ...[
                                  if (i > 0) const SizedBox(height: 6),
                                  Row(
                                    children: [
                                      Container(
                                        width: 10,
                                        height: 10,
                                        decoration: BoxDecoration(
                                          color: pieColors[i % pieColors.length],
                                          borderRadius: BorderRadius.circular(3),
                                        ),
                                      ),
                                      const SizedBox(width: 6),
                                      Expanded(
                                        child: Text(
                                          entries[i].key?.isNotEmpty == true ? entries[i].key! : 'Boshqa',
                                          style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w600),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                      Text(
                                        '${(entries[i].value / total * 100).round()}%',
                                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: pieColors[i % pieColors.length]),
                                      ),
                                    ],
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Divider(color: AppColors.border, height: 1),
                    const SizedBox(height: 14),
                    for (var i = 0; i < entries.length; i++) ...[
                      if (i > 0) const SizedBox(height: 14),
                      _ProgressBar(
                        label: entries[i].key?.isNotEmpty == true ? entries[i].key! : 'Boshqa',
                        value: entries[i].value,
                        max: maxCat,
                        color: pieColors[i % pieColors.length],
                      ),
                    ],
                  ],
                );
              },
            ),
          ),
        ],
        if (trendMonths.length >= 2) ...[
          const SizedBox(height: 16),
          _SectionCard(
            title: 'Oylik trend',
            child: Column(
              children: [
                for (var i = 0; i < trendMonths.length; i++) ...[
                  if (i > 0) const SizedBox(height: 12),
                  Builder(builder: (_) {
                    final m = trendMonths[i];
                    final parts = m.split('-');
                    final label = '${parts[1]}.${parts[0]}';
                    final inVal = monthIn[m] ?? 0;
                    final outVal = monthOut[m] ?? 0;
                    final maxM = [inVal, outVal, 1].reduce((a, b) => a > b ? a : b);
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(label, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Expanded(
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(4),
                                child: LinearProgressIndicator(
                                  value: maxM > 0 ? (inVal / maxM).clamp(0.0, 1.0) : 0,
                                  minHeight: 8,
                                  backgroundColor: AppColors.border,
                                  valueColor: const AlwaysStoppedAnimation(Color(0xFF22C55E)),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            SizedBox(width: 70, child: Text('+${formatMoney(inVal)}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF22C55E)), overflow: TextOverflow.ellipsis)),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Expanded(
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(4),
                                child: LinearProgressIndicator(
                                  value: maxM > 0 ? (outVal / maxM).clamp(0.0, 1.0) : 0,
                                  minHeight: 8,
                                  backgroundColor: AppColors.border,
                                  valueColor: const AlwaysStoppedAnimation(Color(0xFFF43F5E)),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            SizedBox(width: 70, child: Text('-${formatMoney(outVal)}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFFF43F5E)), overflow: TextOverflow.ellipsis)),
                          ],
                        ),
                      ],
                    );
                  }),
                ],
              ],
            ),
          ),
        ],
        if (data.foyda > 0 && data.avgDaily > 0) ...[
          const SizedBox(height: 16),
          Builder(builder: (_) {
            final daysLeft = (data.foyda / data.avgDaily).floor();
            final runOutDate = DateTime.now().add(Duration(days: daysLeft));
            final df = DateFormat('dd.MM.yyyy');
            return Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: const Color(0xFFA855F7).withOpacity(0.14),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(Icons.trending_down_rounded, color: Color(0xFFA855F7), size: 22),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Balans prognozi', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 2),
                        Text(
                          'Joriy sur\'atda $daysLeft kun yetadi (${df.format(runOutDate)})',
                          style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
        const SizedBox(height: 16),
        _SectionCard(
          title: 'Loyiha foydaliligi',
          child: data.projects.isEmpty
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: 10),
                  child: Center(child: Text("Ma'lumot yo'q", style: TextStyle(color: AppColors.muted, fontSize: 13))),
                )
              : Column(
                  children: [
                    for (var i = 0; i < data.projects.length; i++)
                      _ProjectProfitRow(index: i, project: data.projects[i], isLast: i == data.projects.length - 1),
                  ],
                ),
        ),
        const SizedBox(height: 16),
        _SectionCard(
          title: 'Top ishchilar',
          child: data.topWorkers.isEmpty
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: 10),
                  child: Center(child: Text("Ma'lumot yo'q", style: TextStyle(color: AppColors.muted, fontSize: 13))),
                )
              : Column(
                  children: [
                    for (var i = 0; i < data.topWorkers.length; i++)
                      _TopWorkerRow(index: i, worker: data.topWorkers[i], isLast: i == data.topWorkers.length - 1),
                  ],
                ),
        ),
        if (trendMonths.length >= 2) ...[
          const SizedBox(height: 16),
          _SectionCard(
            title: 'Oylik tendentsiya',
            child: Column(
              children: [
                for (int i = 0; i < trendMonths.length; i++) ...[
                  Builder(builder: (ctx) {
                    final month = trendMonths[i];
                    final inn = monthIn[month] ?? 0;
                    final out = monthOut[month] ?? 0;
                    final profit = inn - out;
                    final maxM = trendMonths.map((m) => [monthIn[m] ?? 0, monthOut[m] ?? 0]).expand((x) => x).fold<num>(1, (a, b) => a > b ? a : b);
                    final parts = month.split('-');
                    final label = parts.length == 2 ? DateFormat('MMM yy').format(DateTime(int.parse(parts[0]), int.parse(parts[1]))) : month;
                    return Padding(
                      padding: EdgeInsets.only(bottom: i < trendMonths.length - 1 ? 14 : 0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              SizedBox(width: 50, child: Text(label, style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w700))),
                              Expanded(
                                child: Column(
                                  children: [
                                    _MiniBar(value: inn.toDouble(), max: maxM.toDouble(), color: const Color(0xFF22C55E)),
                                    const SizedBox(height: 3),
                                    _MiniBar(value: out.toDouble(), max: maxM.toDouble(), color: const Color(0xFFF43F5E)),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text('+${formatMoney(inn)}', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF22C55E))),
                                  Text('-${formatMoney(out)}', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFFF43F5E))),
                                ],
                              ),
                            ],
                          ),
                          if (profit != 0) ...[
                            const SizedBox(height: 2),
                            Padding(
                              padding: const EdgeInsets.only(left: 50),
                              child: Text(
                                '${profit >= 0 ? '+' : ''}${formatMoney(profit)} foyda',
                                style: TextStyle(fontSize: 10, color: profit >= 0 ? const Color(0xFF22C55E) : const Color(0xFFF43F5E), fontWeight: FontWeight.w700),
                              ),
                            ),
                          ],
                        ],
                      ),
                    );
                  }),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _MiniBar extends StatelessWidget {
  final double value;
  final double max;
  final Color color;

  const _MiniBar({required this.value, required this.max, required this.color});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (ctx, constraints) {
        final width = max > 0 ? (value / max * constraints.maxWidth).clamp(2.0, constraints.maxWidth) : 0.0;
        return Stack(
          children: [
            Container(height: 8, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(4))),
            Container(width: width, height: 8, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(4))),
          ],
        );
      },
    );
  }
}

class _PeriodChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _PeriodChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? AppColors.accent.withOpacity(0.18) : AppColors.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? AppColors.accent : AppColors.border),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w700,
            color: selected ? AppColors.accent : AppColors.text2,
          ),
        ),
      ),
    );
  }
}

class _ActiveDayCard extends StatelessWidget {
  final int? day;

  const _ActiveDayCard({required this.day});

  @override
  Widget build(BuildContext context) {
    final label = day == null ? '—' : '$day-kun';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.accentTeal),
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          const Text('Eng faol kun', style: TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final num value;
  final Color color;

  const _StatCard({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            formatMoney(value),
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: color),
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;

  const _SectionCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}

class _ProgressBar extends StatelessWidget {
  final String label;
  final num value;
  final num max;
  final Color color;

  const _ProgressBar({required this.label, required this.value, required this.max, required this.color});

  @override
  Widget build(BuildContext context) {
    final pct = max > 0 ? (value / max).clamp(0.0, 1.0) : 0.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(fontSize: 12.5, color: AppColors.muted, fontWeight: FontWeight.w700)),
            Text(formatMoney(value), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: color)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            value: pct,
            minHeight: 10,
            backgroundColor: AppColors.border,
            valueColor: AlwaysStoppedAnimation(color),
          ),
        ),
      ],
    );
  }
}

class _ProjectProfitRow extends StatelessWidget {
  final int index;
  final ProjectProfit project;
  final bool isLast;

  const _ProjectProfitRow({required this.index, required this.project, required this.isLast});

  @override
  Widget build(BuildContext context) {
    final color = project.foyda >= 0 ? const Color(0xFF22C55E) : const Color(0xFFF43F5E);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 11),
      decoration: BoxDecoration(
        border: isLast ? null : const Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.accent.withOpacity(0.14),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              '${index + 1}',
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: AppColors.accent),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(project.nomi, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800), overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(
                  '+${formatMoney(project.kirim)} · -${formatMoney(project.chiqim)}',
                  style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          Text(
            '${project.foyda >= 0 ? '+' : ''}${formatMoney(project.foyda)}',
            style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w900, color: color),
          ),
        ],
      ),
    );
  }
}

class _TopWorkerRow extends StatelessWidget {
  final int index;
  final TopWorker worker;
  final bool isLast;

  const _TopWorkerRow({required this.index, required this.worker, required this.isLast});

  static const _colors = [
    Color(0xFF1D4ED8),
    Color(0xFFEA580C),
    Color(0xFF16A34A),
    Color(0xFF7C3AED),
    Color(0xFF0891B2),
  ];

  @override
  Widget build(BuildContext context) {
    final balColor = worker.balans > 0
        ? const Color(0xFF22C55E)
        : worker.balans < 0
            ? const Color(0xFFF43F5E)
            : AppColors.muted;
    final initial = worker.name.isNotEmpty ? worker.name[0].toUpperCase() : '?';

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 11),
      decoration: BoxDecoration(
        border: isLast ? null : const Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: _colors[index % _colors.length],
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(initial, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Colors.white)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(worker.name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800), overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text('Ish haqi: ${formatMoney(worker.ishaqi)} • Olgan: ${formatMoney(worker.olingan)}', style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${worker.balans >= 0 ? '+' : ''}${formatMoney(worker.balans)}',
                style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w900, color: balColor),
              ),
              const Text('balans', style: TextStyle(fontSize: 10, color: AppColors.muted, fontWeight: FontWeight.w600)),
            ],
          ),
        ],
      ),
    );
  }
}

class _PieChartPainter extends CustomPainter {
  final List<double> values;
  final List<Color> colors;

  _PieChartPainter({required this.values, required this.colors});

  @override
  void paint(Canvas canvas, Size size) {
    final total = values.fold(0.0, (s, v) => s + v);
    if (total == 0) return;

    final center = Offset(size.width / 2, size.height / 2);
    final radius = math.min(size.width, size.height) / 2 - 4;
    final innerRadius = radius * 0.55;

    double startAngle = -math.pi / 2;
    for (var i = 0; i < values.length; i++) {
      final sweepAngle = (values[i] / total) * 2 * math.pi;
      final paint = Paint()
        ..style = PaintingStyle.fill
        ..color = colors[i % colors.length];
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        sweepAngle - 0.02,
        true,
        paint,
      );
      startAngle += sweepAngle;
    }

    canvas.drawCircle(center, innerRadius, Paint()..color = AppColors.bg..style = PaintingStyle.fill);
  }

  @override
  bool shouldRepaint(_PieChartPainter old) => old.values != values || old.colors != colors;
}
