import 'package:flutter/material.dart';

import '../data/material_repository.dart';
import '../models/material.dart';
import '../models/project.dart';
import '../theme/app_theme.dart';
import '../widgets/project_card.dart' show formatMoney;
import 'project_detail_screen.dart';

class MaterialsScreen extends StatefulWidget {
  final List<Project> projects;

  const MaterialsScreen({super.key, required this.projects});

  @override
  State<MaterialsScreen> createState() => _MaterialsScreenState();
}

class _MaterialsScreenState extends State<MaterialsScreen> {
  final _repo = MaterialRepository();
  List<_MaterialItem> _items = [];
  bool _loading = true;
  String _filter = 'all';
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
    setState(() => _loading = true);
    final items = <_MaterialItem>[];
    for (final proj in widget.projects) {
      try {
        final mats = await _repo.loadForProject(proj.id);
        for (final m in mats) {
          items.add(_MaterialItem(material: m, project: proj));
        }
      } catch (_) {}
    }
    items.sort((a, b) {
      const order = {'kerak': 0, 'buyurtma': 1, 'yetkazildi': 2};
      return (order[a.material.holat] ?? 0).compareTo(order[b.material.holat] ?? 0);
    });
    if (mounted) setState(() { _items = items; _loading = false; });
  }

  List<_MaterialItem> get _filtered {
    var list = _items;
    if (_filter != 'all') list = list.where((i) => i.material.holat == _filter).toList();
    final q = _search.trim().toLowerCase();
    if (q.isNotEmpty) {
      list = list.where((i) =>
        i.material.nomi.toLowerCase().contains(q) ||
        i.project.nomi.toLowerCase().contains(q)
      ).toList();
    }
    return list;
  }

  num get _totalCost => _items.fold(0, (s, i) => s + i.material.total);
  num get _kerakCost => _items.where((i) => i.material.holat == 'kerak').fold(0, (s, i) => s + i.material.total);
  num get _buyurtmaCost => _items.where((i) => i.material.holat == 'buyurtma').fold(0, (s, i) => s + i.material.total);
  num get _yetkazildiCost => _items.where((i) => i.material.holat == 'yetkazildi').fold(0, (s, i) => s + i.material.total);

  int get _kerakCount => _items.where((i) => i.material.holat == 'kerak').length;
  int get _buyurtmaCount => _items.where((i) => i.material.holat == 'buyurtma').length;
  int get _yetkazildiCount => _items.where((i) => i.material.holat == 'yetkazildi').length;

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: _showSearch
            ? TextField(
                controller: _searchCtrl,
                autofocus: true,
                style: const TextStyle(color: AppColors.text),
                decoration: const InputDecoration(hintText: 'Material qidirish...', hintStyle: TextStyle(color: AppColors.muted), border: InputBorder.none),
                onChanged: (v) => setState(() => _search = v),
              )
            : const Text('Materiallar'),
        actions: [
          IconButton(
            icon: Icon(_showSearch ? Icons.close : Icons.search),
            onPressed: () => setState(() {
              _showSearch = !_showSearch;
              if (!_showSearch) { _search = ''; _searchCtrl.clear(); }
            }),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: CustomScrollView(
                slivers: [
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      child: Column(
                        children: [
                          // Summary card
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: AppColors.card,
                              borderRadius: BorderRadius.circular(18),
                              border: Border.all(color: AppColors.border),
                            ),
                            child: Column(
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    const Text('UMUMIY XARAJAT', style: TextStyle(fontSize: 10, color: AppColors.muted, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                                    Text('${formatMoney(_totalCost)} so\'m', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.text)),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                Row(
                                  children: [
                                    Expanded(child: _CostChip(label: 'Kerak', count: _kerakCount, cost: _kerakCost, color: const Color(0xFFEF4444))),
                                    const SizedBox(width: 8),
                                    Expanded(child: _CostChip(label: 'Buyurtma', count: _buyurtmaCount, cost: _buyurtmaCost, color: const Color(0xFFF59E0B))),
                                    const SizedBox(width: 8),
                                    Expanded(child: _CostChip(label: 'Yetkazildi', count: _yetkazildiCount, cost: _yetkazildiCost, color: const Color(0xFF22C55E))),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                          // Filter chips
                          SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: Row(
                              children: [
                                _FilterChip(label: 'Hammasi', count: _items.length, active: _filter == 'all', onTap: () => setState(() => _filter = 'all')),
                                const SizedBox(width: 8),
                                _FilterChip(label: 'Kerak', count: _kerakCount, active: _filter == 'kerak', color: const Color(0xFFEF4444), onTap: () => setState(() => _filter = 'kerak')),
                                const SizedBox(width: 8),
                                _FilterChip(label: 'Buyurtma', count: _buyurtmaCount, active: _filter == 'buyurtma', color: const Color(0xFFF59E0B), onTap: () => setState(() => _filter = 'buyurtma')),
                                const SizedBox(width: 8),
                                _FilterChip(label: 'Yetkazildi', count: _yetkazildiCount, active: _filter == 'yetkazildi', color: const Color(0xFF22C55E), onTap: () => setState(() => _filter = 'yetkazildi')),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                          if (filtered.isEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 40),
                              child: Column(
                                children: [
                                  Icon(Icons.inventory_2_outlined, size: 48, color: AppColors.muted.withOpacity(0.5)),
                                  const SizedBox(height: 12),
                                  const Text('Materiallar topilmadi', style: TextStyle(color: AppColors.muted)),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    sliver: SliverList(
                      delegate: SliverChildBuilderDelegate(
                        (ctx, i) {
                          final item = filtered[i];
                          final mat = item.material;
                          final statusColor = const {
                            'kerak': Color(0xFFEF4444),
                            'buyurtma': Color(0xFFF59E0B),
                            'yetkazildi': Color(0xFF22C55E),
                          }[mat.holat] ?? AppColors.muted;

                          return GestureDetector(
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => ProjectDetailScreen(project: item.project)),
                            ).then((_) => _load()),
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 8),
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: AppColors.card,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: AppColors.border),
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    width: 40,
                                    height: 40,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: statusColor.withOpacity(0.12),
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Icon(Icons.inventory_2_outlined, color: statusColor, size: 20),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(mat.nomi, style: const TextStyle(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis),
                                        const SizedBox(height: 2),
                                        Row(
                                          children: [
                                            Text('${mat.miqdor} ${mat.birlik}', style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600)),
                                            const Text(' • ', style: TextStyle(fontSize: 12, color: AppColors.muted)),
                                            Expanded(
                                              child: Text(item.project.nomi, style: const TextStyle(fontSize: 12, color: AppColors.muted), overflow: TextOverflow.ellipsis),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      if (mat.total > 0)
                                        Text(formatMoney(mat.total), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: statusColor.withOpacity(0.12),
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                        child: Text(mat.statusLabel, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: statusColor)),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                        childCount: filtered.length,
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _MaterialItem {
  final ObMaterial material;
  final Project project;
  _MaterialItem({required this.material, required this.project});
}

class _CostChip extends StatelessWidget {
  final String label;
  final int count;
  final num cost;
  final Color color;

  const _CostChip({required this.label, required this.count, required this.cost, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
          const SizedBox(height: 3),
          Text('$count ta', style: const TextStyle(fontSize: 11, color: AppColors.muted)),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final int count;
  final bool active;
  final Color? color;
  final VoidCallback onTap;

  const _FilterChip({required this.label, required this.count, required this.active, required this.onTap, this.color});

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.accent;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: active ? c.withOpacity(0.18) : AppColors.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: active ? c.withOpacity(0.5) : AppColors.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: active ? c : AppColors.text2)),
            if (count > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: c.withOpacity(0.2), borderRadius: BorderRadius.circular(8)),
                child: Text('$count', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: c)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
