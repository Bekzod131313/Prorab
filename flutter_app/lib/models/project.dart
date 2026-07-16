class Project {
  final String id;
  final String nomi;
  final num kirim;
  final num chiqim;
  final DateTime? boshlanish;
  final DateTime? tugash;
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
  final String? imageUrl;

  Project({
    required this.id,
    required this.nomi,
    required this.kirim,
    required this.chiqim,
    required this.boshlanish,
    this.tugash,
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
    this.imageUrl,
  });

  num get balance => kirim - chiqim;

  factory Project.fromMember(Map<String, dynamic> row) {
    final ob = row['ob'] as Map<String, dynamic>;
    final role = row['role'] ?? 'member';

    final memberBoshlanish =
        row['boshlanish'] != null ? DateTime.tryParse(row['boshlanish']) : null;
    final memberTugash =
        row['tugash'] != null ? DateTime.tryParse(row['tugash']) : null;

    final start = (role == 'owner' ? null : memberBoshlanish) ??
        (ob['boshlanish'] != null ? DateTime.tryParse(ob['boshlanish']) : null);
    final end = (role == 'owner' ? null : memberTugash) ??
        (ob['tugash'] != null ? DateTime.tryParse(ob['tugash']) : null);

    int calcMuddat = ob['muddat'] ?? 30;
    if (start != null && end != null) {
      calcMuddat = end.difference(start).inDays;
      if (calcMuddat <= 0) calcMuddat = 30;
    }

    return Project(
      id: ob['id'].toString(),
      nomi: ob['nomi'] ?? '',
      kirim: role == 'owner' ? (ob['kirim'] ?? 0) : ((row['kirim'] as num?) ?? 0),
      chiqim: role == 'owner' ? (ob['chiqim'] ?? 0) : ((row['chiqim'] as num?) ?? 0),
      boshlanish: start,
      tugash: end,
      createdAt: DateTime.tryParse(ob['created_at'] ?? '') ?? DateTime.now(),
      muddat: calcMuddat,
      role: role,
      myBalance: row['balance'] ?? 0,
      ishaqi: row['ishaqi'] ?? 0,
      olingan: row['olingan'] ?? 0,
      status: ob['status'] ?? 'active',
      manzil: ob['manzil'] as String?,
      mijoz: ob['mijoz'] as String?,
      bosqich: ob['bosqich'] as String?,
      imageUrl: ob['image_url'] as String?,
    );
  }

  Project copyWith({String? imageUrl}) {
    return Project(
      id: id,
      nomi: nomi,
      kirim: kirim,
      chiqim: chiqim,
      boshlanish: boshlanish,
      tugash: tugash,
      createdAt: createdAt,
      muddat: muddat,
      role: role,
      myBalance: myBalance,
      ishaqi: ishaqi,
      olingan: olingan,
      status: status,
      manzil: manzil,
      mijoz: mijoz,
      bosqich: bosqich,
      imageUrl: imageUrl ?? this.imageUrl,
    );
  }

  /// 0-100 health score based on financial and timeline status.
  int get healthScore {
    if (role != 'owner') return 100;
    int score = 100;
    // Financial: penalize if negative balance
    if (kirim > 0) {
      final roi = (kirim - chiqim) / kirim;
      if (roi < 0)
        score -= 40;
      else if (roi < 0.1)
        score -= 20;
      else if (roi < 0.2) score -= 10;
    }
    // Timeline: penalize if overdue
    final (_, left, _) = schedule;
    if (left == 0)
      score -= 30;
    else if (left <= 3) score -= 15;
    return score.clamp(0, 100);
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

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Project && runtimeType == other.runtimeType && id == other.id;

  @override
  int get hashCode => id.hashCode;
}
