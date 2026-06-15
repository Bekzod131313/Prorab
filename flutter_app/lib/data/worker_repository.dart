import '../main.dart';
import '../models/profile.dart';
import '../models/worker.dart';

class WorkerRepository {
  Future<List<Worker>> loadAll() async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return [];

    final myObs = await supabase.from('ob_members').select('ob_id,ob:obyektlar(*)').eq('user_id', userId);

    final activeObs = (myObs as List)
        .where((row) => row['ob'] != null && (row['ob']['status'] ?? 'active') != 'done')
        .toList();
    if (activeObs.isEmpty) return [];

    final obIds = activeObs.map((row) => row['ob_id'].toString()).toList();
    final obNames = {
      for (final row in activeObs) row['ob_id'].toString(): (row['ob']['nomi'] ?? '') as String,
    };

    final members = await supabase
        .from('ob_members')
        .select('*,profiles(*)')
        .inFilter('ob_id', obIds)
        .neq('user_id', userId);

    final result = <String, Worker>{};
    for (final row in members as List) {
      final uid = row['user_id'].toString();
      final ishaqi = (row['ishaqi'] ?? 0) as num;
      final olingan = (row['olingan'] ?? 0) as num;
      final obId = row['ob_id'].toString();
      final obEntry = WorkerProject(obId: obId, obNomi: obNames[obId] ?? '', balans: ishaqi - olingan);

      final existing = result[uid];
      if (existing != null) {
        existing.ishaqi += ishaqi;
        existing.olingan += olingan;
        existing.obsList.add(obEntry);
      } else {
        final profileRow = row['profiles'] as Map<String, dynamic>?;
        result[uid] = Worker(
          userId: uid,
          profile: profileRow != null ? Profile.fromMap(profileRow) : null,
          kasb: row['kasb'],
          ishaqi: ishaqi,
          olingan: olingan,
          obsList: [obEntry],
        );
      }
    }

    return result.values.toList();
  }

  /// Records an advance ("avans") payment to a worker on a project; increases `olingan`.
  Future<void> giveAvans({required String obId, required String toUserId, required num amount, String? izoh}) async {
    final userId = supabase.auth.currentUser?.id;
    await supabase.from('transactions').insert({
      'ob_id': obId,
      'from_user': userId,
      'to_user': toUserId,
      'summa': amount,
      'tur': 'send',
      'kategoriya': 'usta',
      'izoh': izoh?.isNotEmpty == true ? izoh : 'Avans',
      'tx_date': DateTime.now().toIso8601String(),
    });

    final member = await supabase
        .from('ob_members')
        .select('olingan')
        .eq('ob_id', obId)
        .eq('user_id', toUserId)
        .maybeSingle();

    if (member != null) {
      await supabase
          .from('ob_members')
          .update({'olingan': (member['olingan'] ?? 0) + amount})
          .eq('ob_id', obId)
          .eq('user_id', toUserId);
    } else {
      await supabase.from('ob_members').insert({
        'ob_id': obId,
        'user_id': toUserId,
        'role': 'member',
        'ishaqi': 0,
        'olingan': amount,
        'balance': 0,
      });
    }
  }

  /// Records a wage ("ish haqi") entry for a worker on a project; increases `ishaqi`.
  Future<void> giveIshHaqi({required String obId, required String toUserId, required num amount, String? izoh}) async {
    final userId = supabase.auth.currentUser?.id;
    await supabase.from('transactions').insert({
      'ob_id': obId,
      'from_user': userId,
      'to_user': toUserId,
      'summa': amount,
      'tur': 'ishhaqi',
      'kategoriya': 'usta',
      'izoh': izoh?.isNotEmpty == true ? izoh : 'Ish haqi',
      'tx_date': DateTime.now().toIso8601String(),
    });

    final member = await supabase
        .from('ob_members')
        .select('ishaqi')
        .eq('ob_id', obId)
        .eq('user_id', toUserId)
        .maybeSingle();

    if (member != null) {
      await supabase
          .from('ob_members')
          .update({'ishaqi': (member['ishaqi'] ?? 0) + amount})
          .eq('ob_id', obId)
          .eq('user_id', toUserId);
    } else {
      await supabase.from('ob_members').insert({
        'ob_id': obId,
        'user_id': toUserId,
        'role': 'member',
        'ishaqi': amount,
        'olingan': 0,
        'balance': 0,
      });
    }
  }
}
