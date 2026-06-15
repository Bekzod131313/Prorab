import '../main.dart';
import '../models/project.dart';

class ProjectRepository {
  Future<List<Project>> loadProjects() async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return [];

    final data = await supabase
        .from('ob_members')
        .select('ob_id,role,balance,ishaqi,olingan,ob:obyektlar(*)')
        .eq('user_id', userId);

    return (data as List)
        .where((row) => row['ob'] != null)
        .map((row) => Project.fromMember(row as Map<String, dynamic>))
        .toList();
  }

  Future<void> createProject({
    required String nomi,
    required DateTime boshlanish,
    required int muddat,
  }) async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return;

    final ob = await supabase
        .from('obyektlar')
        .insert({
          'nomi': nomi,
          'owner_id': userId,
          'boshlanish': boshlanish.toIso8601String().substring(0, 10),
          'muddat': muddat,
          'kirim': 0,
          'chiqim': 0,
          'status': 'active',
        })
        .select()
        .single();

    await supabase.from('ob_members').insert({
      'ob_id': ob['id'],
      'user_id': userId,
      'role': 'owner',
      'balance': 0,
      'ishaqi': 0,
      'olingan': 0,
    });
  }
}
