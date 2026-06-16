import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class ChecklistItem {
  final String id;
  final String text;
  final bool isChecked;
  final String? category;

  ChecklistItem({
    required this.id,
    required this.text,
    this.isChecked = false,
    this.category,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'text': text,
        'isChecked': isChecked,
        'category': category,
      };

  factory ChecklistItem.fromJson(Map<String, dynamic> j) => ChecklistItem(
        id: j['id'],
        text: j['text'],
        isChecked: j['isChecked'] ?? false,
        category: j['category'],
      );

  ChecklistItem copyWith({bool? isChecked}) => ChecklistItem(
        id: id,
        text: text,
        isChecked: isChecked ?? this.isChecked,
        category: category,
      );
}

const _defaultChecklist = [
  ('Poydevor', 'Poydevor chuqurligi tekshirildi'),
  ('Poydevor', 'Beton mustahkamligi sinovdan o\'tdi'),
  ('Poydevor', 'Suv o\'tkazmaslik ishlov berildi'),
  ('Devorlar', 'Devor to\'g\'riligi tekshirildi'),
  ('Devorlar', 'G\'isht/blok sifati tasdiqlandi'),
  ('Devorlar', 'Gorizontal darajasi tekshirildi'),
  ('Tom', 'Tom materiallar sifati tasdiqlandi'),
  ('Tom', 'Tomning qiyaligi to\'g\'ri'),
  ('Tom', 'Suv oqimi tekshirildi'),
  ('Elektr', 'Elektr simlar diagrammaga mos'),
  ('Elektr', 'Zamin nazariyasi tekshirildi'),
  ('Santexnika', 'Quvurlar bosimi tekshirildi'),
  ('Santexnika', 'Kanalizatsiya oqimi tekshirildi'),
  ('Pardoz', 'Devor tekisligi tasdiqlandi'),
  ('Pardoz', 'Bo\'yoq sifati va rang to\'g\'ri'),
];

class ChecklistRepository {
  static const _prefix = 'checklist_';

  String _key(String obId) => '$_prefix$obId';

  Future<List<ChecklistItem>> load(String obId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key(obId));
    if (raw == null) {
      // Return default checklist
      return _defaultChecklist
          .asMap()
          .entries
          .map((e) => ChecklistItem(
                id: '${obId}_${e.key}',
                text: e.value.$2,
                category: e.value.$1,
              ))
          .toList();
    }
    try {
      final list = jsonDecode(raw) as List;
      return list.map((e) => ChecklistItem.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> save(String obId, List<ChecklistItem> items) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key(obId), jsonEncode(items.map((i) => i.toJson()).toList()));
  }

  Future<void> toggle(String obId, String itemId) async {
    final items = await load(obId);
    final idx = items.indexWhere((i) => i.id == itemId);
    if (idx >= 0) {
      items[idx] = items[idx].copyWith(isChecked: !items[idx].isChecked);
      await save(obId, items);
    }
  }

  Future<void> addItem(String obId, String text, {String? category}) async {
    final items = await load(obId);
    items.add(ChecklistItem(
      id: '${obId}_${DateTime.now().millisecondsSinceEpoch}',
      text: text,
      category: category,
    ));
    await save(obId, items);
  }
}
