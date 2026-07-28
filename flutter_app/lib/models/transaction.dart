import 'dart:convert';

class ProjectTransaction {
  final String id;
  final String obId;
  final String tur; // income | spend | send
  final num summa;
  final String? izoh;
  final String? kategoriya;
  final String? toUser;
  final String? fromUser;
  final String? createdBy;
  final DateTime date;
  final String currency;
  final double exchangeRate;
  final double summaUsd;
  final double summaUzs;
  final List<String> files;

  ProjectTransaction({
    required this.id,
    required this.obId,
    required this.tur,
    required this.summa,
    required this.izoh,
    required this.kategoriya,
    required this.toUser,
    required this.fromUser,
    this.createdBy,
    required this.date,
    required this.currency,
    required this.exchangeRate,
    required this.summaUsd,
    required this.summaUzs,
    this.files = const [],
  });

  factory ProjectTransaction.fromMap(Map<String, dynamic> row) {
    final dt = row['tx_date'] ?? row['created_at'];
    final summa = (row['summa'] ?? 0) as num;
    final currency = row['currency']?.toString() ?? 'UZS';
    final rate = (row['exchange_rate'] ?? 1.0) as num;

    final double uzsVal = row['summa_uzs'] != null
        ? (row['summa_uzs'] as num).toDouble()
        : (currency == 'UZS'
            ? summa.toDouble()
            : summa.toDouble() * rate.toDouble());

    final double usdVal = row['summa_usd'] != null
        ? (row['summa_usd'] as num).toDouble()
        : (currency == 'USD'
            ? summa.toDouble()
            : summa.toDouble() / rate.toDouble());

    List<String> filePaths = [];
    if (row['files'] != null) {
      if (row['files'] is List) {
        filePaths = (row['files'] as List).map((e) => e.toString()).toList();
      } else if (row['files'] is String) {
        try {
          final decoded = jsonDecode(row['files'] as String);
          if (decoded is List) {
            filePaths = decoded.map((e) => e.toString()).toList();
          }
        } catch (_) {
          filePaths = (row['files'] as String)
              .split(',')
              .where((s) => s.isNotEmpty)
              .toList();
        }
      }
    }

    return ProjectTransaction(
      id: row['id'].toString(),
      obId: row['ob_id'].toString(),
      tur: row['tur'] ?? 'spend',
      summa: summa,
      izoh: row['izoh'],
      kategoriya: row['kategoriya'],
      toUser: row['to_user']?.toString(),
      fromUser: row['from_user']?.toString(),
      createdBy: row['created_by']?.toString(),
      date: DateTime.tryParse(dt ?? '') ?? DateTime.now(),
      currency: currency,
      exchangeRate: rate.toDouble(),
      summaUsd: usdVal,
      summaUzs: uzsVal,
      files: filePaths,
    );
  }

  bool isIncomeFor(String userId) {
    if (userId.isEmpty) return tur == 'income' || tur == 'kirim';
    // If sent TO this user by someone else, it is INCOME for this user
    if (toUser == userId && createdBy != userId) return true;
    if (createdBy == userId && toUser != null && toUser != userId) return false;
    if (tur == 'income' || tur == 'kirim') return true;
    return false;
  }

  bool isExpenseFor(String userId) {
    if (userId.isEmpty) return tur == 'spend' || tur == 'send' || tur == 'chiqim' || tur == 'expense' || tur == 'ishhaqi';
    // If sent TO this user by someone else, it is NOT an expense for this user
    if (toUser == userId && createdBy != userId) return false;
    if (createdBy == userId || fromUser == userId) return true;
    return tur == 'spend' || tur == 'send' || tur == 'chiqim' || tur == 'expense' || tur == 'ishhaqi';
  }
}
