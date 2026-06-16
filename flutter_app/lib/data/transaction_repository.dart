import '../main.dart';
import '../models/transaction.dart';

class TransactionRepository {
  Future<List<ProjectTransaction>> loadForProject(String obId) async {
    final data = await supabase
        .from('transactions')
        .select('*')
        .eq('ob_id', obId)
        .order('created_at', ascending: false);

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

  Future<void> deleteTransaction(String id) async {
    await supabase.from('transactions').delete().eq('id', id);
  }
}
