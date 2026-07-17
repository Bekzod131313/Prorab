import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../l10n/strings.dart';
import '../data/transaction_repository.dart';
import '../data/worker_repository.dart';
import '../models/worker.dart';
import '../theme/app_theme.dart';
import '../widgets/member_row.dart' show colorForName;
import '../widgets/project_card.dart' show formatMoney, formatUzsToDisplay;
import '../widgets/add_worker_global_sheet.dart';
import 'worker_detail_screen.dart';
import '../widgets/shimmer.dart';

class WorkersScreen extends StatefulWidget {
  const WorkersScreen({super.key});

  @override
  State<WorkersScreen> createState() => _WorkersScreenState();
}

class _WorkersScreenState extends State<WorkersScreen> {
  final _repo = WorkerRepository();
  final _txRepo = TransactionRepository();
  List<Worker> _workers = [];
  bool _loading = true;

  String _searchQuery = '';
  String _selectedFilter = 'Hammasi';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final workers = await _repo.loadAll();
    if (!mounted) return;
    setState(() {
      _workers = workers;
      _loading = false;
    });
  }

  Future<void> _quickPayWorker(Worker worker) async {
    if (worker.balans <= 0 || worker.obsList.isEmpty) return;

    WorkerProject? selectedOb;
    final activeObs = worker.obsList.where((op) => op.balans > 0).toList();
    final listToChoose = activeObs.isNotEmpty ? activeObs : worker.obsList;

    if (listToChoose.length == 1) {
      selectedOb = listToChoose.first;
    } else {
      selectedOb = await showModalBottomSheet<WorkerProject>(
        context: context,
        backgroundColor: AppColors.card,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        builder: (ctx) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(tr('select_project_pay'),
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 12),
                for (final op in listToChoose)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(op.obNomi),
                    subtitle: Text("Qarzdorlik: ${formatMoney(op.balans)} so'm"),
                    trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.muted),
                    onTap: () => Navigator.of(ctx).pop(op),
                  ),
              ],
            ),
          ),
        ),
      );
    }
    if (selectedOb == null || !mounted) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('pay_confirm_title').replaceFirst('{}', worker.displayName)),
        content: Text('${selectedOb!.obNomi}: ${formatMoney(selectedOb.balans)} ${tr("currency_uzs")}?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Bekor')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(tr('pay_yes')),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    try {
      await _txRepo.addTransaction(
        obId: selectedOb.obId,
        isIncome: false,
        amount: selectedOb.balans,
        kategoriya: 'Mehnat haqi',
        toUserId: worker.userId,
      );
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("To'lov amalga oshirildi")));
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _openAddWorkerGlobal() async {
    final phoneCtrl = TextEditingController();
    final kasbCtrl = TextEditingController();

    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => AddWorkerGlobalSheet(
        phoneCtrl: phoneCtrl,
        kasbCtrl: kasbCtrl,
      ),
    );

    if (result == true) {
      setState(() => _loading = true);
      try {
        await _repo.addWorkerGlobal(
          phone: phoneCtrl.text.trim(),
          kasb: kasbCtrl.text.trim(),
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(tr('payment_success'))),
          );
        }
        _load();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e.toString())),
          );
        }
        setState(() => _loading = false);
      }
    }

    Future.delayed(const Duration(milliseconds: 350), () {
      phoneCtrl.dispose();
      kasbCtrl.dispose();
    });
  }

  String formatCurrency(num value) {
    return formatUzsToDisplay(value);
  }

  String formatBalance(num balance) {
    final sign = balance > 0 ? '+' : (balance < 0 ? '-' : '');
    final absVal = formatUzsToDisplay(balance.abs());
    return '$sign$absVal';
  }

  String formatLastActive(DateTime? date) {
    if (date == null) return tr('no_workers');
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    final compareDate = DateTime(date.year, date.month, date.day);

    if (compareDate == today) {
      return appLocaleNotifier.value == 'ru' ? 'Сегодня' : 'Bugun';
    } else if (compareDate == yesterday) {
      return appLocaleNotifier.value == 'ru' ? 'Вчера' : 'Kecha';
    } else {
      final diff = today.difference(compareDate).inDays;
      return appLocaleNotifier.value == 'ru' ? '$diff дн. назад' : '$diff kun oldin';
    }
  }

  Widget _buildAvatar(Worker worker, String initials, Color color) {
    final avatarUrl = worker.profile?.avatarUrl;
    if (avatarUrl != null && avatarUrl.isNotEmpty) {
      return CircleAvatar(
        radius: 22,
        backgroundImage: NetworkImage(avatarUrl),
      );
    }
    return CircleAvatar(
      radius: 22,
      backgroundColor: color.withOpacity(0.15),
      child: Text(
        initials,
        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: color),
      ),
    );
  }

  Widget _buildFilterChips() {
    final filterLabels = [
      tr('all'),
      appLocaleNotifier.value == 'ru' ? 'Плюс' : 'Musbat',
      appLocaleNotifier.value == 'ru' ? 'Минус' : 'Manfiy',
      tr('active'),
    ];
    final filterValues = ['Hammasi', 'Musbat', 'Manfiy', 'Faol'];
    return SizedBox(
      height: 38,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: filterValues.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final f = filterValues[index];
          final label = filterLabels[index];
          final selected = _selectedFilter == f;
          return InkWell(
            onTap: () => setState(() => _selectedFilter = f),
            borderRadius: BorderRadius.circular(18),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              decoration: BoxDecoration(
                color: selected ? AppColors.accent : Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: selected ? AppColors.accent : AppColors.border),
              ),
              child: Center(
                child: Text(
                  label,
                  style: TextStyle(
                    color: selected ? Colors.white : const Color(0xFF475569),
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildStatsCards({
    required int total,
    required int musbat,
    required int manfiy,
    required int nol,
  }) {
    final isRu = appLocaleNotifier.value == 'ru';
    final countSuffix = isRu ? 'чел.' : 'ta';
    return SizedBox(
      height: 64,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _buildStatCard(isRu ? 'Всего рабочих' : 'Jami ishchi', "$total $countSuffix", const Color(0xFF0F172A)),
          const SizedBox(width: 8),
          _buildStatCard(isRu ? 'Плюс баланс' : 'Musbat balans', "$musbat $countSuffix", const Color(0xFF22C55E)),
          const SizedBox(width: 8),
          _buildStatCard(isRu ? 'Минус баланс' : 'Manfiy balans', "$manfiy $countSuffix", const Color(0xFFEF4444)),
          const SizedBox(width: 8),
          _buildStatCard(isRu ? 'Нулевой баланс' : 'Nol balans', "$nol $countSuffix", const Color(0xFF64748B)),
        ],
      ),
    );
  }

  Widget _buildStatCard(String label, String value, Color textColor) {
    return Container(
      width: 104,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 9.5,
              fontWeight: FontWeight.w700,
              color: textColor.withOpacity(textColor == const Color(0xFF0F172A) ? 0.6 : 1.0),
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 3),
          Text(
            value,
            style: TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.w800,
              color: textColor,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGridItem(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 9.5,
            fontWeight: FontWeight.w700,
            color: Color(0xFF94A3B8),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w800,
            color: Color(0xFF0F172A),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: appLocaleNotifier,
      builder: (_, __, ___) {
    final totalWorkers = _workers.length;
    final musbatCount = _workers.where((w) => w.balans > 0).length;
    final manfiyCount = _workers.where((w) => w.balans < 0).length;
    final nolCount = _workers.where((w) => w.balans == 0).length;

    final filtered = _workers.where((w) {
      final name = w.displayName.toLowerCase();
      final kasb = (w.kasb ?? '').toLowerCase();
      final query = _searchQuery.toLowerCase().trim();
      if (query.isNotEmpty && !name.contains(query) && !kasb.contains(query)) {
        return false;
      }
      if (_selectedFilter == 'Musbat') {
        return w.balans > 0;
      } else if (_selectedFilter == 'Manfiy') {
        return w.balans < 0;
      } else if (_selectedFilter == 'Faol') {
        return w.obsCount > 0;
      }
      return true;
    }).toList();

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        centerTitle: true,
        title: Text(
          tr('nav_workers'),
          style: const TextStyle(
            color: Color(0xFF0F172A),
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded, color: AppColors.accent, size: 28),
            onPressed: _openAddWorkerGlobal,
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? _buildShimmerLoading()
            : ListView(
                padding: const EdgeInsets.symmetric(vertical: 12),
                children: [
                  // 1. Search Bar
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                    child: TextField(
                      onChanged: (val) => setState(() => _searchQuery = val),
                      decoration: InputDecoration(
                        hintText: tr('search'),
                        prefixIcon: const Icon(Icons.search_rounded, color: AppColors.muted, size: 20),
                        filled: true,
                        fillColor: Colors.white,
                        contentPadding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: const BorderSide(color: AppColors.border),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: const BorderSide(color: AppColors.border),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: const BorderSide(color: AppColors.accent, width: 1.2),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),

                  // 2. Filter Chips
                  _buildFilterChips(),
                  const SizedBox(height: 16),

                  // 3. Stats Cards
                  _buildStatsCards(
                    total: totalWorkers,
                    musbat: musbatCount,
                    manfiy: manfiyCount,
                    nol: nolCount,
                  ),
                  const SizedBox(height: 16),

                  // 4. Workers List
                  filtered.isEmpty
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 40.0),
                            child: Text(
                              tr('worker_not_found'),
                              style: const TextStyle(color: AppColors.muted),
                            ),
                          ),
                        )
                      : ListView.separated(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          itemCount: filtered.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 12),
                          itemBuilder: (context, index) {
                            final worker = filtered[index];
                            final color = colorForName(worker.displayName);
                            final initials = worker.displayName.trim().isEmpty
                                ? '?'
                                : worker.displayName.trim()[0].toUpperCase();
                            final owed = worker.balans;
                            final balanceColor = owed > 0
                                ? const Color(0xFF22C55E)
                                : (owed < 0 ? const Color(0xFFEF4444) : AppColors.muted);

                            return Container(
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: AppColors.card,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: AppColors.border),
                              ),
                              child: InkWell(
                                onTap: () async {
                                  await Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => WorkerDetailScreen(worker: worker),
                                    ),
                                  );
                                  _load();
                                },
                                child: Column(
                                  children: [
                                    // Top Row: Avatar + Name/Profession + Balance
                                    Row(
                                      children: [
                                        _buildAvatar(worker, initials, color),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                worker.displayName,
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.w800,
                                                  fontSize: 15,
                                                  color: Color(0xFF0F172A),
                                                ),
                                              ),
                                              const SizedBox(height: 2),
                                              Text(
                                                worker.kasb?.isNotEmpty == true
                                                    ? worker.kasb!
                                                    : tr('worker_default_role'),
                                                style: const TextStyle(
                                                  fontSize: 12,
                                                  fontWeight: FontWeight.w500,
                                                  color: Color(0xFF64748B),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        Text(
                                          formatBalance(owed),
                                          style: TextStyle(
                                            fontSize: 15,
                                            fontWeight: FontWeight.w800,
                                            color: balanceColor,
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 16),

                                    // Bottom Row: Grid Items
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Expanded(
                                          child: _buildGridItem(
                                            tr('salary'),
                                            formatCurrency(worker.ishaqi),
                                          ),
                                        ),
                                        Expanded(
                                          child: _buildGridItem(
                                            tr('received'),
                                            formatCurrency(worker.olingan),
                                          ),
                                        ),
                                        Expanded(
                                          child: _buildGridItem(
                                            tr('last_activity'),
                                            formatLastActive(worker.lastActive),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                ],
              ),
      ),
    );
      },
    );
  }

  Widget _buildShimmerLoading() {
    return Shimmer(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          ShimmerBox(height: 50, borderRadius: 24),
          SizedBox(height: 20),
          ShimmerBox(height: 80, borderRadius: 16),
          SizedBox(height: 12),
          ShimmerBox(height: 80, borderRadius: 16),
          SizedBox(height: 12),
          ShimmerBox(height: 80, borderRadius: 16),
          SizedBox(height: 12),
          ShimmerBox(height: 80, borderRadius: 16),
        ],
      ),
    );
  }
}
