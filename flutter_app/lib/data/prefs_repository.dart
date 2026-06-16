import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class PrefsRepository {
  static const _pinnedKey = 'pinned_projects';

  Future<Set<String>> loadPinned() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_pinnedKey);
    if (raw == null) return {};
    try {
      return Set<String>.from((jsonDecode(raw) as List).map((e) => e.toString()));
    } catch (_) {
      return {};
    }
  }

  Future<void> togglePin(String projectId) async {
    final pinned = await loadPinned();
    if (pinned.contains(projectId)) {
      pinned.remove(projectId);
    } else {
      pinned.add(projectId);
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_pinnedKey, jsonEncode(pinned.toList()));
  }
}
