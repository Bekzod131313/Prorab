import '../main.dart';
import '../models/project.dart';
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

  Future<void> updateTask(String id, {required String nomi, DateTime? muddat, bool clearMuddat = false}) async {
    await supabase.from('tasks').update({
      'nomi': nomi,
      'muddat': clearMuddat ? null : muddat?.toIso8601String().substring(0, 10),
    }).eq('id', id);
  }

  Future<void> deleteTask(String id) async {
    await supabase.from('tasks').delete().eq('id', id);
  }

  Future<List<UpcomingTask>> loadUpcoming(List<Project> projects) async {
    final obIds = projects.map((p) => p.id).toList();
    if (obIds.isEmpty) return [];
    final cutoff = DateTime.now().add(const Duration(days: 7)).toIso8601String().substring(0, 10);
    final data = await supabase
        .from('tasks')
        .select('*')
        .inFilter('ob_id', obIds)
        .neq('holat', 'done')
        .lte('muddat', cutoff)
        .order('muddat', ascending: true)
        .limit(10);
    final obNames = {for (final p in projects) p.id: p.nomi};
    return (data as List).map((row) {
      final task = ObTask.fromMap(row as Map<String, dynamic>);
      return UpcomingTask(task: task, obNomi: obNames[task.obId] ?? '');
    }).where((t) => t.task.muddat != null).toList();
  }
}

class UpcomingTask {
  final ObTask task;
  final String obNomi;
  UpcomingTask({required this.task, required this.obNomi});
}
