import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/project_repository.dart';
import '../main.dart';
import '../models/project.dart';
import '../models/transaction.dart';
import '../theme/app_theme.dart';
import '../widgets/project_card.dart' show formatMoney;

class ActivityScreen extends StatefulWidget {
  const ActivityScreen({super.key});

  @override
  State<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends State<ActivityScreen> {
  final _projectRepo = ProjectRepository();

  bool _loading = true;
  String? _error;
  List<_ActivityItem> _items = [];
  Map<String, String> _obNames = {};
  List<Project> _projects = [];

  String _filterType = 'all'; // all | income | spend | send | ishhaqi
  String? _filterObId;
  String _search = '';
  bool _showSearch = false;
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final projects = await _projectRepo.loadProjects();
      final obIds = projects.map((p) => p.id).toList();
      final obNames = {for (final p in projects) p.id: p.nomi};

      List<ProjectTransaction> txs = [];
      if (obIds.isNotEmpty) {
        final rows = await supabase
            .from('transactions')
            .select('*')
            .inFilter('ob_id', obIds)
            .order('tx_date', ascending: false)
            .limit(200);
        txs = (rows as List).map((r) => ProjectTransaction.fromMap(r as Map<String, dynamic>)).toList();
      }

      final userId = supabase.auth.currentUser?.id ?? '';
      final items = txs.map((tx) => _ActivityItem(tx: tx, obNomi: obNames[tx.obId] ?? '', userId: userId)).toList();

      if (!mounted) return;
      setState(() {
        _items = items;
        _obNames = obNames;
        _projects = projects;
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

  List<_ActivityItem> get _filtered {
    var list = _items;
    if (_filterType != 'all') list = list.where((i) => i.tx.tur == _filterType).toList();
    if (_filterObId != null) list = list.where((i) => i.tx.obId == _filterObId).toList();
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      list = list.where((i) {
        return i.obNomi.toLowerCase().contains(q) ||
            (i.tx.izoh?.toLowerCase().contains(q) ?? false) ||
            (i.tx.kategoriya?.toLowerCase().contains(q) ?? false) ||
            i.tx.summa.toString().contains(q);
      }).toList();
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: _showSearch
            ? TextField(
                controller: _searchCtrl,
                autofocus: true,
                style: const TextStyle(color: AppColors.text),
                decoration: const InputDecoration(
                  hintText: 'Qidirish...',
                  hintStyle: TextStyle(color: AppColors.muted),
                  border: InputBorder.none,
                ),
                onChanged: (v) => setState(() => _search = v),
              )
            : const Text('Faoliyat'),
        actions: [
          IconButton(
            icon: Icon(_showSearch ? Icons.close_rounded : Icons.search_rounded),
            onPressed: () {
              setState(() {
                _showSearch = !_showSearch;
                if (!_showSearch) {
                  _search = '';
                  _searchCtrl.clear();
                }
              });
            },
          ),
          IconButton(
            icon: const Icon(Icons.filter_list_rounded),
            onPressed: _projects.isEmpty ? null : _openProjectFilter,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _buildBody(),
      ),
    );
  }

  void _openProjectFilter() {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Loyiha bo\'yicha filter', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 16),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Hammasi'),
              trailing: _filterObId == null ? const Icon(Icons.check_rounded, color: AppColors.accent) : null,
              onTap: () {
                setState(() => _filterObId = null);
                Navigator.pop(context);
              },
            ),
            const Divider(color: AppColors.border, height: 1),
            ..._projects.map((p) => Column(
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(p.nomi, overflow: TextOverflow.ellipsis),
                  trailing: _filterObId == p.id ? const Icon(Icons.check_rounded, color: AppColors.accent) : null,
                  onTap: () {
                    setState(() => _filterObId = p.id);
                    Navigator.pop(context);
                  },
                ),
                const Divider(color: AppColors.border, height: 1),
              ],
            )),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return ListView(children: [
        const SizedBox(height: 80),
        Center(child: Text('Xatolik: $_error', style: const TextStyle(color: Colors.redAccent))),
      ]);
    }

    final items = _filtered;

    return Column(
      children: [
        _TypeFilterRow(
          selected: _filterType,
          onChanged: (v) => setState(() => _filterType = v),
        ),
        if (_filterObId != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Row(
              children: [
                const Icon(Icons.folder_outlined, size: 14, color: AppColors.accent),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    _obNames[_filterObId] ?? '',
                    style: const TextStyle(fontSize: 12, color: AppColors.accent, fontWeight: FontWeight.w700),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                GestureDetector(
                  onTap: () => setState(() => _filterObId = null),
                  child: const Icon(Icons.close_rounded, size: 16, color: AppColors.muted),
                ),
              ],
            ),
          ),
        Expanded(
          child: items.isEmpty
              ? const Center(child: Text("Ma'lumot yo'q", style: TextStyle(color: AppColors.muted)))
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  itemCount: items.length,
                  itemBuilder: (context, index) {
                    final item = items[index];
                    final prevItem = index > 0 ? items[index - 1] : null;
                    final showDate = prevItem == null ||
                        !_sameDay(item.tx.date, prevItem.tx.date);
                    // Compute day totals
                    num dayIn = 0, dayOut = 0;
                    if (showDate) {
                      for (final i in items) {
                        if (_sameDay(i.tx.date, item.tx.date)) {
                          if (i.tx.isIncomeFor(i.userId)) dayIn += i.tx.summa;
                          if (i.tx.isExpenseFor(i.userId)) dayOut += i.tx.summa;
                        }
                      }
                    }
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (showDate) _DateHeader(date: item.tx.date, dayIn: dayIn, dayOut: dayOut),
                        _ActivityTile(item: item),
                      ],
                    );
                  },
                ),
        ),
      ],
    );
  }

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

