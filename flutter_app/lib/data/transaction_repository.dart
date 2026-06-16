import '../main.dart';
import '../models/transaction.dart';

class TransactionRepository {
  Future<List<ProjectTransaction>> loadForProject(String obId) async {
    final data = await supabase
        .from('transactions')
        .select('*')
        .eq('ob_id', obId)
        .order('tx_date', ascending: false);

    return (data as List)
        .map((row) => ProjectTransaction.fromMap(row as Map<String, dynamic>))
        .toList();
  }

  /// Adds an income or expense transaction and updates the project totals.
  /// If [toUserId] is set for an expense, the worker's `olingan` is increased.
  Future<void> addTransaction({
    required String obId,
    required bool isIncome,
    required num amount,
    required String kategoriya,
    String? izoh,
    String? toUserId,
    DateTime? txDate,
  }) async {
    final userId = supabase.auth.currentUser?.id;
    final txDate0 = (txDate ?? DateTime.now()).toIso8601String();

    if (isIncome) {
      await supabase.from('transactions').insert({
        'ob_id': obId,
        'from_user': null,
        'to_user': userId,
        'summa': amount,
        'tur': 'income',
        'kategoriya': kategoriya,
        'izoh': izoh,
        'tx_date': txDate0,
      });

      final ob = await supabase.from('obyektlar').select('kirim').eq('id', obId).single();
      await supabase.from('obyektlar').update({'kirim': (ob['kirim'] ?? 0) + amount}).eq('id', obId);
    } else {
      await supabase.from('transactions').insert({
        'ob_id': obId,
        'from_user': userId,
        'to_user': toUserId,
        'summa': amount,
        'tur': 'spend',
        'kategoriya': kategoriya,
        'izoh': izoh,
        'tx_date': txDate0,
      });

      if (toUserId != null) {
        final member = await supabase
            .from('ob_members')
            .select('olingan')
            .eq('ob_id', obId)
            .eq('user_id', toUserId)
            .single();
        await supabase
            .from('ob_members')
            .update({'olingan': (member['olingan'] ?? 0) + amount})
            .eq('ob_id', obId)
            .eq('user_id', toUserId);
      }

      final ob = await supabase.from('obyektlar').select('chiqim').eq('id', obId).single();
      await supabase.from('obyektlar').update({'chiqim': (ob['chiqim'] ?? 0) + amount}).eq('id', obId);
    }
  }

  Future<List<ProjectTransaction>> loadRecentForProjects(List<String> obIds, {int limit = 6}) async {
    if (obIds.isEmpty) return [];
    final data = await supabase
        .from('transactions')
        .select('*')
        .inFilter('ob_id', obIds)
        .order('tx_date', ascending: false)
        .limit(limit);

    return (data as List)
        .map((row) => ProjectTransaction.fromMap(row as Map<String, dynamic>))
        .toList();
  }

  Future<void> updateTransactionNote(String id, {String? izoh, required DateTime txDate}) async {
    await supabase.from('transactions').update({
      'izoh': izoh?.isNotEmpty == true ? izoh : null,
      'tx_date': txDate.toIso8601String(),
    }).eq('id', id);
  }

  Future<void> deleteTransaction(String id) async {
    final row = await supabase.from('transactions').select('*').eq('id', id).single();
    final tx = ProjectTransaction.fromMap(row as Map<String, dynamic>);

    await supabase.from('transactions').delete().eq('id', id);

    if (tx.tur == 'income') {
      final ob = await supabase.from('obyektlar').select('kirim').eq('id', tx.obId).single();
      final newVal = ((ob['kirim'] as num?) ?? 0) - tx.summa;
      await supabase.from('obyektlar').update({'kirim': newVal < 0 ? 0 : newVal}).eq('id', tx.obId);
    } else if (tx.tur == 'spend') {
      final ob = await supabase.from('obyektlar').select('chiqim').eq('id', tx.obId).single();
      final newVal = ((ob['chiqim'] as num?) ?? 0) - tx.summa;
      await supabase.from('obyektlar').update({'chiqim': newVal < 0 ? 0 : newVal}).eq('id', tx.obId);

      if (tx.toUser != null) {
        final mem = await supabase
            .from('ob_members')
            .select('olingan')
            .eq('ob_id', tx.obId)
            .eq('user_id', tx.toUser!)
            .maybeSingle();
        if (mem != null) {
          final newO = ((mem['olingan'] as num?) ?? 0) - tx.summa;
          await supabase
              .from('ob_members')
              .update({'olingan': newO < 0 ? 0 : newO})
              .eq('ob_id', tx.obId)
              .eq('user_id', tx.toUser!);
        }
      }
    } else if (tx.tur == 'send') {
      if (tx.toUser != null) {
        final mem = await supabase
            .from('ob_members')
            .select('olingan')
            .eq('ob_id', tx.obId)
            .eq('user_id', tx.toUser!)
            .maybeSingle();
        if (mem != null) {
          final newO = ((mem['olingan'] as num?) ?? 0) - tx.summa;
          await supabase
              .from('ob_members')
              .update({'olingan': newO < 0 ? 0 : newO})
              .eq('ob_id', tx.obId)
              .eq('user_id', tx.toUser!);
        }
      }
    } else if (tx.tur == 'ishhaqi') {
      if (tx.toUser != null) {
        final mem = await supabase
            .from('ob_members')
            .select('ishaqi')
            .eq('ob_id', tx.obId)
            .eq('user_id', tx.toUser!)
            .maybeSingle();
        if (mem != null) {
          final newI = ((mem['ishaqi'] as num?) ?? 0) - tx.summa;
          await supabase
              .from('ob_members')
              .update({'ishaqi': newI < 0 ? 0 : newI})
              .eq('ob_id', tx.obId)
              .eq('user_id', tx.toUser!);
        }
      }
    }
  }
}
