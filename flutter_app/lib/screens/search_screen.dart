import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../main.dart';
import '../models/project.dart';
import '../models/transaction.dart';
import '../theme/app_theme.dart';
import '../widgets/project_card.dart' show colorForProject, formatMoney;
import 'project_detail_screen.dart';

class SearchScreen extends StatefulWidget {
  final List<Project> projects;

  const SearchScreen({super.key, required this.projects});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _ctrl = TextEditingController();
  String _query = '';
  bool _loading = false;
  List<_SearchResult> _results = [];

  final _obNames = <String, String>{};
  final _obMap = <String, Project>{};

  @override
  void initState() {
    super.initState();
    for (final p in widget.projects) {
      _obNames[p.id] = p.nomi;
      _obMap[p.id] = p;
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _search(String q) async {
    setState(() {
      _query = q;
      _results = [];
    });
    if (q.trim().length < 2) return;

    setState(() => _loading = true);
    try {
      final obIds = widget.projects.map((p) => p.id).toList();
      final results = <_SearchResult>[];

      // Search projects
      for (final p in widget.projects) {
        if (p.nomi.toLowerCase().contains(q.toLowerCase()) ||
            (p.manzil?.toLowerCase().contains(q.toLowerCase()) ?? false) ||
            (p.mijoz?.toLowerCase().contains(q.toLowerCase()) ?? false)) {
          results.add(_SearchResult(type: _ResultType.project, project: p));
        }
      }

      if (obIds.isNotEmpty) {
        // Search transactions
        final txRows = await supabase
            .from('transactions')
            .select('*')
            .inFilter('ob_id', obIds)
            .or('izoh.ilike.%$q%,kategoriya.ilike.%$q%')
            .order('tx_date', ascending: false)
            .limit(30);
        for (final row in txRows as List) {
          final tx = ProjectTransaction.fromMap(row as Map<String, dynamic>);
          results.add(_SearchResult(type: _ResultType.transaction, tx: tx, obNomi: _obNames[tx.obId] ?? ''));
        }

        // Search tasks
        final taskRows = await supabase
            .from('tasks')
            .select('*')
            .inFilter('ob_id', obIds)
            .ilike('nomi', '%$q%')
            .order('created_at', ascending: false)
            .limit(20);
        for (final row in taskRows as List) {
          final r = row as Map<String, dynamic>;
          results.add(_SearchResult(
            type: _ResultType.task,
            taskNomi: r['nomi'] ?? '',
            taskHolat: r['holat'] ?? 'todo',
            obNomi: _obNames[r['ob_id']?.toString() ?? ''] ?? '',
            obId: r['ob_id']?.toString() ?? '',
          ));
        }

        // Search materials
        final matRows = await supabase
            .from('materials')
            .select('*')
            .inFilter('ob_id', obIds)
            .ilike('nomi', '%$q%')
            .order('created_at', ascending: false)
            .limit(20);
        for (final row in matRows as List) {
          final r = row as Map<String, dynamic>;
          results.add(_SearchResult(
            type: _ResultType.material,
            matNomi: r['nomi'] ?? '',
            matMiqdor: r['miqdor'] ?? 0,
            matBirlik: r['birlik'] ?? '',
            matHolat: r['holat'] ?? '',
            obNomi: _obNames[r['ob_id']?.toString() ?? ''] ?? '',
            obId: r['ob_id']?.toString() ?? '',
          ));
        }
      }

      if (!mounted) return;
      setState(() {
        _results = results;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: TextField(
          controller: _ctrl,
          autofocus: true,
          style: const TextStyle(color: AppColors.text),
          decoration: const InputDecoration(
            hintText: 'Qidirish...',
            hintStyle: TextStyle(color: AppColors.muted),
            border: InputBorder.none,
          ),
          onChanged: _search,
        ),
        actions: [
          if (_ctrl.text.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.close_rounded),
              onPressed: () {
                _ctrl.clear();
                _search('');
              },
            ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_query.trim().length < 2) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.search_rounded, size: 64, color: AppColors.muted.withOpacity(0.4)),
            const SizedBox(height: 12),
            const Text('Qidirish uchun yozing', style: TextStyle(color: AppColors.muted, fontSize: 15)),
            const SizedBox(height: 4),
            const Text('Loyihalar, vazifalar, materiallar, tranzaksiyalar', style: TextStyle(color: AppColors.muted, fontSize: 12)),
          ],
        ),
      );
    }
    if (_results.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.search_off_rounded, size: 56, color: AppColors.muted.withOpacity(0.4)),
            const SizedBox(height: 12),
            Text('"$_query" bo\'yicha natija topilmadi', style: const TextStyle(color: AppColors.muted, fontSize: 14)),
          ],
        ),
      );
    }

    final groups = <String, List<_SearchResult>>{};
    for (final r in _results) {
      groups.putIfAbsent(r.type.label, () => []).add(r);
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        for (final entry in groups.entries) ...[
          Padding(
            padding: const EdgeInsets.only(top: 16, bottom: 8),
            child: Text(
              '${entry.key} (${entry.value.length})',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.muted, letterSpacing: 0.4),
            ),
          ),
          for (final result in entry.value) _buildTile(result),
        ],
      ],
    );
  }

  Widget _buildTile(_SearchResult r) {
    switch (r.type) {
      case _ResultType.project:
        final p = r.project!;
        final color = colorForProject(p.nomi);
        return _ResultCard(
          leading: Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(12)),
            child: Text(p.nomi[0].toUpperCase(), style: TextStyle(fontWeight: FontWeight.w900, color: color, fontSize: 16)),
          ),
          title: p.nomi,
          subtitle: p.manzil ?? p.mijoz ?? '',
          trailing: p.status == 'done' ? 'Yakunlandi' : 'Faol',
          trailingColor: p.status == 'done' ? const Color(0xFF22C55E) : AppColors.accent,
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: p)),
          ),
        );
      case _ResultType.transaction:
        final tx = r.tx!;
        final isIncome = tx.tur == 'income';
        final color = isIncome ? const Color(0xFF22C55E) : const Color(0xFFF43F5E);
        final sign = isIncome ? '+' : '-';
        return _ResultCard(
          leading: Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: color.withOpacity(0.13), borderRadius: BorderRadius.circular(12)),
            child: Icon(isIncome ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded, color: color, size: 18),
          ),
          title: tx.izoh ?? tx.kategoriya ?? tx.tur,
          subtitle: r.obNomi,
          trailing: '$sign${formatMoney(tx.summa)}',
          trailingColor: color,
          trailingSmall: DateFormat('dd.MM.yy').format(tx.date),
          onTap: null,
        );
      case _ResultType.task:
        final holat = r.taskHolat ?? 'todo';
        const holatColors = {'todo': AppColors.muted, 'progress': Color(0xFFF59E0B), 'done': Color(0xFF22C55E)};
        const holatLabels = {'todo': 'Boshlanmagan', 'progress': 'Jarayonda', 'done': 'Bajarildi'};
        final hColor = holatColors[holat] ?? AppColors.muted;
        return _ResultCard(
          leading: Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: hColor.withOpacity(0.13), borderRadius: BorderRadius.circular(12)),
            child: Icon(Icons.task_alt_rounded, color: hColor, size: 18),
          ),
          title: r.taskNomi ?? '',
          subtitle: r.obNomi,
          trailing: holatLabels[holat] ?? holat,
          trailingColor: hColor,
          onTap: r.obId != null && _obMap[r.obId] != null
              ? () => Navigator.push(context, MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: _obMap[r.obId]!)))
              : null,
        );
      case _ResultType.material:
        const holatColors = {'kerak': Color(0xFFF59E0B), 'bor': Color(0xFF22C55E), 'yetarli': Color(0xFF22C55E)};
        final hColor = holatColors[r.matHolat ?? ''] ?? AppColors.muted;
        return _ResultCard(
          leading: Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: const Color(0xFFA855F7).withOpacity(0.13), borderRadius: BorderRadius.circular(12)),
            child: const Icon(Icons.inventory_2_outlined, color: Color(0xFFA855F7), size: 18),
          ),
          title: r.matNomi ?? '',
          subtitle: r.obNomi,
          trailing: '${r.matMiqdor} ${r.matBirlik}',
          trailingColor: hColor,
          onTap: r.obId != null && _obMap[r.obId] != null
              ? () => Navigator.push(context, MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: _obMap[r.obId]!)))
              : null,
        );
    }
  }
}

