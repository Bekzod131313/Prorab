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

  ObMember({
    required this.obId,
    required this.userId,
    required this.role,
    required this.ishaqi,
    required this.olingan,
    required this.kasb,
    required this.addedBy,
    required this.profile,
  });

  num get balance => ishaqi - olingan;

  factory ObMember.fromMap(Map<String, dynamic> row) {
    final profileRow = row['profiles'] as Map<String, dynamic>?;
    return ObMember(
      obId: row['ob_id'].toString(),
      userId: row['user_id'].toString(),
      role: row['role'] ?? 'member',
      ishaqi: (row['ishaqi'] as num?) ?? 0,
      olingan: (row['olingan'] as num?) ?? 0,
      kasb: row['kasb'],
      addedBy: row['added_by']?.toString(),
      profile: profileRow != null ? Profile.fromMap(profileRow) : null,
    );
  }

  String get displayName => profile?.displayName ?? '?';

  static const roleLabels = {
    'owner': 'Egasi',
    'member': 'Usta',
    'worker': 'Ishchi',
  };

  String get roleLabel => roleLabels[role] ?? role;
}
