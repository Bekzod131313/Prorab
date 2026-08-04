import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/member.dart';
import '../models/project.dart';
import '../models/transaction.dart';

class ProjectCacheData {
  final Project project;
  final List<ProjectTransaction> txs;
  final List<ObMember> members;

  ProjectCacheData({
    required this.project,
    required this.txs,
    required this.members,
  });
}

class ProjectCacheRepository {
  static const String _keyPrefix = 'project_cache_v1_';

  Future<void> saveProjectCache({
    required Project project,
    required List<ProjectTransaction> txs,
    required List<ObMember> members,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();

      final projectMap = {
        'id': project.id,
        'nomi': project.nomi,
        'kirim': project.kirim,
        'chiqim': project.chiqim,
        'boshlanish': project.boshlanish?.toIso8601String(),
        'tugash': project.tugash?.toIso8601String(),
        'created_at': project.createdAt.toIso8601String(),
        'muddat': project.muddat,
        'role': project.role,
        'myBalance': project.myBalance,
        'ishaqi': project.ishaqi,
        'olingan': project.olingan,
        'status': project.status,
        'manzil': project.manzil,
        'mijoz': project.mijoz,
        'bosqich': project.bosqich,
        'image_url': project.imageUrl,
        'can_view_owner_transactions': project.canViewOwnerTransactions,
      };

      final txsList = txs
          .map((t) => {
                'id': t.id,
                'ob_id': t.obId,
                'tur': t.tur,
                'summa': t.summa,
                'izoh': t.izoh,
                'kategoriya': t.kategoriya,
                'to_user': t.toUser,
                'from_user': t.fromUser,
                'created_by': t.createdBy,
                'created_at': t.date.toIso8601String(),
                'tx_date': t.date.toIso8601String(),
                'currency': t.currency,
                'exchange_rate': t.exchangeRate,
                'summa_usd': t.summaUsd,
                'summa_uzs': t.summaUzs,
                'files': t.files,
              })
          .toList();

      final membersList = members
          .map((m) => {
                'ob_id': m.obId,
                'user_id': m.userId,
                'role': m.role,
                'ishaqi': m.ishaqi,
                'olingan': m.olingan,
                'kasb': m.kasb,
                'added_by': m.addedBy,
                'boshlanish': m.boshlanish?.toIso8601String(),
                'tugash': m.tugash?.toIso8601String(),
                'kirim': m.kirim,
                'chiqim': m.chiqim,
                'can_view_owner_transactions': m.canViewOwnerTransactions,
                'profiles': m.profile != null
                    ? {
                        'id': m.profile!.id,
                        'full_name': m.profile!.fullName,
                        'phone': m.profile!.phone,
                        'staj': m.profile!.staj,
                        'kasb': m.profile!.kasb,
                        'avatar_url': m.profile!.avatarUrl,
                      }
                    : null,
              })
          .toList();

      final jsonPayload = jsonEncode({
        'project': projectMap,
        'txs': txsList,
        'members': membersList,
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });

      await prefs.setString('$_keyPrefix${project.id}', jsonPayload);
    } catch (_) {
      // Ignore caching errors silently
    }
  }

  Future<ProjectCacheData?> loadProjectCache(String projectId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('$_keyPrefix$projectId');
      if (raw == null || raw.isEmpty) return null;

      final data = jsonDecode(raw) as Map<String, dynamic>;
      final pMap = data['project'] as Map<String, dynamic>;

      final project = Project(
        id: pMap['id'].toString(),
        nomi: pMap['nomi'] ?? '',
        kirim: (pMap['kirim'] as num?) ?? 0,
        chiqim: (pMap['chiqim'] as num?) ?? 0,
        boshlanish: pMap['boshlanish'] != null
            ? DateTime.tryParse(pMap['boshlanish'])
            : null,
        tugash:
            pMap['tugash'] != null ? DateTime.tryParse(pMap['tugash']) : null,
        createdAt:
            DateTime.tryParse(pMap['created_at'] ?? '') ?? DateTime.now(),
        muddat: (pMap['muddat'] as int?) ?? 30,
        role: pMap['role'] ?? 'member',
        myBalance: (pMap['myBalance'] as num?) ?? 0,
        ishaqi: (pMap['ishaqi'] as num?) ?? 0,
        olingan: (pMap['olingan'] as num?) ?? 0,
        status: pMap['status'] ?? 'active',
        manzil: pMap['manzil'] as String?,
        mijoz: pMap['mijoz'] as String?,
        bosqich: pMap['bosqich'] as String?,
        imageUrl: pMap['image_url'] as String?,
        canViewOwnerTransactions:
            (pMap['can_view_owner_transactions'] as bool?) ?? false,
      );

      final rawTxs = (data['txs'] as List<dynamic>?) ?? [];
      final txs = rawTxs
          .map((m) => ProjectTransaction.fromMap(Map<String, dynamic>.from(m)))
          .toList();

      final rawMembers = (data['members'] as List<dynamic>?) ?? [];
      final members = rawMembers
          .map((m) => ObMember.fromMap(Map<String, dynamic>.from(m)))
          .toList();

      return ProjectCacheData(
        project: project,
        txs: txs,
        members: members,
      );
    } catch (_) {
      return null;
    }
  }
}
