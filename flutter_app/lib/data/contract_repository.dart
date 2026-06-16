import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class ProjectContract {
  final String obId;
  final String? mijozIsm;
  final num? shartnomaSumma;
  final num? oldingiTulov;
  final DateTime? shartnomaSana;
  final String? izoh;

  ProjectContract({
    required this.obId,
    this.mijozIsm,
    this.shartnomaSumma,
    this.oldingiTulov,
    this.shartnomaSana,
    this.izoh,
  });

  num get qoldiqTulov => (shartnomaSumma ?? 0) - (oldingiTulov ?? 0);

  Map<String, dynamic> toJson() => {
        'obId': obId,
        'mijozIsm': mijozIsm,
        'shartnomaSumma': shartnomaSumma,
        'oldingiTulov': oldingiTulov,
        'shartnomaSana': shartnomaSana?.toIso8601String(),
        'izoh': izoh,
      };

  factory ProjectContract.fromJson(Map<String, dynamic> j) => ProjectContract(
        obId: j['obId'],
        mijozIsm: j['mijozIsm'],
        shartnomaSumma: j['shartnomaSumma'],
        oldingiTulov: j['oldingiTulov'],
        shartnomaSana: j['shartnomaSana'] != null ? DateTime.tryParse(j['shartnomaSana']) : null,
        izoh: j['izoh'],
      );
}

class ContractRepository {
  static const _prefix = 'contract_';

  String _key(String obId) => '$_prefix$obId';

  Future<ProjectContract?> load(String obId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key(obId));
    if (raw == null) return null;
    try {
      return ProjectContract.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> save(ProjectContract contract) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key(contract.obId), jsonEncode(contract.toJson()));
  }

  Future<void> delete(String obId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key(obId));
  }
}
