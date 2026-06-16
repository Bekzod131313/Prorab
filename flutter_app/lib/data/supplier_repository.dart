import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class Supplier {
  final String id;
  final String nomi;
  final String? telefon;
  final String? manzil;
  final String? izoh;
  final DateTime createdAt;
  num totalPurchased;

  Supplier({
    required this.id,
    required this.nomi,
    this.telefon,
    this.manzil,
    this.izoh,
    required this.createdAt,
    this.totalPurchased = 0,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'nomi': nomi,
        'telefon': telefon,
        'manzil': manzil,
        'izoh': izoh,
        'createdAt': createdAt.toIso8601String(),
        'totalPurchased': totalPurchased,
      };

  factory Supplier.fromJson(Map<String, dynamic> j) => Supplier(
        id: j['id'],
        nomi: j['nomi'],
        telefon: j['telefon'],
        manzil: j['manzil'],
        izoh: j['izoh'],
        createdAt: DateTime.parse(j['createdAt']),
        totalPurchased: j['totalPurchased'] ?? 0,
      );
}

class SupplierRepository {
  static const _key = 'suppliers_v1';

  Future<List<Supplier>> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw) as List;
      return list.map((e) => Supplier.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _save(List<Supplier> suppliers) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(suppliers.map((s) => s.toJson()).toList()));
  }

  Future<void> add(Supplier supplier) async {
    final list = await load();
    list.insert(0, supplier);
    await _save(list);
  }

  Future<void> update(Supplier supplier) async {
    final list = await load();
    final idx = list.indexWhere((s) => s.id == supplier.id);
    if (idx >= 0) list[idx] = supplier;
    await _save(list);
  }

  Future<void> delete(String id) async {
    final list = await load();
    list.removeWhere((s) => s.id == id);
    await _save(list);
  }

  Future<void> addPurchase(String supplierId, num amount) async {
    final list = await load();
    final idx = list.indexWhere((s) => s.id == supplierId);
    if (idx >= 0) {
      list[idx].totalPurchased += amount;
      await _save(list);
    }
  }
}
