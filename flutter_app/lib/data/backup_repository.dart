import 'dart:convert';

import '../main.dart';
import 'project_repository.dart';

class BackupRepository {
  Future<String> buildBackupJson() async {
    final projects = await ProjectRepository().loadProjects();
    final obIds = projects.map((p) => p.id).toList();

    List<dynamic> txs = [];
    if (obIds.isNotEmpty) {
      txs = await supabase.from('transactions').select('*').inFilter('ob_id', obIds);
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
              })
          .toList(),
      'transactions': txs,
    };

    return const JsonEncoder.withIndent('  ').convert(backup);
  }
}
