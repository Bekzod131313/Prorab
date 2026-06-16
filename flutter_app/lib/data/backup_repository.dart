import 'dart:convert';

import '../main.dart';
import 'project_repository.dart';

class BackupRepository {
  Future<String> buildBackupJson() async {
    final projects = await ProjectRepository().loadProjects();
    final obIds = projects.map((p) => p.id).toList();

    List<dynamic> txs = [];
    List<dynamic> members = [];
    List<dynamic> tasks = [];
    List<dynamic> materials = [];

    if (obIds.isNotEmpty) {
      final results = await Future.wait([
        supabase.from('transactions').select('*').inFilter('ob_id', obIds),
        supabase.from('ob_members').select('ob_id,user_id,role,ishaqi,olingan,kasb').inFilter('ob_id', obIds),
        supabase.from('tasks').select('*').inFilter('ob_id', obIds),
        supabase.from('materials').select('*').inFilter('ob_id', obIds),
      ]);
      txs = results[0] as List;
      members = results[1] as List;
      tasks = results[2] as List;
      materials = results[3] as List;
    }

    final user = supabase.auth.currentUser;
    final backup = {
      'date': DateTime.now().toIso8601String(),
      'user': {'id': user?.id, 'phone': user?.phone, 'email': user?.email},
      'obs': projects
          .map((p) => {
                'id': p.id,
                'nomi': p.nomi,
                'kirim': p.kirim,
                'chiqim': p.chiqim,
                'boshlanish': p.boshlanish?.toIso8601String(),
                'muddat': p.muddat,
                'status': p.status,
                'role': p.role,
                'manzil': p.manzil,
                'mijoz': p.mijoz,
                'bosqich': p.bosqich,
              })
          .toList(),
      'transactions': txs,
      'members': members,
      'tasks': tasks,
      'materials': materials,
    };

    return const JsonEncoder.withIndent('  ').convert(backup);
  }
}
