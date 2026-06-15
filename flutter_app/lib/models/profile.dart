class Profile {
  final String id;
  final String fullName;
  final String phone;

  Profile({required this.id, required this.fullName, required this.phone});

  factory Profile.fromMap(Map<String, dynamic> row) {
    return Profile(
      id: row['id'].toString(),
      fullName: row['full_name'] ?? '',
      phone: row['phone'] ?? '',
    );
  }

  String get displayName => fullName.isNotEmpty ? fullName : (phone.isNotEmpty ? phone : 'Foydalanuvchi');
  String get initial => displayName.isNotEmpty ? displayName[0].toUpperCase() : 'U';
}
