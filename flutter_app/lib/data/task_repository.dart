import '../main.dart';
import '../models/task.dart';

class TaskRepository {
  Future<List<ObTask>> loadForProject(String obId) async {
    final data = await supabase
        .from('tasks')
        .select('*')
        .eq('ob_id', obId)
        .order('created_at', ascending: false);

    return (data as List).map((row) => ObTask.fromMap(row as Map<String, dynamic>)).toList();
  }

  Future<void> addTask(String obId, String nomi, {DateTime? muddat}) async {
    final userId = supabase.auth.currentUser?.id;
    await supabase.from('tasks').insert({
      'ob_id': obId,
      'nomi': nomi,
      'holat': 'todo',
      'created_by': userId,
      if (muddat != null) 'muddat': muddat.toIso8601String().substring(0, 10),
    });
  }

  Future<void> toggleTask(String id, String currentStatus) async {
    final next = ObTask.nextStatus[currentStatus] ?? 'todo';
    await supabase.from('tasks').update({'holat': next}).eq('id', id);
  }

  Future<void> deleteTask(String id) async {
    await supabase.from('tasks').delete().eq('id', id);
  }
}
