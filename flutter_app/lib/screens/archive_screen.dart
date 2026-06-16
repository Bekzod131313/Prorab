import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/project_repository.dart';
import '../models/project.dart';
import '../theme/app_theme.dart';
import '../widgets/project_card.dart' show formatMoney, colorForProject;
import 'project_detail_screen.dart';

class ArchiveScreen extends StatefulWidget {
  const ArchiveScreen({super.key});

  @override
  State<ArchiveScreen> createState() => _ArchiveScreenState();
}

class _ArchiveScreenState extends State<ArchiveScreen> {
  final _repo = ProjectRepository();
  final _dateFmt = DateFormat('dd MMM yyyy');
  List<Project> _projects = [];
  bool _loading = true;
  String _sort = 'recent';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final all = await _repo.loadProjects();
    final archived = all.where((p) => p.status == 'done' || p.status == 'archived').toList();
    _applySort(archived);
    if (mounted) setState(() { _projects = archived; _loading = false; });
  }

  void _applySort(List<Project> list) {
    if (_sort == 'recent') {
      list.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    } else if (_sort == 'profit') {
      list.sort((a, b) => (b.kirim - b.chiqim).compareTo(a.kirim - a.chiqim));
    } else if (_sort == 'name') {
      list.sort((a, b) => a.nomi.compareTo(b.nomi));
    }
  }

  @override
  Widget build(BuildContext context) {
    // Summary stats
    final totalProfit = _projects.fold<num>(0, (s, p) => s + (p.kirim - p.chiqim));
    final totalIn = _projects.fold<num>(0, (s, p) => s + p.kirim);
    final avgProfit = _projects.isEmpty ? 0.0 : totalProfit / _projects.length;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: const Text('Arxiv'),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.sort_rounded),
            color: AppColors.card,
            onSelected: (v) {
              setState(() => _sort = v);
              _applySort(_projects);
            },
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'recent', child: Text('Yangi')),
              const PopupMenuItem(value: 'profit', child: Text('Foyda')),
              const PopupMenuItem(value: 'name', child: Text('Nom')),
            ],
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _projects.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.archive_outlined, size: 52, color: AppColors.muted),
                      SizedBox(height: 12),
                      Text('Yakunlangan loyihalar yo\'q', style: TextStyle(color: AppColors.muted, fontSize: 15)),
                    ],
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                  children: [
                    // Summary
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.card,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Row(
                        children: [
                          _StatCol(label: 'Loyihalar', value: '${_projects.length} ta', color: AppColors.text),
                          _StatCol(label: 'Jami kirim', value: '${formatMoney(totalIn)} so\'m', color: const Color(0xFF22C55E)),
                          _StatCol(
                            label: 'Jami foyda',
                            value: '${formatMoney(totalProfit)} so\'m',
                            color: totalProfit >= 0 ? const Color(0xFF22C55E) : const Color(0xFFEF4444),
                          ),
                          _StatCol(
                            label: "O'rt. foyda",
                            value: '${formatMoney(avgProfit.round())} so\'m',
                            color: AppColors.accent,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Project list
                    ..._projects.map((p) {
                      final profit = p.kirim - p.chiqim;
                      final profitPositive = profit >= 0;
                      final accentColor = colorForProject(p.id);

                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: GestureDetector(
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: p)),
                          ),
                          child: Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: AppColors.card,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: AppColors.border),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      width: 8,
                                      height: 8,
                                      decoration: BoxDecoration(color: accentColor, shape: BoxShape.circle),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(p.nomi, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFF22C55E).withOpacity(0.12),
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: const Text('Yakunlandi', style: TextStyle(fontSize: 10, color: Color(0xFF22C55E), fontWeight: FontWeight.w700)),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    if (p.manzil != null)
                                      Row(children: [
                                        const Icon(Icons.location_on_rounded, size: 12, color: AppColors.muted),
                                        const SizedBox(width: 2),
                                        Text(p.manzil!, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                                      ])
                                    else
                                      const SizedBox(),
                                    Text(_dateFmt.format(p.createdAt), style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                const Divider(color: AppColors.border, height: 1),
                                const SizedBox(height: 10),
                                Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          const Text('Kirim', style: TextStyle(fontSize: 10, color: AppColors.muted)),
                                          Text('${formatMoney(p.kirim)} so\'m', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF22C55E))),
                                        ],
                                      ),
                                    ),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          const Text('Chiqim', style: TextStyle(fontSize: 10, color: AppColors.muted)),
                                          Text('${formatMoney(p.chiqim)} so\'m', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFFEF4444))),
                                        ],
                                      ),
                                    ),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.end,
                                        children: [
                                          const Text('Foyda', style: TextStyle(fontSize: 10, color: AppColors.muted)),
                                          Text(
                                            '${profitPositive ? '+' : ''}${formatMoney(profit)} so\'m',
                                            style: TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w800,
                                              color: profitPositive ? const Color(0xFF22C55E) : const Color(0xFFEF4444),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                                if (p.muddat > 0) ...[
                                  const SizedBox(height: 8),
                                  Text('Muddat: ${p.muddat} kun', style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                                ],
                              ],
                            ),
                          ),
                        ),
                      );
                    }),
                  ],
                ),
    );
  }
}

class _StatCol extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _StatCol({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(label, style: const TextStyle(fontSize: 9, color: AppColors.muted), textAlign: TextAlign.center),
          const SizedBox(height: 4),
          Text(value, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color), textAlign: TextAlign.center),
        ],
      ),
    );
  }
}