enum _ResultType {
  project,
  transaction,
  task,
  material;

  String get label => switch (this) {
        _ResultType.project => 'Loyihalar',
        _ResultType.transaction => 'Tranzaksiyalar',
        _ResultType.task => 'Vazifalar',
        _ResultType.material => 'Materiallar',
      };
}

class _SearchResult {
  final _ResultType type;
  final Project? project;
  final ProjectTransaction? tx;
  final String obNomi;
  final String? obId;
  final String? taskNomi;
  final String? taskHolat;
  final String? matNomi;
  final num? matMiqdor;
  final String? matBirlik;
  final String? matHolat;

  const _SearchResult({
    required this.type,
    this.project,
    this.tx,
    this.obNomi = '',
    this.obId,
    this.taskNomi,
    this.taskHolat,
    this.matNomi,
    this.matMiqdor,
    this.matBirlik,
    this.matHolat,
  });
}

class _ResultCard extends StatelessWidget {
  final Widget leading;
  final String title;
  final String subtitle;
  final String trailing;
  final Color trailingColor;
  final String? trailingSmall;
  final VoidCallback? onTap;

  const _ResultCard({
    required this.leading,
    required this.title,
    required this.subtitle,
    required this.trailing,
    required this.trailingColor,
    this.trailingSmall,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            leading,
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis),
                  if (subtitle.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(subtitle, style: const TextStyle(fontSize: 12, color: AppColors.muted), overflow: TextOverflow.ellipsis),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(trailing, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: trailingColor)),
                if (trailingSmall != null)
                  Text(trailingSmall!, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
