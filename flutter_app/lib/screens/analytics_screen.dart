import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:printing/printing.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:intl/intl.dart';

import '../l10n/strings.dart';
import '../main.dart';
import '../data/project_repository.dart';
import '../data/transaction_repository.dart';
import '../models/project.dart';
import '../models/transaction.dart';
import '../theme/app_theme.dart';
import '../widgets/pie_chart.dart';
import '../widgets/project_card.dart' show formatUzsToDisplay;
import '../services/currency_service.dart';
import '../widgets/shimmer.dart';
import '../utils/haptics.dart';

class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen>
    with SingleTickerProviderStateMixin {
  final _projectRepo = ProjectRepository();
  final _txRepo = TransactionRepository();
  List<Project> _projects = [];
  Map<String, List<ProjectTransaction>> _txsByProject = {};
  bool _loading = true;

  // Per-project selection
  Project? _selectedProject;
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _load();
    projectUpdateNotifier.addListener(_load);
  }

  @override
  void dispose() {
    _tabController.dispose();
    projectUpdateNotifier.removeListener(_load);
    super.dispose();
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() => _loading = true);
    final userId = supabase.auth.currentUser?.id;
    try {
      final projects = await _projectRepo.loadProjects();
      final txFutures = projects.map((p) async {
        final txs = await _txRepo.loadForProject(p.id, createdBy: userId);
        return MapEntry(p.id, txs);
      });
      final entries = await Future.wait(txFutures);
      final txMap = Map<String, List<ProjectTransaction>>.fromEntries(entries);
      if (!mounted) return;
      setState(() {
        _projects = projects;
        _txsByProject = txMap;
        _loading = false;
        // Keep existing selection updated if project still exists, otherwise leave null for user selection
        if (_myProjects.isNotEmpty && _selectedProject != null) {
          final matches =
              _myProjects.where((p) => p.id == _selectedProject!.id);
          _selectedProject = matches.isNotEmpty ? matches.first : null;
        } else {
          _selectedProject = null;
        }
      });
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Project> get _myProjects => _projects;
  List<Project> get _active =>
      _myProjects.where((p) => p.status != 'done').toList();
  List<Project> get _done =>
      _myProjects.where((p) => p.status == 'done').toList();

  num get _totalKirim => _myProjects.fold(0, (s, p) => s + p.kirim);
  num get _totalChiqim => _myProjects.fold(0, (s, p) => s + p.chiqim);
  num get _totalBalance => _totalKirim - _totalChiqim;

  Map<String, num> get _byCategory {
    final userId = supabase.auth.currentUser?.id ?? '';
    final map = <String, num>{};
    for (final txs in _txsByProject.values) {
      for (final tx in txs.where((t) => t.isExpenseFor(userId))) {
        final cat = tx.kategoriya ?? 'Boshqa';
        map[cat] = (map[cat] ?? 0) + tx.summaUzs;
      }
    }
    final sorted = map.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return Map.fromEntries(sorted);
  }

  Map<String, num> get _byIncomeCategory {
    final userId = supabase.auth.currentUser?.id ?? '';
    final map = <String, num>{};
    for (final txs in _txsByProject.values) {
      for (final tx in txs.where((t) => t.isIncomeFor(userId))) {
        String cat = tx.kategoriya ?? 'Mijoz';
        if (cat == 'income' || cat == 'Kirim') cat = 'Mijoz';
        map[cat] = (map[cat] ?? 0) + tx.summaUzs;
      }
    }
    final sorted = map.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return Map.fromEntries(sorted);
  }

  // ---------- per-project helpers ----------
  List<ProjectTransaction> get _selTxs => _selectedProject != null
      ? (_txsByProject[_selectedProject!.id] ?? [])
      : [];

  Map<String, num> get _selByCategory {
    final userId = supabase.auth.currentUser?.id ?? '';
    final map = <String, num>{};
    for (final tx in _selTxs.where((t) => t.isExpenseFor(userId))) {
      final cat = tx.kategoriya ?? 'Boshqa';
      map[cat] = (map[cat] ?? 0) + tx.summaUzs;
    }
    final sorted = map.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return Map.fromEntries(sorted);
  }

  Map<String, num> get _selByIncomeCategory {
    final userId = supabase.auth.currentUser?.id ?? '';
    final map = <String, num>{};
    for (final tx in _selTxs.where((t) => t.isIncomeFor(userId))) {
      String cat = tx.kategoriya ?? 'Mijoz';
      if (cat == 'income' || cat == 'Kirim') cat = 'Mijoz';
      map[cat] = (map[cat] ?? 0) + tx.summaUzs;
    }
    final sorted = map.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return Map.fromEntries(sorted);
  }

  num get _selIncome {
    final userId = supabase.auth.currentUser?.id ?? '';
    return _selTxs
        .where((t) => t.isIncomeFor(userId))
        .fold(0, (s, t) => s + t.summaUzs);
  }

  num get _selSpend {
    final userId = supabase.auth.currentUser?.id ?? '';
    return _selTxs
        .where((t) => t.isExpenseFor(userId))
        .fold(0, (s, t) => s + t.summaUzs);
  }

  static const _catColors = [
    Color(0xFF3B82F6),
    Color(0xFF14B8A6),
    Color(0xFFF97316),
    Color(0xFFEF4444),
    Color(0xFF8B5CF6),
    Color(0xFF22C55E),
    Color(0xFFEC4899),
    Color(0xFFF59E0B),
  ];

  @override
  Widget build(BuildContext context) {
    final tabUmumiy = tr('umumiy');
    final tabByProject = tr('by_project');

    return ValueListenableBuilder<String>(
      valueListenable: appLocaleNotifier,
      builder: (_, __, ___) => Scaffold(
        backgroundColor: AppColors.bg,
        appBar: AppBar(
          backgroundColor: AppColors.bg,
          title: Text(tr('analytics')),
        ),
        body: RefreshIndicator(
          onRefresh: _load,
          child: _loading
              ? _buildShimmerLoading()
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                      child: Container(
                        decoration: BoxDecoration(
                          color: AppColors.card,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: TabBar(
                          controller: _tabController,
                          onTap: (_) => AppHaptics.selection(),
                          labelColor: AppColors.accent,
                          unselectedLabelColor: AppColors.text2,
                          indicator: BoxDecoration(
                            color: AppColors.accent.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          indicatorSize: TabBarIndicatorSize.tab,
                          dividerColor: Colors.transparent,
                          isScrollable: false,
                          labelStyle: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 13,
                          ),
                          unselectedLabelStyle: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                          padding: const EdgeInsets.all(4),
                          tabs: [
                            Tab(text: tabUmumiy),
                            Tab(text: tabByProject),
                          ],
                        ),
                      ),
                    ),
                    Expanded(
                      child: TabBarView(
                        controller: _tabController,
                        children: [
                          _buildOverallTab(),
                          _buildPerProjectTab(),
                        ],
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _buildOverallTab() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
      children: [
        // Summary cards
        Row(
          children: [
            _SummaryCard(
                label: tr('all'),
                value: '${_myProjects.length}',
                sub: tr('nav_projects'),
                color: AppColors.accent),
            const SizedBox(width: 10),
            _SummaryCard(
                label: tr('active'),
                value: '${_active.length}',
                sub: tr('nav_projects'),
                color: AppColors.green),
            const SizedBox(width: 10),
            _SummaryCard(
                label: tr('done'),
                value: '${_done.length}',
                sub: tr('nav_projects'),
                color: AppColors.muted),
          ],
        ),
        const SizedBox(height: 12),

        // Financial summary
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                tr('all_projects'),
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                  color: AppColors.muted,
                ),
              ),
              const SizedBox(height: 12),
              _FinRow(
                  label: tr('total_income'),
                  value: _totalKirim,
                  color: AppColors.green,
                  icon: Icons.arrow_downward_rounded),
              const SizedBox(height: 8),
              _FinRow(
                  label: tr('total_expense'),
                  value: _totalChiqim,
                  color: AppColors.red,
                  icon: Icons.arrow_upward_rounded),
              const Divider(color: AppColors.border, height: 20),
              _FinRow(
                label: tr('total_balance'),
                value: _totalBalance,
                color: _totalBalance >= 0 ? AppColors.green : AppColors.red,
                icon: Icons.account_balance_rounded,
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Category pie charts (all projects)
        _buildCategoryBreakdownCard(
          title: tr('income_by_category'),
          categoryData: _byIncomeCategory,
          totalAmount: _totalKirim,
        ),
        _buildCategoryBreakdownCard(
          title: tr('expense_by_category'),
          categoryData: _byCategory,
          totalAmount: _totalChiqim,
        ),
      ],
    );
  }

  Widget _buildPerProjectTab() {
    if (_myProjects.isEmpty) {
      return Center(
        child: Text(
          tr('no_projects_stats'),
          style: const TextStyle(color: AppColors.muted, fontSize: 14),
        ),
      );
    }

    // 1. Initial State: Show vertical list of projects to choose from
    if (_selectedProject == null) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tr('select_object_stats_title'),
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: AppColors.text,
                  ),
                ),
              ],
            ),
          ),
          ..._myProjects.map((p) => _buildProjectSelectionCard(p)),
        ],
      );
    }

    // 2. Selected State: Show selected project header banner with change button & stats
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        // Top Selected Project Header Banner
        Container(
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: AppColors.accent.withValues(alpha: 0.3),
              width: 1.5,
            ),
            boxShadow: [
              BoxShadow(
                color: AppColors.accent.withValues(alpha: 0.05),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppColors.accent.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.domain_rounded,
                      color: AppColors.accent,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tr('selected_object_label'),
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: AppColors.muted,
                          ),
                        ),
                        Text(
                          _selectedProject!.nomi,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: AppColors.text,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  // Button to re-open the vertical project list
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {
                        AppHaptics.selection();
                        setState(() => _selectedProject = null);
                      },
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: AppColors.accent),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      icon: const Icon(
                        Icons.swap_horiz_rounded,
                        size: 18,
                        color: AppColors.accent,
                      ),
                      label: Text(
                        tr('choose_other_object'),
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: AppColors.accent,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  // Download PDF report button
                  IconButton.filledTonal(
                    onPressed: () {
                      AppHaptics.medium();
                      _downloadPdf();
                    },
                    style: IconButton.styleFrom(
                      backgroundColor: AppColors.accent.withValues(alpha: 0.12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    icon: const Icon(
                      Icons.file_download_rounded,
                      size: 20,
                      color: AppColors.accent,
                    ),
                    tooltip: tr('download_pdf_report'),
                  ),
                ],
              ),
            ],
          ),
        ),

        // Statistics body for the selected project
        _buildProjectStats(_selectedProject!),
      ],
    );
  }

  Widget _buildProjectSelectionCard(Project p) {
    final isDone = p.status == 'done';
    final isPaused = p.status == 'paused';
    final statusColor = isDone
        ? AppColors.muted
        : (isPaused ? AppColors.orange : AppColors.green);
    final statusLabel =
        isDone ? tr('done') : (isPaused ? tr('paused') : tr('active'));

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () {
          AppHaptics.selection();
          setState(() => _selectedProject = p);
        },
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.accent.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Center(
                  child: Icon(
                    Icons.domain_rounded,
                    color: AppColors.accent,
                    size: 22,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            p.nomi,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: AppColors.text,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: statusColor.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            statusLabel,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: statusColor,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (p.manzil != null && p.manzil!.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          const Icon(Icons.location_on_outlined,
                              size: 13, color: AppColors.muted),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              p.manzil!,
                              style: const TextStyle(
                                  fontSize: 12, color: AppColors.muted),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ],
                    if (p.mijoz != null && p.mijoz!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          const Icon(Icons.person_outline_rounded,
                              size: 13, color: AppColors.muted),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              p.mijoz!,
                              style: const TextStyle(
                                  fontSize: 12, color: AppColors.muted),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AppColors.bg,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.border),
                ),
                child: const Icon(
                  Icons.chevron_right_rounded,
                  color: AppColors.accent,
                  size: 20,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildProjectStats(Project p) {
    final userId = supabase.auth.currentUser?.id ?? '';
    final txs = _selTxs;
    final income = _selIncome;
    final spend = _selSpend;
    final balance = income - spend;
    final byCat = _selByCategory;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Financial overview
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(p.nomi,
                        style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
                            color: AppColors.text)),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: (p.status == 'done'
                              ? AppColors.green
                              : AppColors.accent)
                          .withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      p.status == 'done' ? tr('done') : tr('active'),
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: p.status == 'done'
                              ? AppColors.green
                              : AppColors.accent),
                    ),
                  ),
                ],
              ),
              if (p.manzil != null) ...[
                const SizedBox(height: 4),
                Row(children: [
                  const Icon(Icons.location_on_outlined,
                      size: 13, color: AppColors.muted),
                  const SizedBox(width: 4),
                  Text(p.manzil!,
                      style: const TextStyle(
                          fontSize: 11, color: AppColors.muted)),
                ]),
              ],
              if (p.mijoz != null) ...[
                const SizedBox(height: 2),
                Row(children: [
                  const Icon(Icons.person_outline_rounded,
                      size: 13, color: AppColors.muted),
                  const SizedBox(width: 4),
                  Text(p.mijoz!,
                      style: const TextStyle(
                          fontSize: 11, color: AppColors.muted)),
                ]),
              ],
              const Divider(color: AppColors.border, height: 20),
              _FinRow(
                  label: tr('income'),
                  value: income,
                  color: AppColors.green,
                  icon: Icons.arrow_downward_rounded),
              const SizedBox(height: 8),
              _FinRow(
                  label: tr('expense'),
                  value: spend,
                  color: AppColors.red,
                  icon: Icons.arrow_upward_rounded),
              const Divider(color: AppColors.border, height: 20),
              _FinRow(
                label: tr('balance'),
                value: balance,
                color: balance >= 0 ? AppColors.green : AppColors.red,
                icon: Icons.account_balance_rounded,
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),

        // Category breakdown for this project
        _buildCategoryBreakdownCard(
          title: tr('income_by_category'),
          categoryData: _selByIncomeCategory,
          totalAmount: income,
        ),
        _buildCategoryBreakdownCard(
          title: tr('expense_by_category'),
          categoryData: byCat,
          totalAmount: spend,
        ),

        // Transaction count summary
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(tr('transactions'),
                  style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                      color: AppColors.muted)),
              const SizedBox(height: 12),
              Row(
                children: [
                  _TxCountChip(
                      label: tr('all'),
                      count: txs.length,
                      color: AppColors.accent),
                  const SizedBox(width: 8),
                  _TxCountChip(
                      label: tr('income'),
                      count: txs.where((t) => t.isIncomeFor(userId)).length,
                      color: AppColors.green),
                  const SizedBox(width: 8),
                  _TxCountChip(
                      label: tr('expense'),
                      count: txs.where((t) => t.isExpenseFor(userId)).length,
                      color: AppColors.red),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
      ],
    );
  }

  Widget _buildCategoryBreakdownCard({
    required String title,
    required Map<String, num> categoryData,
    required num totalAmount,
  }) {
    if (categoryData.isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.all(16),
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 13,
              color: AppColors.muted,
            ),
          ),
          const SizedBox(height: 12),
          MoliyaPieChart(
            data: () {
              int ci = 0;
              return categoryData.entries
                  .map((e) => PieChartData(
                        label: e.key,
                        value: e.value.toDouble(),
                        color: _catColors[ci++ % _catColors.length],
                      ))
                  .toList();
            }(),
          ),
          const SizedBox(height: 14),
          ...() {
            int ci = 0;
            return categoryData.entries.map((e) {
              final color = _catColors[ci++ % _catColors.length];
              final ratio = totalAmount > 0 ? e.value / totalAmount : 0.0;
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 10,
                          height: 10,
                          decoration: BoxDecoration(
                            color: color,
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            e.key,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppColors.text2,
                            ),
                          ),
                        ),
                        Text(
                          formatUzsToDisplay(e.value),
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: AppColors.text,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Stack(
                      children: [
                        Container(
                          height: 5,
                          decoration: BoxDecoration(
                            color: AppColors.border,
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                        FractionallySizedBox(
                          widthFactor: ratio.clamp(0.0, 1.0),
                          child: Container(
                            height: 5,
                            decoration: BoxDecoration(
                              color: color,
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${(ratio * 100).round()}%',
                      style: const TextStyle(
                        fontSize: 10,
                        color: AppColors.muted,
                      ),
                    ),
                  ],
                ),
              );
            }).toList();
          }(),
        ],
      ),
    );
  }

  Widget _buildShimmerLoading() {
    return Shimmer(
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
        children: const [
          Row(
            children: [
              Expanded(child: ShimmerBox(height: 70, borderRadius: 14)),
              SizedBox(width: 10),
              Expanded(child: ShimmerBox(height: 70, borderRadius: 14)),
            ],
          ),
          SizedBox(height: 24),
          ShimmerBox(height: 220, borderRadius: 18),
          SizedBox(height: 24),
          ShimmerBox(height: 180, borderRadius: 18),
        ],
      ),
    );
  }

  Future<void> _downloadPdf() async {
    final project = _selectedProject;
    if (project == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr('no_active_project'))),
      );
      return;
    }

    final user = supabase.auth.currentSession?.user;
    String prorabName = '';
    String prorabPhone = '';
    try {
      if (user != null) {
        final profileData = await supabase
            .from('profiles')
            .select('full_name, phone')
            .eq('id', user.id)
            .maybeSingle();
        if (profileData != null) {
          prorabName = profileData['full_name'] as String? ?? '';
          prorabPhone = profileData['phone'] as String? ?? '';
        }
      }
    } catch (_) {}

    final userId = supabase.auth.currentUser?.id ?? '';
    final service = CurrencyService();
    final isUsd = service.displayCurrency == 'USD';

    final income = _selTxs
        .where((t) => t.isIncomeFor(userId))
        .fold(0.0, (s, t) => s + (isUsd ? t.summaUsd : t.summaUzs));
    final spend = _selTxs
        .where((t) => t.isExpenseFor(userId))
        .fold(0.0, (s, t) => s + (isUsd ? t.summaUsd : t.summaUzs));
    final balance = income - spend;
    final txs = _selTxs.where((t) => t.tur != 'ishhaqi').toList();

    final byCat = <String, num>{};
    for (final tx in _selTxs.where((t) => t.isExpenseFor(userId))) {
      final cat = tx.kategoriya ?? 'Boshqa';
      final amt = isUsd ? tx.summaUsd : tx.summaUzs;
      byCat[cat] = (byCat[cat] ?? 0) + amt;
    }
    final sortedCatEntries = byCat.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final sortedByCat = Map.fromEntries(sortedCatEntries);

    String formatPdfMoney(num value) {
      final rounded = value.round();
      if (isUsd) {
        final formatter = NumberFormat('#,##0', 'en_US');
        return '\$${formatter.format(rounded)}';
      } else {
        final formatter = NumberFormat('#,###', 'uz');
        final suffix = tr('currency_suffix');
        return '${formatter.format(rounded).replaceAll(',', ' ').replaceAll('.', ' ')} $suffix';
      }
    }

    final String incomeDesc = isUsd
        ? 'USD · ${tr('total_income_desc').split('·').last.trim()}'
        : tr('total_income_desc');
    final String expenseDesc = isUsd
        ? 'USD · ${tr('total_expense_desc').split('·').last.trim()}'
        : tr('total_expense_desc');
    final String balanceDesc = isUsd
        ? 'USD · ${tr('total_balance_desc').split('·').last.trim()}'
        : tr('total_balance_desc');

    final endDate = project.tugash ??
        (project.boshlanish != null
            ? project.boshlanish!.add(Duration(days: project.muddat))
            : null);

    final startStr = project.boshlanish != null
        ? DateFormat('dd.MM.yyyy').format(project.boshlanish!)
        : '-';
    final endStr =
        endDate != null ? DateFormat('dd.MM.yyyy').format(endDate) : '-';
    final todayStr = DateFormat('dd.MM.yyyy').format(DateTime.now());

    final List<num> runningBalances = [];
    num runningBalance = 0;
    final sortedTxs = List<ProjectTransaction>.from(txs)
      ..sort((a, b) => a.date.compareTo(b.date));
    for (final tx in sortedTxs) {
      final amt = isUsd ? tx.summaUsd : tx.summaUzs;
      if (tx.isIncomeFor(userId)) {
        runningBalance += amt;
      } else if (tx.isExpenseFor(userId)) {
        runningBalance -= amt;
      }
      runningBalances.add(runningBalance);
    }

    // Color definitions
    final navyColor = PdfColor.fromHex('#0d1b2e');
    final greenColor = PdfColor.fromHex('#16a34a');
    final greenBgColor = PdfColor.fromHex('#eefbf3');
    final redColor = PdfColor.fromHex('#dc2626');
    final redBgColor = PdfColor.fromHex('#fef2f2');
    final borderColor = PdfColor.fromHex('#e4e8ee');
    final mutedColor = PdfColor.fromHex('#68758a');
    final bgSoftColor = PdfColor.fromHex('#f7f9fc');

    final catColors = [
      PdfColor.fromHex('#3B82F6'),
      PdfColor.fromHex('#14B8A6'),
      PdfColor.fromHex('#F97316'),
      PdfColor.fromHex('#EF4444'),
      PdfColor.fromHex('#8B5CF6'),
      PdfColor.fromHex('#22C55E'),
      PdfColor.fromHex('#EC4899'),
      PdfColor.fromHex('#F59E0B'),
    ];

    final pdf = pw.Document();
    final fontNormal = await PdfGoogleFonts.robotoRegular();
    final fontBold = await PdfGoogleFonts.robotoBold();
    final logoBytes = await rootBundle.load('assets/logo.png');
    final logoImage = pw.MemoryImage(logoBytes.buffer.asUint8List());

    pdf.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(36),
        build: (pw.Context context) {
          final List<pw.Widget> breakdownRows = [];
          int ci = 0;
          sortedByCat.forEach((cat, amt) {
            final ratio = spend > 0 ? amt / spend : 0.0;
            final pct = (ratio * 100).round();
            final color = catColors[ci++ % catColors.length];
            breakdownRows.add(
              pw.Padding(
                padding: const pw.EdgeInsets.symmetric(vertical: 4),
                child: pw.Row(
                  children: [
                    pw.Container(
                      width: 120,
                      child: pw.Text(cat,
                          style: pw.TextStyle(
                              font: fontBold, fontSize: 10, color: navyColor)),
                    ),
                    pw.Expanded(
                      child: pw.Container(
                        height: 7,
                        decoration: pw.BoxDecoration(
                          color: PdfColor.fromHex('#eef1f5'),
                          borderRadius:
                              pw.BorderRadius.all(pw.Radius.circular(4)),
                        ),
                        alignment: pw.Alignment.centerLeft,
                        child: ratio > 0
                            ? pw.Row(
                                children: [
                                  pw.Expanded(
                                    flex: pct,
                                    child: pw.Container(
                                      height: 7,
                                      decoration: pw.BoxDecoration(
                                        color: color,
                                        borderRadius: const pw.BorderRadius.all(
                                            pw.Radius.circular(4)),
                                      ),
                                    ),
                                  ),
                                  pw.Expanded(
                                    flex: (100 - pct).clamp(0, 100),
                                    child: pw.SizedBox(),
                                  ),
                                ],
                              )
                            : pw.SizedBox(),
                      ),
                    ),
                    pw.SizedBox(width: 12),
                    pw.Container(
                      width: 90,
                      alignment: pw.Alignment.centerRight,
                      child: pw.Text(formatPdfMoney(amt),
                          style: pw.TextStyle(
                              font: fontBold, fontSize: 10, color: navyColor)),
                    ),
                    pw.Container(
                      width: 40,
                      alignment: pw.Alignment.centerRight,
                      child: pw.Text('$pct%',
                          style: pw.TextStyle(
                              font: fontBold, fontSize: 9, color: mutedColor)),
                    ),
                  ],
                ),
              ),
            );
          });

          final List<pw.TableRow> tableRows = [];
          // Table Header
          tableRows.add(
            pw.TableRow(
              decoration: pw.BoxDecoration(color: navyColor),
              children: [
                pw.Padding(
                    padding: const pw.EdgeInsets.all(6),
                    child: pw.Text(tr('date_col'),
                        style: pw.TextStyle(
                            font: fontBold,
                            fontSize: 8,
                            color: PdfColors.white))),
                pw.Padding(
                    padding: const pw.EdgeInsets.all(6),
                    child: pw.Text(tr('desc_col'),
                        style: pw.TextStyle(
                            font: fontBold,
                            fontSize: 8,
                            color: PdfColors.white))),
                pw.Padding(
                    padding: const pw.EdgeInsets.all(6),
                    child: pw.Text(tr('category_col'),
                        style: pw.TextStyle(
                            font: fontBold,
                            fontSize: 8,
                            color: PdfColors.white))),
                pw.Padding(
                    padding: const pw.EdgeInsets.all(6),
                    child: pw.Text(tr('amount_col'),
                        style: pw.TextStyle(
                            font: fontBold,
                            fontSize: 8,
                            color: PdfColors.white),
                        textAlign: pw.TextAlign.right)),
                pw.Padding(
                    padding: const pw.EdgeInsets.all(6),
                    child: pw.Text(tr('balance_col'),
                        style: pw.TextStyle(
                            font: fontBold,
                            fontSize: 8,
                            color: PdfColors.white),
                        textAlign: pw.TextAlign.right)),
              ],
            ),
          );

          // Table Body
          int rowIdx = 0;
          for (final tx in sortedTxs) {
            final isEven = rowIdx % 2 == 0;
            final dateStr = DateFormat('dd.MM').format(tx.date);
            final desc = tx.izoh ?? '';
            final sub = tx.toUser ?? tx.fromUser ?? '';
            final isTxIncome = tx.isIncomeFor(userId);
            final toifa =
                tx.kategoriya ?? (isTxIncome ? tr('income') : tr('boshqa'));
            final amtSign = isTxIncome ? '+' : '-';
            final amtColor = isTxIncome ? greenColor : redColor;

            tableRows.add(
              pw.TableRow(
                decoration: pw.BoxDecoration(
                  color: isEven ? bgSoftColor : PdfColors.white,
                  border: pw.Border(
                      bottom: pw.BorderSide(
                          color: PdfColor.fromHex('#eef0f4'), width: 0.5)),
                ),
                children: [
                  pw.Padding(
                      padding: const pw.EdgeInsets.all(6),
                      child: pw.Text(dateStr,
                          style: pw.TextStyle(
                              font: fontNormal,
                              fontSize: 9,
                              color: mutedColor))),
                  pw.Padding(
                    padding: const pw.EdgeInsets.all(6),
                    child: pw.Column(
                      crossAxisAlignment: pw.CrossAxisAlignment.start,
                      children: [
                        pw.Text(desc,
                            style: pw.TextStyle(
                                font: fontBold, fontSize: 9, color: navyColor)),
                        if (sub.isNotEmpty)
                          pw.Text(sub,
                              style: pw.TextStyle(
                                  font: fontNormal,
                                  fontSize: 8,
                                  color: mutedColor)),
                      ],
                    ),
                  ),
                  pw.Padding(
                      padding: const pw.EdgeInsets.all(6),
                      child: pw.Text(toifa,
                          style: pw.TextStyle(
                              font: fontBold,
                              fontSize: 8,
                              color: PdfColor.fromHex('#1e2f47')))),
                  pw.Padding(
                      padding: const pw.EdgeInsets.all(6),
                      child: pw.Text(
                          '$amtSign${formatPdfMoney(isUsd ? tx.summaUsd : tx.summaUzs)}',
                          style: pw.TextStyle(
                              font: fontBold, fontSize: 9, color: amtColor),
                          textAlign: pw.TextAlign.right)),
                  pw.Padding(
                      padding: const pw.EdgeInsets.all(6),
                      child: pw.Text(formatPdfMoney(runningBalances[rowIdx]),
                          style: pw.TextStyle(
                              font: fontBold, fontSize: 9, color: mutedColor),
                          textAlign: pw.TextAlign.right)),
                ],
              ),
            );
            rowIdx++;
          }

          return [
            // Header
            pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Image(logoImage, height: 72),
              ],
            ),
            pw.SizedBox(height: 4),
            pw.Container(height: 2, color: navyColor),
            pw.SizedBox(height: 12),

            // Hero Section
            pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Text(tr('project_report_title'),
                        style: pw.TextStyle(
                            font: fontBold, fontSize: 22, color: navyColor)),
                    pw.SizedBox(height: 4),
                    pw.Text('${tr('report_period')}: $startStr - $endStr',
                        style: pw.TextStyle(
                            font: fontNormal, fontSize: 11, color: mutedColor)),
                  ],
                ),
                pw.Container(
                  padding: const pw.EdgeInsets.symmetric(
                      horizontal: 12, vertical: 5),
                  decoration: pw.BoxDecoration(
                    color:
                        project.status == 'done' ? bgSoftColor : greenBgColor,
                    borderRadius:
                        const pw.BorderRadius.all(pw.Radius.circular(20)),
                  ),
                  child: pw.Text(
                    project.status == 'done' ? tr('done') : tr('active'),
                    style: pw.TextStyle(
                        font: fontBold,
                        fontSize: 9,
                        color:
                            project.status == 'done' ? mutedColor : greenColor),
                  ),
                ),
              ],
            ),
            pw.SizedBox(height: 12),

            // Info Grid
            pw.Container(
              decoration: pw.BoxDecoration(
                border: pw.Border.all(color: borderColor),
                borderRadius: const pw.BorderRadius.all(pw.Radius.circular(10)),
              ),
              child: pw.ClipRRect(
                horizontalRadius: 10,
                verticalRadius: 10,
                child: pw.Row(
                  children: [
                    pw.Expanded(
                        child: _buildGridCell(
                            tr('nav_projects'),
                            project.nomi,
                            fontNormal,
                            fontBold,
                            borderColor,
                            mutedColor,
                            navyColor,
                            showBorderRight: true)),
                    pw.Expanded(
                        child: _buildGridCell(
                            tr('owner'),
                            project.mijoz ?? '-',
                            fontNormal,
                            fontBold,
                            borderColor,
                            mutedColor,
                            navyColor,
                            showBorderRight: true)),
                    pw.Expanded(
                        child: _buildGridCell(
                            tr('prorab'),
                            prorabName,
                            fontNormal,
                            fontBold,
                            borderColor,
                            mutedColor,
                            navyColor,
                            showBorderRight: true)),
                    pw.Expanded(
                        child: _buildGridCell(
                            tr('phone'),
                            prorabPhone.isNotEmpty ? prorabPhone : '-',
                            fontNormal,
                            fontBold,
                            borderColor,
                            mutedColor,
                            navyColor,
                            showBorderRight: false)),
                  ],
                ),
              ),
            ),
            pw.SizedBox(height: 12),

            // Summary Cards
            pw.Row(
              children: [
                pw.Expanded(
                  child: _buildSummaryCard(
                    label: tr('total_income'),
                    amount: '+${formatPdfMoney(income)}',
                    desc: incomeDesc,
                    bgColor: greenBgColor,
                    textColor: greenColor,
                    amtColor: PdfColor.fromHex('#0d7a37'),
                    bold: fontBold,
                    normal: fontNormal,
                    borderColor: borderColor,
                  ),
                ),
                pw.SizedBox(width: 10),
                pw.Expanded(
                  child: _buildSummaryCard(
                    label: tr('total_expense'),
                    amount: '-${formatPdfMoney(spend)}',
                    desc: expenseDesc,
                    bgColor: redBgColor,
                    textColor: redColor,
                    amtColor: PdfColor.fromHex('#b91c1c'),
                    bold: fontBold,
                    normal: fontNormal,
                    borderColor: borderColor,
                  ),
                ),
                pw.SizedBox(width: 10),
                pw.Expanded(
                  child: _buildSummaryCard(
                    label: tr('total_balance'),
                    amount: (balance >= 0 ? '+' : '') + formatPdfMoney(balance),
                    desc: balanceDesc,
                    bgColor: navyColor,
                    textColor: PdfColor.fromHex('#9fb3cc'),
                    amtColor: PdfColors.white,
                    bold: fontBold,
                    normal: fontNormal,
                    borderColor: borderColor,
                  ),
                ),
              ],
            ),
            pw.SizedBox(height: 12),

            // Breakdown
            if (byCat.isNotEmpty) ...[
              pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  pw.Text(tr('expense_distribution'),
                      style: pw.TextStyle(
                          font: fontBold, fontSize: 11, color: navyColor)),
                  pw.Text(tr('distribution_by_category'),
                      style: pw.TextStyle(
                          font: fontNormal, fontSize: 8, color: mutedColor)),
                ],
              ),
              pw.SizedBox(height: 6),
              pw.Container(
                decoration: pw.BoxDecoration(
                  border: pw.Border.all(color: borderColor),
                  borderRadius:
                      const pw.BorderRadius.all(pw.Radius.circular(10)),
                ),
                padding: const pw.EdgeInsets.all(12),
                child: pw.Column(children: breakdownRows),
              ),
              pw.SizedBox(height: 12),
            ],

            // Detailed Operations
            pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Text(tr('detailed_operations'),
                    style: pw.TextStyle(
                        font: fontBold, fontSize: 11, color: navyColor)),
                pw.Text('${sortedTxs.length} ${tr('records_count')}',
                    style: pw.TextStyle(
                        font: fontNormal, fontSize: 8, color: mutedColor)),
              ],
            ),
            pw.SizedBox(height: 6),
            pw.Table(
              columnWidths: const {
                0: pw.FractionColumnWidth(0.12),
                1: pw.FractionColumnWidth(0.40),
                2: pw.FractionColumnWidth(0.18),
                3: pw.FractionColumnWidth(0.15),
                4: pw.FractionColumnWidth(0.15),
              },
              children: tableRows,
            ),
            pw.SizedBox(height: 16),

            // Signatures
            pw.Row(
              children: [
                pw.Expanded(
                  child: pw.Container(
                    decoration: pw.BoxDecoration(
                        border:
                            pw.Border(top: pw.BorderSide(color: navyColor))),
                    padding: const pw.EdgeInsets.only(top: 6),
                    child: pw.Row(
                      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                      children: [
                        pw.Text(tr('prorab'),
                            style: pw.TextStyle(
                                font: fontBold,
                                fontSize: 8,
                                color: mutedColor)),
                        pw.Text(prorabName,
                            style: pw.TextStyle(
                                font: fontNormal,
                                fontSize: 9,
                                color: navyColor)),
                      ],
                    ),
                  ),
                ),
                pw.SizedBox(width: 40),
                pw.Expanded(
                  child: pw.Container(
                    decoration: pw.BoxDecoration(
                        border:
                            pw.Border(top: pw.BorderSide(color: navyColor))),
                    padding: const pw.EdgeInsets.only(top: 6),
                    child: pw.Row(
                      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                      children: [
                        pw.Text(tr('owner'),
                            style: pw.TextStyle(
                                font: fontBold,
                                fontSize: 8,
                                color: mutedColor)),
                        pw.Text(project.mijoz ?? '',
                            style: pw.TextStyle(
                                font: fontNormal,
                                fontSize: 9,
                                color: navyColor)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ];
        },
        footer: (pw.Context context) {
          return pw.Container(
            margin: const pw.EdgeInsets.only(top: 12),
            padding: const pw.EdgeInsets.only(top: 8),
            decoration: pw.BoxDecoration(
              border: pw.Border(top: pw.BorderSide(color: borderColor)),
            ),
            child: pw.Row(
              mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
              children: [
                pw.Row(
                  crossAxisAlignment: pw.CrossAxisAlignment.center,
                  children: [
                    pw.Image(logoImage, height: 48),
                    pw.SizedBox(width: 8),
                    pw.Text('-  ${tr('system_note')}',
                        style: pw.TextStyle(
                            font: fontNormal, color: mutedColor, fontSize: 8)),
                  ],
                ),
                pw.Text(
                  '${context.pageNumber} / ${context.pagesCount} ${tr('page_indicator')}',
                  style: pw.TextStyle(
                      font: fontNormal,
                      fontSize: 8,
                      color: PdfColor.fromHex('#a3adbd')),
                ),
              ],
            ),
          );
        },
      ),
    );

    await Printing.layoutPdf(
      onLayout: (PdfPageFormat format) async => await pdf.save(),
      name: project.nomi,
    );
  }

  pw.Widget _buildGridCell(
      String label,
      String value,
      pw.Font normal,
      pw.Font bold,
      PdfColor borderColor,
      PdfColor mutedColor,
      PdfColor navyColor,
      {required bool showBorderRight}) {
    return pw.Container(
      padding: const pw.EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: pw.BoxDecoration(
        border: showBorderRight
            ? pw.Border(right: pw.BorderSide(color: borderColor))
            : null,
      ),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Text(label.toUpperCase(),
              style: pw.TextStyle(font: bold, fontSize: 8, color: mutedColor)),
          pw.SizedBox(height: 2),
          pw.Text(value,
              style: pw.TextStyle(font: bold, fontSize: 10, color: navyColor)),
        ],
      ),
    );
  }

  pw.Widget _buildSummaryCard({
    required String label,
    required String amount,
    required String desc,
    required PdfColor bgColor,
    required PdfColor textColor,
    required PdfColor amtColor,
    required pw.Font bold,
    required pw.Font normal,
    required PdfColor borderColor,
  }) {
    return pw.Container(
      padding: const pw.EdgeInsets.all(10),
      decoration: pw.BoxDecoration(
        color: bgColor,
        borderRadius: const pw.BorderRadius.all(pw.Radius.circular(10)),
        border: pw.Border.all(color: borderColor),
      ),
      child: pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Row(
            children: [
              pw.Container(
                width: 6,
                height: 6,
                decoration: pw.BoxDecoration(
                    color: textColor, shape: pw.BoxShape.circle),
              ),
              pw.SizedBox(width: 4),
              pw.Text(label.toUpperCase(),
                  style:
                      pw.TextStyle(font: bold, fontSize: 8, color: textColor)),
            ],
          ),
          pw.SizedBox(height: 4),
          pw.Text(amount,
              style: pw.TextStyle(font: bold, fontSize: 16, color: amtColor)),
          pw.SizedBox(height: 2),
          pw.Text(desc,
              style: pw.TextStyle(font: normal, fontSize: 8, color: textColor)),
        ],
      ),
    );
  }
}

