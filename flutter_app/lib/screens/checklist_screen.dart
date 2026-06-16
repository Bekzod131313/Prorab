import 'package:flutter/material.dart';

import '../data/checklist_repository.dart';
import '../models/project.dart';
import '../theme/app_theme.dart';

class ChecklistScreen extends StatefulWidget {
  final Project project;

  const ChecklistScreen({super.key, required this.project});

  @override
  State<ChecklistScreen> createState() => _ChecklistScreenState();
}

class _ChecklistScreenState extends State<ChecklistScreen> {
  final _repo = ChecklistRepository();
  List<ChecklistItem> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final items = await _repo.load(widget.project.id);
    if (mounted) setState(() { _items = items; _loading = false; });
  }

  Future<void> _toggle(String id) async {
    await _repo.toggle(widget.project.id, id);
    _load();
  }

  Future<void> _addCustomItem() async {
    final ctrl = TextEditingController();
    final catCtrl = TextEditingController();
    final saved = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Nazorat nuqtasi qo\'shish', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 12),
            TextField(controller: catCtrl, decoration: const InputDecoration(hintText: 'Kategoriya (ixtiyoriy)')),
            const SizedBox(height: 10),
            TextField(controller: ctrl, autofocus: true, decoration: const InputDecoration(hintText: 'Nazorat nuqtasi matni')),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () { if (ctrl.text.trim().isNotEmpty) Navigator.pop(ctx, true); },
              child: const Text('Qo\'shish'),
            ),
          ],
        ),
      ),
    );
    if (saved == true && ctrl.text.trim().isNotEmpty) {
      await _repo.addItem(widget.project.id, ctrl.text.trim(), category: catCtrl.text.trim().isNotEmpty ? catCtrl.text.trim() : null);
      _load();
    }
    ctrl.dispose(); catCtrl.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final grouped = <String, List<ChecklistItem>>{};
    for (final item in _items) {
      final cat = item.category ?? 'Boshqa';
      grouped.putIfAbsent(cat, () => []).add(item);
    }

    final total = _items.length;
    final checked = _items.where((i) => i.isChecked).length;
    final progress = total > 0 ? checked / total : 0.0;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Text('Sifat nazorati — ${widget.project.nomi}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded),
            onPressed: _addCustomItem,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                // Progress card
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('$checked / $total bajarildi', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                          Text(
                            '${(progress * 100).round()}%',
                            style: TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 18,
                              color: progress == 1.0 ? const Color(0xFF22C55E) : AppColors.accent,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: LinearProgressIndicator(
                          value: progress,
                          minHeight: 10,
                          backgroundColor: AppColors.border,
                          valueColor: AlwaysStoppedAnimation(
                            progress == 1.0 ? const Color(0xFF22C55E) : AppColors.accent,
                          ),
                        ),
                      ),
                      if (progress == 1.0) ...[
                        const SizedBox(height: 10),
                        const Row(
                          children: [
                            Icon(Icons.verified_rounded, size: 16, color: Color(0xFF22C55E)),
                            SizedBox(width: 6),
                            Text('Barcha nazorat nuqtalari bajarildi!', style: TextStyle(fontSize: 12, color: Color(0xFF22C55E), fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                // Groups
                for (final cat in grouped.keys) ...[
                  _CategorySection(
                    category: cat,
                    items: grouped[cat]!,
                    onToggle: _toggle,
                  ),
                  const SizedBox(height: 12),
                ],
              ],
            ),
    );
  }
}

class _CategorySection extends StatelessWidget {
  final String category;
  final List<ChecklistItem> items;
  final ValueChanged<String> onToggle;

  const _CategorySection({required this.category, required this.items, required this.onToggle});

  @override
  Widget build(BuildContext context) {
    final done = items.where((i) => i.isChecked).length;
    final allDone = done == items.length;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: allDone ? const Color(0xFF22C55E).withOpacity(0.3) : AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
            child: Row(
              children: [
                if (allDone)
                  const Icon(Icons.check_circle_rounded, size: 16, color: Color(0xFF22C55E))
                else
                  const Icon(Icons.radio_button_unchecked_rounded, size: 16, color: AppColors.muted),
                const SizedBox(width: 8),
                Text(category, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: allDone ? const Color(0xFF22C55E) : AppColors.text)),
                const Spacer(),
                Text('$done/${items.length}', style: TextStyle(fontSize: 11, color: allDone ? const Color(0xFF22C55E) : AppColors.muted, fontWeight: FontWeight.w700)),
              ],
            ),
          ),
          const Divider(color: AppColors.border, height: 1),
          for (int i = 0; i < items.length; i++) ...[
            InkWell(
              onTap: () => onToggle(items[i].id),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                child: Row(
                  children: [
                    Container(
                      width: 22,
                      height: 22,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: items[i].isChecked ? const Color(0xFF22C55E) : Colors.transparent,
                        border: Border.all(
                          color: items[i].isChecked ? const Color(0xFF22C55E) : AppColors.border,
                          width: 2,
                        ),
                      ),
                      child: items[i].isChecked ? const Icon(Icons.check, size: 13, color: Colors.white) : null,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        items[i].text,
                        style: TextStyle(
                          fontSize: 14,
                          color: items[i].isChecked ? AppColors.muted : AppColors.text,
                          decoration: items[i].isChecked ? TextDecoration.lineThrough : null,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (i < items.length - 1) const Divider(color: AppColors.border, height: 1, indent: 48),
          ],
        ],
      ),
    );
  }
}
