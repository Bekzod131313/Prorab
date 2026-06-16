import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class ProjectNote {
  final String id;
  final String text;
  final DateTime createdAt;

  ProjectNote({required this.id, required this.text, required this.createdAt});

  Map<String, dynamic> toJson() => {
        'id': id,
        'text': text,
        'createdAt': createdAt.toIso8601String(),
      };

  factory ProjectNote.fromJson(Map<String, dynamic> j) => ProjectNote(
        id: j['id'],
        text: j['text'],
        createdAt: DateTime.parse(j['createdAt']),
      );
}

class NotesRepository {
  static const _prefix = 'notes_';

  String _key(String obId) => '$_prefix$obId';

  Future<List<ProjectNote>> load(String obId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key(obId));
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw) as List;
      return list.map((e) => ProjectNote.fromJson(e as Map<String, dynamic>)).toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    } catch (_) {
      return [];
    }
  }

  Future<void> add(String obId, String text) async {
    final notes = await load(obId);
    notes.insert(
      0,
      ProjectNote(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        text: text,
        createdAt: DateTime.now(),
      ),
    );
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key(obId), jsonEncode(notes.map((n) => n.toJson()).toList()));
  }

  Future<void> delete(String obId, String noteId) async {
    final notes = await load(obId);
    notes.removeWhere((n) => n.id == noteId);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key(obId), jsonEncode(notes.map((n) => n.toJson()).toList()));
  }
}
