import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class CategoryRepository {
  static const _expenseKey = 'custom_cats';
  static const _incomeKey = 'custom_income_cats';

  Future<List<String>> loadCustomExpenseCats() => _load(_expenseKey);

  Future<List<String>> loadCustomIncomeCats() => _load(_incomeKey);

  Future<void> addExpenseCat(String name) => _add(_expenseKey, name);

  Future<void> addIncomeCat(String name) => _add(_incomeKey, name);

  Future<List<String>> _load(String key) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(key);
    if (raw == null) return [];
    try {
      return (jsonDecode(raw) as List).map((e) => e.toString()).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _add(String key, String name) async {
    final prefs = await SharedPreferences.getInstance();
    final list = await _load(key);
    if (!list.contains(name)) {
      list.add(name);
      await prefs.setString(key, jsonEncode(list));
    }
  }
}
