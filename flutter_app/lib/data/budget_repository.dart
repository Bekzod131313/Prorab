import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class BudgetRepository {
  static const _prefix = 'budget_';

  String _key(String obId) => '$_prefix$obId';

  Future<Map<String, num>> loadBudgets(String obId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key(obId));
    if (raw == null) return {};
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      return map.map((k, v) => MapEntry(k, (v as num)));
    } catch (_) {
      return {};
    }
  }

  Future<void> setBudget(String obId, String kategoriya, num amount) async {
    final budgets = await loadBudgets(obId);
    if (amount <= 0) {
      budgets.remove(kategoriya);
    } else {
      budgets[kategoriya] = amount;
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key(obId), jsonEncode(budgets));
  }

  Future<void> removeBudget(String obId, String kategoriya) async {
    final budgets = await loadBudgets(obId);
    budgets.remove(kategoriya);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key(obId), jsonEncode(budgets));
  }
}
