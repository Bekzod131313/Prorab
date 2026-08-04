import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/profile.dart';
import '../models/transaction.dart';
import '../models/worker.dart';

class WorkerCacheData {
  final Worker worker;
  final List<ProjectTransaction> payments;

  WorkerCacheData({
    required this.worker,
    required this.payments,
  });
}

class WorkerCacheRepository {
  static const String _keyPrefix = 'worker_cache_v1_';

  Future<void> saveWorkerCache({
    required Worker worker,
    required List<ProjectTransaction> payments,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();

      final workerMap = {
        'user_id': worker.userId,
        'kasb': worker.kasb,
        'ishaqi': worker.ishaqi,
        'olingan': worker.olingan,
        'last_active': worker.lastActive?.toIso8601String(),
        'is_added_by_other': worker.isAddedByOther,
        'obs_list': worker.obsList.map((ob) => {
          'ob_id': ob.obId,
          'ob_nomi': ob.obNomi,
          'balans': ob.balans,
        }).toList(),
        'profile': worker.profile != null ? {
          'id': worker.profile!.id,
          'full_name': worker.profile!.fullName,
          'phone': worker.profile!.phone,
          'staj': worker.profile!.staj,
          'kasb': worker.profile!.kasb,
          'avatar_url': worker.profile!.avatarUrl,
        } : null,
      };

      final paymentsList = payments.map((t) => {
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
      }).toList();

      final jsonPayload = jsonEncode({
        'worker': workerMap,
        'payments': paymentsList,
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });

      await prefs.setString('$_keyPrefix${worker.userId}', jsonPayload);
    } catch (_) {
      // Ignore cache errors
    }
  }

  Future<WorkerCacheData?> loadWorkerCache(String workerUserId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('$_keyPrefix$workerUserId');
      if (raw == null || raw.isEmpty) return null;

      final data = jsonDecode(raw) as Map<String, dynamic>;
      final wMap = data['worker'] as Map<String, dynamic>;

      final rawObs = (wMap['obs_list'] as List<dynamic>?) ?? [];
      final obsList = rawObs.map((o) => WorkerProject(
        obId: o['ob_id'].toString(),
        obNomi: o['ob_nomi'] ?? '',
        balans: (o['balans'] as num?) ?? 0,
      )).toList();

      final profileMap = wMap['profile'] as Map<String, dynamic>?;
      final profile = profileMap != null ? Profile.fromMap(profileMap) : null;

      final worker = Worker(
        userId: wMap['user_id'].toString(),
        profile: profile,
        kasb: wMap['kasb'] as String?,
        ishaqi: (wMap['ishaqi'] as num?) ?? 0,
        olingan: (wMap['olingan'] as num?) ?? 0,
        obsList: obsList,
        lastActive: wMap['last_active'] != null ? DateTime.tryParse(wMap['last_active']) : null,
        isAddedByOther: (wMap['is_added_by_other'] as bool?) ?? false,
      );

      final rawPayments = (data['payments'] as List<dynamic>?) ?? [];
      final payments = rawPayments.map((p) => ProjectTransaction.fromMap(Map<String, dynamic>.from(p))).toList();

      return WorkerCacheData(
        worker: worker,
        payments: payments,
      );
    } catch (_) {
      return null;
    }
  }
}
