import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class ProjectNote {
  final String id;
  final String obId;
  final String text;
  final DateTime createdAt;
  final String? title;

  ProjectNote({
    required this.id,
    required this.obId,
    required this.text,
    required this.createdAt,
    this.title,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'obId': obId,
        'text': text,
        'createdAt': createdAt.toIso8601String(),
        'title': title,
      };

  factory ProjectNote.fromJson(Map<String, dynamic> j) => ProjectNote(
        id: j['id'],
        obId: j['obId'],
        text: j['text'],
        createdAt: DateTime.parse(j['createdAt']),
        title: j['title'],
      );
}

class NoteRepository {
  static const _prefix = 'notes_';

  String _key(String obId) => '$_prefix$obId';

  Future<List<ProjectNote>> load(String obId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key(obId));
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw) as List;
      return list.map((e) => ProjectNote.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _save(String obId, List<ProjectNote> notes) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key(obId), jsonEncode(notes.map((n) => n.toJson()).toList()));
  }

  Future<void> add(String obId, String text, {String? title}) async {
    final notes = await load(obId);
    notes.insert(
      0,
      ProjectNote(
        id: '${obId}_${DateTime.now().millisecondsSinceEpoch}',
        obId: obId,
        text: text,
        createdAt: DateTime.now(),
        title: title?.trim().isEmpty == true ? null : title?.trim(),
      ),
    );
    await _save(obId, notes);
  }

  Future<void> update(String obId, String noteId, String text, {String? title}) async {
    final notes = await load(obId);
    final idx = notes.indexWhere((n) => n.id == noteId);
    if (idx >= 0) {
      notes[idx] = ProjectNote(
        id: noteId,
        obId: obId,
        text: text,
        createdAt: notes[idx].createdAt,
        title: title?.trim().isEmpty == true ? null : title?.trim(),
      );
      await _save(obId, notes);
    }
  }

  Future<void> delete(String obId, String noteId) async {
    final notes = await load(obId);
    notes.removeWhere((n) => n.id == noteId);
    await _save(obId, notes);
  }
}
