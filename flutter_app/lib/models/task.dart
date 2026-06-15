class ObTask {
  final String id;
  final String obId;
  final String nomi;
  final String holat;
  final DateTime? muddat;

  ObTask({required this.id, required this.obId, required this.nomi, required this.holat, this.muddat});

  factory ObTask.fromMap(Map<String, dynamic> row) {
    return ObTask(
      id: row['id'].toString(),
      obId: row['ob_id'].toString(),
      nomi: row['nomi'] ?? '',
      holat: row['holat'] ?? 'todo',
      muddat: row['muddat'] != null ? DateTime.tryParse(row['muddat']) : null,
    );
  }

  static const statusLabels = {'todo': 'Boshlanmagan', 'progress': 'Jarayonda', 'done': 'Bajarildi'};

  String get statusLabel => statusLabels[holat] ?? holat;

  static const nextStatus = {'todo': 'progress', 'progress': 'done', 'done': 'todo'};

  String get next => nextStatus[holat] ?? 'todo';
}
