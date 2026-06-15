import 'package:supabase_flutter/supabase_flutter.dart';

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

  Future<void> updateFullName(String fullName) async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return;
    await supabase.from('profiles').update({'full_name': fullName}).eq('id', userId);
  }

  Future<void> updateProfile({required String fullName, required String phone, required int staj}) async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return;
    await supabase.from('profiles').update({
      'full_name': fullName,
      'phone': phone,
      'staj': staj,
    }).eq('id', userId);
  }

  Future<void> updatePassword(String password) async {
    await supabase.auth.updateUser(UserAttributes(password: password));
  }

  Future<ProfileStats> loadStats() async {
    final userId = supabase.auth.currentUser?.id;
    final projects = await ProjectRepository().loadProjects();

    num totalBalance = 0;
    for (final p in projects) {
      totalBalance += p.balance;
    }

    final ownedIds = projects.where((p) => p.role == 'owner').map((p) => p.id).toList();
    int peopleCount = 0;
    if (ownedIds.isNotEmpty) {
      final members = await supabase.from('ob_members').select('user_id').inFilter('ob_id', ownedIds);
      final unique = <String>{};
      for (final row in members as List) {
        unique.add(row['user_id'].toString());
      }
      unique.remove(userId);
      peopleCount = unique.length;
    }

    return ProfileStats(totalBalance: totalBalance, obsCount: projects.length, peopleCount: peopleCount);
  }
}
