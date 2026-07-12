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
  final String currency;
  final double exchangeRate;
  final double summaUsd;
  final double summaUzs;

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
    required this.currency,
    required this.exchangeRate,
    required this.summaUsd,
    required this.summaUzs,
  });

  factory ProjectTransaction.fromMap(Map<String, dynamic> row) {
    final dt = row['tx_date'] ?? row['created_at'];
    final summa = (row['summa'] ?? 0) as num;
    final currency = row['currency']?.toString() ?? 'UZS';
    final rate = (row['exchange_rate'] ?? 1.0) as num;
    
    final double uzsVal = row['summa_uzs'] != null 
        ? (row['summa_uzs'] as num).toDouble()
        : (currency == 'UZS' ? summa.toDouble() : summa.toDouble() * rate.toDouble());
        
    final double usdVal = row['summa_usd'] != null 
        ? (row['summa_usd'] as num).toDouble()
        : (currency == 'USD' ? summa.toDouble() : summa.toDouble() / rate.toDouble());

    return ProjectTransaction(
      id: row['id'].toString(),
      obId: row['ob_id'].toString(),
      tur: row['tur'] ?? 'spend',
      summa: summa,
      izoh: row['izoh'],
      kategoriya: row['kategoriya'],
      toUser: row['to_user']?.toString(),
      fromUser: row['from_user']?.toString(),
      date: DateTime.tryParse(dt ?? '') ?? DateTime.now(),
      currency: currency,
      exchangeRate: rate.toDouble(),
      summaUsd: usdVal,
      summaUzs: uzsVal,
    );
  }

  bool isIncomeFor(String userId) =>
      tur == 'income' ||
      ((tur == 'send' || tur == 'ishhaqi') && toUser == userId);
  bool isExpenseFor(String userId) =>
      tur == 'spend' ||
      ((tur == 'send' || tur == 'ishhaqi') && fromUser == userId);
}
