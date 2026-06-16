import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../data/supplier_repository.dart';
import '../theme/app_theme.dart';
import '../widgets/project_card.dart' show formatMoney;

class SupplierScreen extends StatefulWidget {
  const SupplierScreen({super.key});

  @override
  State<SupplierScreen> createState() => _SupplierScreenState();
}

class _SupplierScreenState extends State<SupplierScreen> {
  final _repo = SupplierRepository();
  List<Supplier> _suppliers = [];
  bool _loading = true;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final list = await _repo.load();
    if (mounted) setState(() { _suppliers = list; _loading = false; });
  }

  List<Supplier> get _filtered {
    if (_search.isEmpty) return _suppliers;
    final q = _search.toLowerCase();
    return _suppliers.where((s) =>
        s.nomi.toLowerCase().contains(q) ||
        (s.telefon?.contains(q) ?? false) ||
        (s.manzil?.toLowerCase().contains(q) ?? false)).toList();
  }

  Future<void> _openSheet({Supplier? existing}) async {
    final noCtrl = TextEditingController(text: existing?.nomi ?? '');
    final telCtrl = TextEditingController(text: existing?.telefon ?? '');
    final manCtrl = TextEditingController(text: existing?.manzil ?? '');
    final izohCtrl = TextEditingController(text: existing?.izoh ?? '');

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(existing == null ? 'Yangi yetkazib beruvchi' : 'Tahrirlash',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 16),
            TextField(controller: noCtrl, autofocus: true, decoration: const InputDecoration(hintText: 'Kompaniya / Ism *')),
            const SizedBox(height: 10),
            TextField(controller: telCtrl, keyboardType: TextInputType.phone, decoration: const InputDecoration(hintText: 'Telefon raqam')),
            const SizedBox(height: 10),
            TextField(controller: manCtrl, decoration: const InputDecoration(hintText: 'Manzil')),
            const SizedBox(height: 10),
            TextField(controller: izohCtrl, maxLines: 2, decoration: const InputDecoration(hintText: 'Izoh')),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () { if (noCtrl.text.trim().isNotEmpty) Navigator.pop(ctx, true); },
              child: Text(existing == null ? 'Qo\'shish' : 'Saqlash'),
            ),
          ],
        ),
      ),
    );

    if (saved == true && noCtrl.text.trim().isNotEmpty) {
      if (existing == null) {
        await _repo.add(Supplier(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          nomi: noCtrl.text.trim(),
          telefon: telCtrl.text.trim().isEmpty ? null : telCtrl.text.trim(),
          manzil: manCtrl.text.trim().isEmpty ? null : manCtrl.text.trim(),
          izoh: izohCtrl.text.trim().isEmpty ? null : izohCtrl.text.trim(),
          createdAt: DateTime.now(),
        ));
      } else {
        await _repo.update(Supplier(
          id: existing.id,
          nomi: noCtrl.text.trim(),
          telefon: telCtrl.text.trim().isEmpty ? null : telCtrl.text.trim(),
          manzil: manCtrl.text.trim().isEmpty ? null : manCtrl.text.trim(),
          izoh: izohCtrl.text.trim().isEmpty ? null : izohCtrl.text.trim(),
          createdAt: existing.createdAt,
          totalPurchased: existing.totalPurchased,
        ));
      }
      _load();
    }

    for (final c in [noCtrl, telCtrl, manCtrl, izohCtrl]) c.dispose();
  }

  Future<void> _delete(Supplier s) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.card,
        title: const Text("O'chirishni tasdiqlang"),
        content: Text("${s.nomi} o'chirilsinmi?"),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Bekor')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text("O'chirish", style: TextStyle(color: Color(0xFFEF4444)))),
        ],
      ),
    );
    if (ok == true) {
      await _repo.delete(s.id);
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    final totalPurchased = _suppliers.fold<num>(0, (s, x) => s + x.totalPurchased);

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: const Text('Yetkazib beruvchilar'),
        actions: [
          IconButton(icon: const Icon(Icons.add_rounded), onPressed: _openSheet),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // Search
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: TextField(
                    decoration: InputDecoration(
                      hintText: 'Qidirish...',
                      prefixIcon: const Icon(Icons.search_rounded, size: 18),
                      contentPadding: const EdgeInsets.symmetric(vertical: 10),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.border)),
                    ),
                    onChanged: (v) => setState(() => _search = v),
                  ),
                ),
                // Summary
                if (_suppliers.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      decoration: BoxDecoration(
                        color: AppColors.card,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('${_suppliers.length} ta yetkazib beruvchi', style: const TextStyle(fontSize: 12, color: AppColors.text2)),
                          Text('Jami: ${formatMoney(totalPurchased)} so\'m', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.accent)),
                        ],
                      ),
                    ),
                  ),
                // List
                Expanded(
                  child: filtered.isEmpty
                      ? const Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.store_outlined, size: 48, color: AppColors.muted),
                              SizedBox(height: 12),
                              Text('Yetkazib beruvchilar yo\'q', style: TextStyle(color: AppColors.muted)),
                              SizedBox(height: 4),
                              Text('+ tugmasini bosib qo\'shing', style: TextStyle(color: AppColors.muted, fontSize: 12)),
                            ],
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                          itemCount: filtered.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (_, i) {
                            final s = filtered[i];
                            return Dismissible(
                              key: Key(s.id),
                              direction: DismissDirection.endToStart,
                              background: Container(
                                alignment: Alignment.centerRight,
                                padding: const EdgeInsets.only(right: 20),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFEF4444).withOpacity(0.15),
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: const Icon(Icons.delete_outline_rounded, color: Color(0xFFEF4444)),
                              ),
                              confirmDismiss: (_) async {
                                await _delete(s);
                                return false;
                              },
                              child: GestureDetector(
                                onTap: () => _openSheet(existing: s),
                                child: Container(
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                    color: AppColors.card,
                                    borderRadius: BorderRadius.circular(14),
                                    border: Border.all(color: AppColors.border),
                                  ),
                                  child: Row(
                                    children: [
                                      Container(
                                        width: 44,
                                        height: 44,
                                        alignment: Alignment.center,
                                        decoration: BoxDecoration(
                                          color: AppColors.accent.withOpacity(0.12),
                                          borderRadius: BorderRadius.circular(12),
                                        ),
                                        child: Text(
                                          s.nomi.trim().isNotEmpty ? s.nomi.trim()[0].toUpperCase() : 'S',
                                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: AppColors.accent),
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(s.nomi, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                                            if (s.telefon != null)
                                              GestureDetector(
                                                onTap: () => Clipboard.setData(ClipboardData(text: s.telefon!)).then((_) {
                                                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Telefon nusxalandi')));
                                                }),
                                                child: Text(s.telefon!, style: const TextStyle(fontSize: 12, color: AppColors.accent)),
                                              ),
                                            if (s.manzil != null)
                                              Text(s.manzil!, style: const TextStyle(fontSize: 11, color: AppColors.muted), overflow: TextOverflow.ellipsis),
                                          ],
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Column(
                                        crossAxisAlignment: CrossAxisAlignment.end,
                                        children: [
                                          if (s.totalPurchased > 0)
                                            Text(
                                              '${formatMoney(s.totalPurchased)} so\'m',
                                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.accentTeal),
                                            ),
                                          const Icon(Icons.chevron_right_rounded, color: AppColors.muted, size: 18),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ],
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openSheet,
        backgroundColor: AppColors.accent,
        child: const Icon(Icons.add_rounded, color: Colors.white),
      ),
    );
  }
}
