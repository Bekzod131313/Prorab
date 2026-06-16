import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class TimeEntry {
  final String id;
  final String obId;
  final String workerName;
  final DateTime punchIn;
  final DateTime? punchOut;

  TimeEntry({
    required this.id,
    required this.obId,
    required this.workerName,
    required this.punchIn,
    this.punchOut,
  });

  Duration get duration => (punchOut ?? DateTime.now()).difference(punchIn);

  bool get isActive => punchOut == null;

  Map<String, dynamic> toJson() => {
        'id': id,
        'obId': obId,
        'workerName': workerName,
        'punchIn': punchIn.toIso8601String(),
        'punchOut': punchOut?.toIso8601String(),
      };

  factory TimeEntry.fromJson(Map<String, dynamic> j) => TimeEntry(
        id: j['id'],
        obId: j['obId'],
        workerName: j['workerName'],
        punchIn: DateTime.parse(j['punchIn']),
        punchOut: j['punchOut'] != null ? DateTime.tryParse(j['punchOut']) : null,
      );

  TimeEntry copyWith({DateTime? punchOut}) => TimeEntry(
        id: id,
        obId: obId,
        workerName: workerName,
        punchIn: punchIn,
        punchOut: punchOut ?? this.punchOut,
      );
}

class TimeLogRepository {
  static const _key = 'time_log_v1';

  Future<List<TimeEntry>> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw) as List;
      return list.map((e) => TimeEntry.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _save(List<TimeEntry> entries) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(entries.map((e) => e.toJson()).toList()));
  }

  Future<TimeEntry> punchIn({required String obId, required String workerName}) async {
    final entries = await load();
    final entry = TimeEntry(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      obId: obId,
      workerName: workerName,
      punchIn: DateTime.now(),
    );
    entries.insert(0, entry);
    await _save(entries);
    return entry;
  }

  Future<void> punchOut(String id) async {
    final entries = await load();
    final idx = entries.indexWhere((e) => e.id == id);
    if (idx >= 0) {
      entries[idx] = entries[idx].copyWith(punchOut: DateTime.now());
      await _save(entries);
    }
  }

  Future<void> delete(String id) async {
    final entries = await load();
    entries.removeWhere((e) => e.id == id);
    await _save(entries);
  }

  Future<List<TimeEntry>> loadForProject(String obId) async {
    final all = await load();
    return all.where((e) => e.obId == obId).toList();
  }
}
