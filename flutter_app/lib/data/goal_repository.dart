import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class ProjectGoal {
  final String obId;
  final num? targetProfit;
  final num? targetKirim;
  final DateTime? targetDate;
  final String? izoh;

  const ProjectGoal({
    required this.obId,
    this.targetProfit,
    this.targetKirim,
    this.targetDate,
    this.izoh,
  });

  Map<String, dynamic> toJson() => {
        'obId': obId,
        'targetProfit': targetProfit,
        'targetKirim': targetKirim,
        'targetDate': targetDate?.toIso8601String(),
        'izoh': izoh,
      };

  factory ProjectGoal.fromJson(Map<String, dynamic> j) => ProjectGoal(
        obId: j['obId'],
        targetProfit: j['targetProfit'],
        targetKirim: j['targetKirim'],
        targetDate: j['targetDate'] != null ? DateTime.tryParse(j['targetDate']) : null,
        izoh: j['izoh'],
      );
}

class GoalRepository {
  static const _prefix = 'goal_';

  String _key(String obId) => '$_prefix$obId';

  Future<ProjectGoal?> load(String obId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key(obId));
    if (raw == null) return null;
    try {
      return ProjectGoal.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> save(ProjectGoal goal) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key(goal.obId), jsonEncode(goal.toJson()));
  }

  Future<void> delete(String obId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key(obId));
  }
}
