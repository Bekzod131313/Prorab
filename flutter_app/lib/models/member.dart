import 'profile.dart';

class ObMember {
  final String obId;
  final String userId;
  final String role;
  final num ishaqi;
  final num olingan;
  final String? kasb;
  final String? addedBy;
  final Profile? profile;
  final DateTime? boshlanish;
  final DateTime? tugash;
  final num kirim;
  final num chiqim;
  final bool canViewOwnerTransactions;

  ObMember({
    required this.obId,
    required this.userId,
    required this.role,
    required this.ishaqi,
    required this.olingan,
    required this.kasb,
    required this.addedBy,
    required this.profile,
    this.boshlanish,
    this.tugash,
    this.kirim = 0,
    this.chiqim = 0,
    this.canViewOwnerTransactions = false,
  });

  num get balance => ishaqi - olingan;

  String get cleanRole => role.split(':')[0];
  bool get isOwner => cleanRole == 'owner';
  bool get isMember => cleanRole == 'member';
  bool get isWorker => cleanRole == 'worker';

  ObMember copyWith({
    String? obId,
    String? userId,
    String? role,
    num? ishaqi,
    num? olingan,
    String? kasb,
    String? addedBy,
    Profile? profile,
    DateTime? boshlanish,
    DateTime? tugash,
    num? kirim,
    num? chiqim,
    bool? canViewOwnerTransactions,
  }) {
    return ObMember(
      obId: obId ?? this.obId,
      userId: userId ?? this.userId,
      role: role ?? this.role,
      ishaqi: ishaqi ?? this.ishaqi,
      olingan: olingan ?? this.olingan,
      kasb: kasb ?? this.kasb,
      addedBy: addedBy ?? this.addedBy,
      profile: profile ?? this.profile,
      boshlanish: boshlanish ?? this.boshlanish,
      tugash: tugash ?? this.tugash,
      kirim: kirim ?? this.kirim,
      chiqim: chiqim ?? this.chiqim,
      canViewOwnerTransactions: canViewOwnerTransactions ?? this.canViewOwnerTransactions,
    );
  }

  factory ObMember.fromMap(Map<String, dynamic> row) {
    final profileRow = row['profiles'] as Map<String, dynamic>?;
    final roleStr = row['role']?.toString() ?? 'member';
    final kasbStr = row['kasb']?.toString() ?? '';
    final hasCanViewRole = roleStr.contains('can_view') || kasbStr.contains('can_view');
    final dbBool = (row['can_view_owner_transactions'] as bool?) ??
        (row['can_view_owner_tx'] as bool?) ??
        false;

    return ObMember(
      obId: row['ob_id'].toString(),
      userId: row['user_id'].toString(),
      role: roleStr,
      ishaqi: (row['ishaqi'] as num?) ?? 0,
      olingan: (row['olingan'] as num?) ?? 0,
      kasb: kasbStr.replaceAll(':can_view', ''),
      addedBy: row['added_by']?.toString(),
      profile: profileRow != null ? Profile.fromMap(profileRow) : null,
      boshlanish: row['boshlanish'] != null ? DateTime.tryParse(row['boshlanish']) : null,
      tugash: row['tugash'] != null ? DateTime.tryParse(row['tugash']) : null,
      kirim: (row['kirim'] as num?) ?? 0,
      chiqim: (row['chiqim'] as num?) ?? 0,
      canViewOwnerTransactions: hasCanViewRole || dbBool,
    );
  }

  String get displayName => profile?.displayName ?? '?';

  static const roleLabels = {
    'owner': 'Egasi',
    'member': 'Usta',
    'worker': 'Ishchi',
  };

  String get roleLabel => roleLabels[cleanRole] ?? cleanRole;
}
