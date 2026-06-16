import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class ProjectTemplate {
  final String id;
  final String nomi;
  final int muddat;
  final String? manzil;
  final String? mijoz;
  final String? bosqich;

  const ProjectTemplate({
    required this.id,
    required this.nomi,
    required this.muddat,
    this.manzil,
    this.mijoz,
    this.bosqich,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'nomi': nomi,
        'muddat': muddat,
        'manzil': manzil,
        'mijoz': mijoz,
        'bosqich': bosqich,
      };

  factory ProjectTemplate.fromJson(Map<String, dynamic> j) => ProjectTemplate(
        id: j['id'],
        nomi: j['nomi'],
        muddat: j['muddat'] ?? 30,
        manzil: j['manzil'],
        mijoz: j['mijoz'],
        bosqich: j['bosqich'],
      );
}

class ProjectTemplateRepository {
  static const _key = 'project_templates_v1';

  Future<List<ProjectTemplate>> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw) as List;
      return list.map((e) => ProjectTemplate.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> save(List<ProjectTemplate> templates) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(templates.map((t) => t.toJson()).toList()));
  }

  Future<void> add(ProjectTemplate template) async {
    final list = await load();
    list.insert(0, template);
    await save(list);
  }

  Future<void> delete(String id) async {
    final list = await load();
    list.removeWhere((t) => t.id == id);
    await save(list);
  }
}
