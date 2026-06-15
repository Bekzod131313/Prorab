import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/currency_repository.dart';
import '../data/project_repository.dart';
import '../data/transaction_repository.dart';
import '../main.dart';
import '../models/currency.dart';
import '../models/project.dart';
import '../models/transaction.dart';
import '../theme/app_theme.dart';
import '../widgets/moliya_logo.dart';
import '../widgets/project_card.dart';
import 'project_detail_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final _repo = ProjectRepository();
  final _txRepo = TransactionRepository();
  List<Project> _projects = [];
  List<ProjectTransaction> _recentTxs = [];
  bool _loading = true;
  String? _error;

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
      final projects = await _repo.loadProjects();
      List<ProjectTransaction> recentTxs = [];
      try {
        recentTxs = await _txRepo.loadRecentForProjects(projects.map((p) => p.id).toList());
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _projects = projects;
        _recentTxs = recentTxs;
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

  Future<void> _openAddProject() async {
    final nameCtrl = TextEditingController();
    final daysCtrl = TextEditingController(text: '30');
    DateTime startDate = DateTime.now();

    final created = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Yangi obyekt',
                style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(hintText: 'Obyekt nomi'),
              ),
              const SizedBox(height: 12),
              InkWell(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: ctx,
                    initialDate: startDate,
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2100),
                  );
                  if (picked != null) setSheetState(() => startDate = picked);
                },
                child: InputDecorator(
                  decoration: const InputDecoration(labelText: 'Boshlanish sanasi'),
                  child: Text(
                    '${startDate.year}-${startDate.month.toString().padLeft(2, '0')}-${startDate.day.toString().padLeft(2, '0')}',
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: daysCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(hintText: 'Muddat (kun)'),
              ),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: () {
                  if (nameCtrl.text.trim().isEmpty) return;
                  Navigator.of(ctx).pop(true);
                },
                child: const Text('Yaratish'),
              ),
            ],
          ),
        ),
      ),
    );

    if (created == true) {
      final days = int.tryParse(daysCtrl.text.trim()) ?? 30;
      await _repo.createProject(
        nomi: nameCtrl.text.trim(),
        boshlanish: startDate,
        muddat: days,
      );
      _load();
    }
  }

  Future<void> _openCurrencyRates() async {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => const _CurrencyRatesSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Row(
          children: const [
            MoliyaLogo(size: 28),
            SizedBox(width: 10),
            Text('Moliya'),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.currency_exchange_rounded),
            onPressed: _openCurrencyRates,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openAddProject,
        child: const Icon(Icons.add_rounded),
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
    if (_projects.isEmpty) {
      return ListView(
        children: [
          const SizedBox(height: 100),
          const Icon(Icons.folder_open_rounded, size: 56, color: AppColors.muted),
          const SizedBox(height: 12),
          const Center(
            child: Text("Hozircha obyektlar yo'q", style: TextStyle(color: AppColors.text2)),
          ),
        ],
      );
    }
    final projectNames = {for (final p in _projects) p.id: p.nomi};
    final showRecent = _recentTxs.isNotEmpty;
    final headerCount = _projects.length + 1;
    final itemCount = headerCount + (showRecent ? 1 + _recentTxs.length : 0);

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: itemCount,
      itemBuilder: (context, index) {
        if (index == 0) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 12, left: 4),
            child: Text(
              'Faol obyektlar',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
          );
        }
        if (index <= _projects.length) {
          final project = _projects[index - 1];
          return ProjectCard(
            project: project,
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: project)),
              );
            },
          );
        }
        if (index == headerCount) {
          return Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 12, left: 4),
            child: Text(
              "So'nggi harakatlar",
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
          );
        }
        final tx = _recentTxs[index - headerCount - 1];
        final isLast = index == itemCount - 1;
        return _RecentTxTile(
          tx: tx,
          obNomi: projectNames[tx.obId] ?? '',
          isLast: isLast,
          onTap: () {
            final project = _projects.firstWhere(
              (p) => p.id == tx.obId,
              orElse: () => _projects.first,
            );
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: project)),
            );
          },
        );
      },
    );
  }
}