class _ActivityItem {
  final ProjectTransaction tx;
  final String obNomi;
  final String userId;

  _ActivityItem({required this.tx, required this.obNomi, required this.userId});
}

class _TypeFilterRow extends StatelessWidget {
  final String selected;
  final ValueChanged<String> onChanged;

  const _TypeFilterRow({required this.selected, required this.onChanged});

  static const _filters = [
    ('all', 'Hammasi'),
    ('income', 'Kirim'),
    ('spend', 'Chiqim'),
    ('send', 'Avans'),
    ('ishhaqi', 'Ish haqi'),
  ];

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Row(
        children: [
          for (var i = 0; i < _filters.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            _Chip(
              label: _filters[i].$2,
              selected: selected == _filters[i].$1,
              onTap: () => onChanged(_filters[i].$1),
            ),
          ],
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _Chip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
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

class _DateHeader extends StatelessWidget {
  final DateTime date;
  final num dayIn;
  final num dayOut;

  const _DateHeader({required this.date, this.dayIn = 0, this.dayOut = 0});

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final d = DateTime(date.year, date.month, date.day);
    String label;
    if (d == today) {
      label = 'Bugun';
    } else if (d == today.subtract(const Duration(days: 1))) {
      label = 'Kecha';
    } else {
      label = DateFormat('d MMMM, yyyy').format(date);
    }
    return Padding(
      padding: const EdgeInsets.only(top: 16, bottom: 8),
      child: Row(
        children: [
          Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.muted, letterSpacing: 0.4)),
          const Spacer(),
          if (dayIn > 0) Text('+${formatMoney(dayIn)}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF22C55E))),
          if (dayIn > 0 && dayOut > 0) const Text(' ', style: TextStyle(fontSize: 11, color: AppColors.muted)),
          if (dayOut > 0) Text('-${formatMoney(dayOut)}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFFF43F5E))),
        ],
      ),
    );
  }
}

class _ActivityTile extends StatelessWidget {
  final _ActivityItem item;

  const _ActivityTile({required this.item});

  static const _turColors = {
    'income': Color(0xFF22C55E),
    'spend': Color(0xFFF43F5E),
    'send': Color(0xFFF59E0B),
    'ishhaqi': Color(0xFF3B82F6),
  };

  static const _turIcons = {
    'income': Icons.arrow_downward_rounded,
    'spend': Icons.arrow_upward_rounded,
    'send': Icons.send_rounded,
    'ishhaqi': Icons.payments_rounded,
  };

  static const _turLabels = {
    'income': 'Kirim',
    'spend': 'Chiqim',
    'send': 'Avans',
    'ishhaqi': 'Ish haqi',
  };

  @override
  Widget build(BuildContext context) {
    final tx = item.tx;
    final color = _turColors[tx.tur] ?? AppColors.muted;
    final icon = _turIcons[tx.tur] ?? Icons.swap_horiz_rounded;
    final label = _turLabels[tx.tur] ?? tx.tur;
    final isIncome = tx.tur == 'income' || tx.isIncomeFor(item.userId);
    final sign = isIncome ? '+' : '-';
    final amtColor = isIncome ? const Color(0xFF22C55E) : const Color(0xFFF43F5E);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: color.withOpacity(0.14),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 18, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(
                        color: color.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: color)),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        item.obNomi,
                        style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                if (tx.izoh?.isNotEmpty == true || tx.kategoriya?.isNotEmpty == true) ...[
                  const SizedBox(height: 3),
                  Text(
                    tx.izoh ?? tx.kategoriya ?? '',
                    style: const TextStyle(fontSize: 12.5, color: AppColors.text2),
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '$sign${formatMoney(tx.summa)}',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: amtColor),
              ),
              Text(
                DateFormat('HH:mm').format(tx.date),
                style: const TextStyle(fontSize: 11, color: AppColors.muted),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
