import 'dart:typed_data';

import 'package:supabase_flutter/supabase_flutter.dart' show FileOptions, UserAttributes;

import '../main.dart';
import '../models/profile.dart';
import 'project_repository.dart';

class ProfileStats {
  final num totalBalance;
  final int obsCount;
  final int peopleCount;

  ProfileStats({required this.totalBalance, required this.obsCount, required this.peopleCount});
}

class ProfileRepository {
  Future<Profile?> loadCurrent() async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return null;
    final data = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (data == null) return null;
    return Profile.fromMap(data);
  }

  Future<Profile?> loadById(String id) async {
    final data = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    if (data == null) return null;
    return Profile.fromMap(data);
  }

  Future<void> updateFullName(String fullName) async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return;
    await supabase.from('profiles').upsert({
      'id': userId,
      'full_name': fullName,
    });
  }

  Future<void> updateProfile({required String fullName, required String phone, required int staj, String? kasb, String? avatarUrl}) async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return;
    final data = <String, dynamic>{
      'id': userId,
      'full_name': fullName,
      'phone': phone,
      'staj': staj,
    };
    if (kasb != null) data['kasb'] = kasb.isNotEmpty ? kasb : null;
    if (avatarUrl != null) data['avatar_url'] = avatarUrl;
    await supabase.from('profiles').upsert(data);
  }

  Future<String> uploadAvatar(String userId, Uint8List bytes) async {
    final ts = DateTime.now().millisecondsSinceEpoch;
    await supabase.storage.from('profile-images').uploadBinary(
      '$userId/avatar.jpg',
      bytes,
      fileOptions: FileOptions(contentType: 'image/jpeg', upsert: true),
    );
    return '${supabase.storage.from("profile-images").getPublicUrl("$userId/avatar.jpg")}?t=$ts';
  }

  Future<List<String>> loadPortfolio(String userId) async {
    try {
      final items = await supabase.storage.from('profile-portfolio').list(path: userId);
      return items
          .where((f) => f.name != '.emptyFolderPlaceholder')
          .map((f) => supabase.storage.from('profile-portfolio').getPublicUrl('$userId/${f.name}'))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<String> uploadPortfolioImage(String userId, Uint8List bytes) async {
    final ts = DateTime.now().millisecondsSinceEpoch;
    final path = '$userId/$ts.jpg';
    await supabase.storage.from('profile-portfolio').uploadBinary(
      path,
      bytes,
      fileOptions: FileOptions(contentType: 'image/jpeg', upsert: false),
    );
    return supabase.storage.from('profile-portfolio').getPublicUrl(path);
  }

  Future<void> deletePortfolioImage(String userId, String url) async {
    final uri = Uri.parse(url);
    final segments = uri.pathSegments;
    if (segments.isNotEmpty) {
      final fileName = segments.last.split('?').first;
      await supabase.storage.from('profile-portfolio').remove(['$userId/$fileName']);
    }
  }

  Future<void> updatePassword(String password) async {
    await supabase.auth.updateUser(UserAttributes(password: password));
  }

  Future<ProfileStats> loadStats() async {
    final userId = supabase.auth.currentUser?.id;
    final projects = await ProjectRepository().loadProjects();
    num totalBalance = 0;
    for (final p in projects) { totalBalance += p.balance; }
    final ownedIds = projects.where((p) => p.role == 'owner').map((p) => p.id).toList();
    int peopleCount = 0;
    if (ownedIds.isNotEmpty) {
      final members = await supabase.from('ob_members').select('user_id').inFilter('ob_id', ownedIds);
      final unique = <String>{};
      for (final row in members as List) { unique.add(row['user_id'].toString()); }
      unique.remove(userId);
      peopleCount = unique.length;
    }
    return ProfileStats(totalBalance: totalBalance, obsCount: projects.length, peopleCount: peopleCount);
  }
}