class _RecentTxTile extends StatelessWidget {
  final ProjectTransaction tx;
  final String obNomi;
  final bool isLast;
  final VoidCallback? onTap;

  const _RecentTxTile({required this.tx, required this.obNomi, required this.isLast, this.onTap});

  @override
  Widget build(BuildContext context) {
    final userId = supabase.auth.currentUser?.id;
    final isIn = tx.isIncomeFor(userId ?? '');

    final Color dotColor;
    final String title;
    switch (tx.tur) {
      case 'income':
        dotColor = const Color(0xFF22C55E);
        title = tx.izoh?.isNotEmpty == true ? tx.izoh! : 'Kirim';
        break;
      case 'ishhaqi':
        dotColor = const Color(0xFF3B82F6);
        title = 'Ish haqi berildi';
        break;
      case 'send':
        dotColor = const Color(0xFF3B82F6);
        title = "Pul o'tkazma";
        break;
      case 'spend':
        dotColor = const Color(0xFFF43F5E);
        title = tx.kategoriya?.isNotEmpty == true ? tx.kategoriya! : 'Chiqim';
        break;
      default:
        dotColor = const Color(0xFFF43F5E);
        title = tx.izoh ?? '';
    }

    final amountColor = isIn ? const Color(0xFF22C55E) : const Color(0xFFF43F5E);
    final sign = isIn ? '+' : '-';
    final dateStr = DateFormat('dd.MM.yyyy').format(tx.date);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Column(
              children: [
                const SizedBox(height: 4),
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: dotColor,
                    border: Border.all(color: AppColors.bg, width: 3),
                    boxShadow: [BoxShadow(color: dotColor.withOpacity(0.35), blurRadius: 0, spreadRadius: 2)],
                  ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(width: 2, margin: const EdgeInsets.symmetric(vertical: 2), color: AppColors.border),
                  ),
              ],
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(bottom: isLast ? 0 : 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: const TextStyle(fontWeight: FontWeight.w800),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '$sign${formatMoney(tx.summa)}',
                          style: TextStyle(fontWeight: FontWeight.w900, color: amountColor),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      obNomi.isNotEmpty ? '$obNomi • $dateStr' : dateStr,
                      style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CurrencyRatesSheet extends StatefulWidget {
  const _CurrencyRatesSheet();

  @override
  State<_CurrencyRatesSheet> createState() => _CurrencyRatesSheetState();
}

class _CurrencyRatesSheetState extends State<_CurrencyRatesSheet> {
  final _repo = CurrencyRepository();
  List<CurrencyRate>? _rates;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final rates = await _repo.loadRates();
      if (!mounted) return;
      setState(() {
        _rates = rates;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Kursni yuklashda xato');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: 20 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Valyuta kurslari',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 16),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: Center(child: Text(_error!, style: const TextStyle(color: AppColors.muted))),
            )
          else if (_rates == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Center(child: CircularProgressIndicator()),
            )
          else
            ..._rates!.map((c) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppColors.bg,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Text(c.code, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: AppColors.text2)),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(c.nameUz, style: const TextStyle(fontWeight: FontWeight.w700)),
                            Text(c.nameEn, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text("${c.rate.toStringAsFixed(2)} so'm", style: const TextStyle(fontWeight: FontWeight.w900)),
                          Text(
                            '${c.diff > 0 ? '▲' : c.diff < 0 ? '▼' : ''} ${c.diff.abs().toStringAsFixed(2)}',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: c.diff > 0
                                  ? const Color(0xFF16A34A)
                                  : c.diff < 0
                                      ? const Color(0xFFEF4444)
                                      : AppColors.muted,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                )),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}
