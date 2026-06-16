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
    String? manzil,
    String? mijoz,
    String? bosqich,
  }) async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return;

    final base = {
      'nomi': nomi,
      'owner_id': userId,
      'boshlanish': boshlanish.toIso8601String().substring(0, 10),
      'muddat': muddat,
      'kirim': 0,
      'chiqim': 0,
      'status': 'active',
    };
    final full = {
      ...base,
      'manzil': manzil?.isNotEmpty == true ? manzil : null,
      'mijoz': mijoz?.isNotEmpty == true ? mijoz : null,
      'bosqich': bosqich?.isNotEmpty == true ? bosqich : null,
    };

    Map<String, dynamic> ob;
    try {
      ob = await supabase.from('obyektlar').insert(full).select().single();
    } catch (_) {
      ob = await supabase.from('obyektlar').insert(base).select().single();
    }

    await supabase.from('ob_members').insert({
      'ob_id': ob['id'],
      'user_id': userId,
      'role': 'owner',
      'balance': 0,
      'ishaqi': 0,
      'olingan': 0,
    });
  }

  Future<void> updateProject({
    required String id,
    required String nomi,
    required DateTime boshlanish,
    required int muddat,
    String? manzil,
    String? mijoz,
    String? bosqich,
  }) async {
    await supabase.from('obyektlar').update({
      'nomi': nomi,
      'boshlanish': boshlanish.toIso8601String().substring(0, 10),
      'muddat': muddat,
      'manzil': manzil?.isNotEmpty == true ? manzil : null,
      'mijoz': mijoz?.isNotEmpty == true ? mijoz : null,
      'bosqich': bosqich?.isNotEmpty == true ? bosqich : null,
    }).eq('id', id);
  }

  Future<void> setStatus(String id, String status) async {
    await supabase.from('obyektlar').update({'status': status}).eq('id', id);
  }

  Future<void> setBosqich(String id, String? bosqich) async {
    await supabase.from('obyektlar').update({'bosqich': bosqich}).eq('id', id);
  }

  Future<void> deleteProject(String id) async {
    await supabase.from('obyektlar').delete().eq('id', id);
  }

  Future<void> updateImage(String obId, String imageUrl) async {
    await supabase.from('ob').update({'image_url': imageUrl}).eq('id', obId);
  }

  Future<Project?> loadProjectById(String id) async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return null;
    final row = await supabase
        .from('ob_members')
        .select('ob_id,role,balance,ishaqi,olingan,ob:obyektlar(*)')
        .eq('user_id', userId)
        .eq('ob_id', id)
        .maybeSingle();
    if (row == null || row['ob'] == null) return null;
    return Project.fromMember(row as Map<String, dynamic>);
  }
}