// ─────────── Sub-widgets ───────────

class _SummaryCard extends StatelessWidget {
  final String label, value, sub;
  final Color color;
  const _SummaryCard(
      {required this.label,
      required this.value,
      required this.sub,
      required this.color});
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.border)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: const TextStyle(fontSize: 11, color: AppColors.muted)),
            const SizedBox(height: 4),
            Text(value,
                style: TextStyle(
                    fontSize: 22, fontWeight: FontWeight.w800, color: color)),
            Text(sub,
                style: const TextStyle(fontSize: 11, color: AppColors.muted)),
          ],
        ),
      ),
    );
  }
}

class _FinRow extends StatelessWidget {
  final String label;
  final num value;
  final Color color;
  final IconData icon;
  const _FinRow(
      {required this.label,
      required this.value,
      required this.color,
      required this.icon});
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 32,
          height: 32,
          alignment: Alignment.center,
          decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, size: 16, color: color),
        ),
        const SizedBox(width: 10),
        Expanded(
            child: Text(label,
                style: const TextStyle(fontSize: 12, color: AppColors.text2))),
        Text(formatUzsToDisplay(value),
            style: TextStyle(
                fontSize: 13, fontWeight: FontWeight.w700, color: color)),
      ],
    );
  }
}

class _TimeChip extends StatelessWidget {
  final String label, value;
  final Color color;
  const _TimeChip(
      {required this.label, required this.value, required this.color});
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Text(label,
                style: TextStyle(
                    fontSize: 10, color: color, fontWeight: FontWeight.w600)),
            const SizedBox(height: 2),
            Text(value,
                style: TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w800, color: color),
                textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

class _TxCountChip extends StatelessWidget {
  final String label;
  final int count;
  final Color color;
  const _TxCountChip(
      {required this.label, required this.count, required this.color});
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.15)),
        ),
        child: Column(
          children: [
            Text('$count',
                style: TextStyle(
                    fontSize: 20, fontWeight: FontWeight.w800, color: color)),
            Text(label,
                style: const TextStyle(fontSize: 10, color: AppColors.muted)),
          ],
        ),
      ),
    );
  }
}
