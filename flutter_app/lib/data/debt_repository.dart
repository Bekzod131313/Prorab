import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

enum DebtDirection { gave, received }

class Debt {
  final String id;
  final String name;
  final num amount;
  final DebtDirection direction;
  final DateTime date;
  final String? izoh;
  final bool isPaid;

  Debt({
    required this.id,
    required this.name,
    required this.amount,
    required this.direction,
    required this.date,
    this.izoh,
    this.isPaid = false,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'amount': amount,
        'direction': direction.name,
        'date': date.toIso8601String(),
        'izoh': izoh,
        'isPaid': isPaid,
      };

  factory Debt.fromJson(Map<String, dynamic> j) => Debt(
        id: j['id'],
        name: j['name'],
        amount: j['amount'],
        direction: DebtDirection.values.firstWhere((d) => d.name == j['direction'], orElse: () => DebtDirection.gave),
        date: DateTime.parse(j['date']),
        izoh: j['izoh'],
        isPaid: j['isPaid'] ?? false,
      );

  Debt copyWith({bool? isPaid}) => Debt(
        id: id,
        name: name,
        amount: amount,
        direction: direction,
        date: date,
        izoh: izoh,
        isPaid: isPaid ?? this.isPaid,
      );
}

class DebtRepository {
  static const _key = 'debts_v1';

  Future<List<Debt>> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw) as List;
      return list.map((e) => Debt.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _save(List<Debt> debts) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(debts.map((d) => d.toJson()).toList()));
  }

  Future<void> add(Debt debt) async {
    final list = await load();
    list.insert(0, debt);
    await _save(list);
  }

  Future<void> markPaid(String id) async {
    final list = await load();
    final idx = list.indexWhere((d) => d.id == id);
    if (idx >= 0) {
      list[idx] = list[idx].copyWith(isPaid: true);
      await _save(list);
    }
  }

  Future<void> delete(String id) async {
    final list = await load();
    list.removeWhere((d) => d.id == id);
    await _save(list);
  }
}
