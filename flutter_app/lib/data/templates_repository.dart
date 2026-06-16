import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class TxTemplate {
  final String id;
  final String izoh;
  final String kategoriya;
  final bool isIncome;

  TxTemplate({required this.id, required this.izoh, required this.kategoriya, required this.isIncome});

  Map<String, dynamic> toJson() => {'id': id, 'izoh': izoh, 'kategoriya': kategoriya, 'isIncome': isIncome};

  factory TxTemplate.fromJson(Map<String, dynamic> j) => TxTemplate(
        id: j['id'],
        izoh: j['izoh'] ?? '',
        kategoriya: j['kategoriya'] ?? '',
        isIncome: j['isIncome'] as bool? ?? false,
      );
}

class TemplatesRepository {
  static const _key = 'tx_templates';

  Future<List<TxTemplate>> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return [];
    try {
      return (jsonDecode(raw) as List).map((e) => TxTemplate.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> add(TxTemplate template) async {
    final templates = await load();
    templates.insert(0, template);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(templates.map((t) => t.toJson()).toList()));
  }

  Future<void> delete(String id) async {
    final templates = await load();
    templates.removeWhere((t) => t.id == id);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(templates.map((t) => t.toJson()).toList()));
  }
}
