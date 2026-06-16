class Project {
  final String id;
  final String nomi;
  final num kirim;
  final num chiqim;
  final DateTime? boshlanish;
  final DateTime createdAt;
  final int muddat;
  final String role;
  final num myBalance;
  final num ishaqi;
  final num olingan;
  final String status;
  final String? manzil;
  final String? mijoz;
  final String? bosqich;

  Project({
    required this.id,
    required this.nomi,
    required this.kirim,
    required this.chiqim,
    required this.boshlanish,
    required this.createdAt,
    required this.muddat,
    required this.role,
    required this.myBalance,
    required this.ishaqi,
    required this.olingan,
    required this.status,
    this.manzil,
    this.mijoz,
    this.bosqich,
  });

  num get balance => role == 'owner' ? (kirim - chiqim) : (ishaqi - olingan);

  factory Project.fromMember(Map<String, dynamic> row) {
    final ob = row['ob'] as Map<String, dynamic>;
    return Project(
      id: ob['id'].toString(),
      nomi: ob['nomi'] ?? '',
      kirim: ob['kirim'] ?? 0,
      chiqim: ob['chiqim'] ?? 0,
      boshlanish: ob['boshlanish'] != null ? DateTime.tryParse(ob['boshlanish']) : null,
      createdAt: DateTime.tryParse(ob['created_at'] ?? '') ?? DateTime.now(),
      muddat: ob['muddat'] ?? 30,
      role: row['role'] ?? 'member',
      myBalance: row['balance'] ?? 0,
      ishaqi: row['ishaqi'] ?? 0,
      olingan: row['olingan'] ?? 0,
      status: ob['status'] ?? 'active',
      manzil: ob['manzil'] as String?,
      mijoz: ob['mijoz'] as String?,
      bosqich: ob['bosqich'] as String?,
    );
  }

  /// Days passed since project start, capped at [muddat], and days remaining.
  (int passed, int left, int progress) get schedule {
    final start = boshlanish ?? createdAt;
    final total = muddat == 0 ? 30 : muddat;
    final passed = DateTime.now().difference(start).inDays.clamp(0, total * 10);
    final left = (total - passed).clamp(0, total);
    final progress = ((passed / total) * 100).round().clamp(0, 100);
    return (passed, left, progress);
  }
}
