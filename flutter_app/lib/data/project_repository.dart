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
}
