class ProjectTransaction {
  final String id;
  final String obId;
  final String tur; // income | spend | send
  final num summa;
  final String? izoh;
  final String? kategoriya;
  final String? toUser;
  final String? fromUser;
  final DateTime date;

  ProjectTransaction({
    required this.id,
    required this.obId,
    required this.tur,
    required this.summa,
    required this.izoh,
    required this.kategoriya,
    required this.toUser,
    required this.fromUser,
    required this.date,
  });

  factory ProjectTransaction.fromMap(Map<String, dynamic> row) {
    final dt = row['tx_date'] ?? row['created_at'];
    return ProjectTransaction(
      id: row['id'].toString(),
      obId: row['ob_id'].toString(),
      tur: row['tur'] ?? 'spend',
      summa: row['summa'] ?? 0,
      izoh: row['izoh'],
      kategoriya: row['kategoriya'],
      toUser: row['to_user']?.toString(),
      fromUser: row['from_user']?.toString(),
      date: DateTime.tryParse(dt ?? '') ?? DateTime.now(),
    );
  }

  bool isIncomeFor(String userId) => tur == 'income' || (tur == 'send' && toUser == userId);
  bool isExpenseFor(String userId) => tur == 'spend' || (tur == 'send' && fromUser == userId);
}
