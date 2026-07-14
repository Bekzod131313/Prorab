import '../main.dart';
import '../models/transaction.dart';
import '../services/currency_service.dart';

class TransactionRepository {
  Future<List<ProjectTransaction>> loadForProject(String obId, {String? createdBy}) async {
    var query = supabase
        .from('transactions')
        .select('*')
        .eq('ob_id', obId);
    if (createdBy != null) {
      query = query.eq('created_by', createdBy);
    }
    final data = await query.order('tx_date', ascending: false);

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
    String currency = 'UZS',
  }) async {
    final userId = supabase.auth.currentUser?.id;
    final txDate0 = (txDate ?? DateTime.now()).toIso8601String();
    final liveRate = CurrencyService().usdToUzsRate;
    final converted = CurrencyService().convert(amount.toDouble(), currency);
    final amountUzs = converted['UZS']!;
    final amountUsd = converted['USD']!;

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
        'currency': currency,
        'exchange_rate': liveRate,
        'summa_usd': amountUsd,
        'summa_uzs': amountUzs,
        'created_by': userId,
      });

      if (userId != null) {
        final member = await supabase
            .from('ob_members')
            .select('kirim, role')
            .eq('ob_id', obId)
            .eq('user_id', userId)
            .maybeSingle();
        if (member != null) {
          await supabase
              .from('ob_members')
              .update({'kirim': ((member['kirim'] as num?) ?? 0) + amountUzs})
              .eq('ob_id', obId)
              .eq('user_id', userId);

          if (member['role'] == 'owner') {
            final ob = await supabase
                .from('obyektlar')
                .select('kirim')
                .eq('id', obId)
                .single();
            await supabase
                .from('obyektlar')
                .update({'kirim': (ob['kirim'] ?? 0) + amountUzs}).eq('id', obId);
          }
        }
      }
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
        'currency': currency,
        'exchange_rate': liveRate,
        'summa_usd': amountUsd,
        'summa_uzs': amountUzs,
        'created_by': userId,
      });

      if (userId != null) {
        final member = await supabase
            .from('ob_members')
            .select('chiqim, role')
            .eq('ob_id', obId)
            .eq('user_id', userId)
            .maybeSingle();
        if (member != null) {
          await supabase
              .from('ob_members')
              .update({'chiqim': ((member['chiqim'] as num?) ?? 0) + amountUzs})
              .eq('ob_id', obId)
              .eq('user_id', userId);

          if (member['role'] == 'owner') {
            final ob = await supabase
                .from('obyektlar')
                .select('chiqim')
                .eq('id', obId)
                .single();
            await supabase
                .from('obyektlar')
                .update({'chiqim': (ob['chiqim'] ?? 0) + amountUzs}).eq('id', obId);
          }
        }
      }

      if (toUserId != null) {
        final toMember = await supabase
            .from('ob_members')
            .select('olingan, kirim')
            .eq('ob_id', obId)
            .eq('user_id', toUserId)
            .maybeSingle();
        if (toMember != null) {
          await supabase
              .from('ob_members')
              .update({
                'olingan': ((toMember['olingan'] as num?) ?? 0) + amountUzs,
                'kirim': ((toMember['kirim'] as num?) ?? 0) + amountUzs,
              })
              .eq('ob_id', obId)
              .eq('user_id', toUserId);
        }
      }
    }
  }

  /// A member (usta) gives part of the money already paid to them to one of
  /// their own sub-workers on the project. Does not touch obyektlar
  /// kirim/chiqim since that amount was already recorded as an expense when
  /// the owner originally paid the member.
  Future<void> distributeToSubWorker({
    required String obId,
    required String toUserId,
    required num amount,
    String? izoh,
    DateTime? txDate,
    String currency = 'UZS',
  }) async {
    final userId = supabase.auth.currentUser?.id;
    final liveRate = CurrencyService().usdToUzsRate;
    final converted = CurrencyService().convert(amount.toDouble(), currency);
    final amountUzs = converted['UZS']!;
    final amountUsd = converted['USD']!;

    await supabase.from('transactions').insert({
      'ob_id': obId,
      'from_user': userId,
      'to_user': toUserId,
      'summa': amount,
      'tur': 'send',
      'kategoriya': 'usta',
      'izoh': izoh,
      'tx_date': (txDate ?? DateTime.now()).toIso8601String(),
      'currency': currency,
      'exchange_rate': liveRate,
      'summa_usd': amountUsd,
      'summa_uzs': amountUzs,
      'created_by': userId,
    });

    if (userId != null) {
      final fromMem = await supabase
          .from('ob_members')
          .select('chiqim')
          .eq('ob_id', obId)
          .eq('user_id', userId)
          .maybeSingle();
      if (fromMem != null) {
        await supabase
            .from('ob_members')
            .update({'chiqim': ((fromMem['chiqim'] as num?) ?? 0) + amountUzs})
            .eq('ob_id', obId)
            .eq('user_id', userId);
      }
    }

    final toMem = await supabase
        .from('ob_members')
        .select('olingan, kirim')
        .eq('ob_id', obId)
        .eq('user_id', toUserId)
        .maybeSingle();
    if (toMem != null) {
      await supabase
          .from('ob_members')
          .update({
            'olingan': ((toMem['olingan'] as num?) ?? 0) + amountUzs,
            'kirim': ((toMem['kirim'] as num?) ?? 0) + amountUzs,
          })
          .eq('ob_id', obId)
          .eq('user_id', toUserId);
    }
  }

  /// A member (usta) withdraws part of their own already-received money for
  /// themselves; purely a record for their own history, no balance fields
  /// change since it was already accounted for when the owner paid them.
  Future<void> logSelfWithdrawal({
    required String obId,
    required num amount,
    String kategoriya = "O'zim uchun",
    String? izoh,
    DateTime? txDate,
    String currency = 'UZS',
  }) async {
    final userId = supabase.auth.currentUser?.id;
    final liveRate = CurrencyService().usdToUzsRate;
    final converted = CurrencyService().convert(amount.toDouble(), currency);
    final amountUzs = converted['UZS']!;
    final amountUsd = converted['USD']!;

    await supabase.from('transactions').insert({
      'ob_id': obId,
      'from_user': userId,
      'to_user': userId,
      'summa': amount,
      'tur': 'send',
      'kategoriya': kategoriya,
      'izoh': izoh,
      'tx_date': (txDate ?? DateTime.now()).toIso8601String(),
      'currency': currency,
      'exchange_rate': liveRate,
      'summa_usd': amountUsd,
      'summa_uzs': amountUzs,
      'created_by': userId,
    });

    if (userId != null) {
      final mem = await supabase
          .from('ob_members')
          .select('chiqim')
          .eq('ob_id', obId)
          .eq('user_id', userId)
          .maybeSingle();
      if (mem != null) {
        await supabase
            .from('ob_members')
            .update({'chiqim': ((mem['chiqim'] as num?) ?? 0) + amountUzs})
            .eq('ob_id', obId)
            .eq('user_id', userId);
      }
    }
  }

  Future<List<ProjectTransaction>> loadRecentForProjects(List<String> obIds,
      {int limit = 6}) async {
    if (obIds.isEmpty) return [];
    final userId = supabase.auth.currentUser?.id;
    var query = supabase
        .from('transactions')
        .select('*')
        .inFilter('ob_id', obIds);
    if (userId != null) {
      query = query.eq('created_by', userId);
    }
    final data = await query
        .order('tx_date', ascending: false)
        .limit(limit);

    return (data as List)
        .map((row) => ProjectTransaction.fromMap(row as Map<String, dynamic>))
        .toList();
  }

  Future<void> updateTransactionNote(String id,
      {String? izoh, required DateTime txDate}) async {
    await supabase.from('transactions').update({
      'izoh': izoh?.isNotEmpty == true ? izoh : null,
      'tx_date': txDate.toIso8601String(),
    }).eq('id', id);
  }

  Future<void> deleteTransaction(String id) async {
    final row =
        await supabase.from('transactions').select('*').eq('id', id).single();
    final tx = ProjectTransaction.fromMap(row);

    await supabase.from('transactions').delete().eq('id', id);

    if (tx.tur == 'income') {
      final ob = await supabase
          .from('obyektlar')
          .select('kirim')
          .eq('id', tx.obId)
          .single();
      final newVal = ((ob['kirim'] as num?) ?? 0) - tx.summa;
      await supabase
          .from('obyektlar')
          .update({'kirim': newVal < 0 ? 0 : newVal}).eq('id', tx.obId);

      if (tx.toUser != null) {
        final mem = await supabase
            .from('ob_members')
            .select('kirim')
            .eq('ob_id', tx.obId)
            .eq('user_id', tx.toUser!)
            .maybeSingle();
        if (mem != null) {
          final newK = ((mem['kirim'] as num?) ?? 0) - tx.summa;
          await supabase
              .from('ob_members')
              .update({'kirim': newK < 0 ? 0 : newK})
              .eq('ob_id', tx.obId)
              .eq('user_id', tx.toUser!);
        }
      }
    } else if (tx.tur == 'spend') {
      final ob = await supabase
          .from('obyektlar')
          .select('chiqim')
          .eq('id', tx.obId)
          .single();
      final newVal = ((ob['chiqim'] as num?) ?? 0) - tx.summa;
      await supabase
          .from('obyektlar')
          .update({'chiqim': newVal < 0 ? 0 : newVal}).eq('id', tx.obId);

      if (tx.fromUser != null) {
        final mem = await supabase
            .from('ob_members')
            .select('chiqim')
            .eq('ob_id', tx.obId)
            .eq('user_id', tx.fromUser!)
            .maybeSingle();
        if (mem != null) {
          final newC = ((mem['chiqim'] as num?) ?? 0) - tx.summa;
          await supabase
              .from('ob_members')
              .update({'chiqim': newC < 0 ? 0 : newC})
              .eq('ob_id', tx.obId)
              .eq('user_id', tx.fromUser!);
        }
      }

      if (tx.toUser != null) {
        final mem = await supabase
            .from('ob_members')
            .select('olingan, kirim')
            .eq('ob_id', tx.obId)
            .eq('user_id', tx.toUser!)
            .maybeSingle();
        if (mem != null) {
          final newO = ((mem['olingan'] as num?) ?? 0) - tx.summa;
          final newK = ((mem['kirim'] as num?) ?? 0) - tx.summa;
          await supabase
              .from('ob_members')
              .update({
                'olingan': newO < 0 ? 0 : newO,
                'kirim': newK < 0 ? 0 : newK,
              })
              .eq('ob_id', tx.obId)
              .eq('user_id', tx.toUser!);
        }
      }
    } else if (tx.tur == 'send') {
      if (tx.fromUser != null) {
        final mem = await supabase
            .from('ob_members')
            .select('chiqim')
            .eq('ob_id', tx.obId)
            .eq('user_id', tx.fromUser!)
            .maybeSingle();
        if (mem != null) {
          final newC = ((mem['chiqim'] as num?) ?? 0) - tx.summa;
          await supabase
              .from('ob_members')
              .update({'chiqim': newC < 0 ? 0 : newC})
              .eq('ob_id', tx.obId)
              .eq('user_id', tx.fromUser!);
        }
      }

      if (tx.toUser != null && tx.toUser != tx.fromUser) {
        final mem = await supabase
            .from('ob_members')
            .select('olingan, kirim')
            .eq('ob_id', tx.obId)
            .eq('user_id', tx.toUser!)
            .maybeSingle();
        if (mem != null) {
          final newO = ((mem['olingan'] as num?) ?? 0) - tx.summa;
          final newK = ((mem['kirim'] as num?) ?? 0) - tx.summa;
          await supabase
              .from('ob_members')
              .update({
                'olingan': newO < 0 ? 0 : newO,
                'kirim': newK < 0 ? 0 : newK,
              })
              .eq('ob_id', tx.obId)
              .eq('user_id', tx.toUser!);
        }
      }
    } else if (tx.tur == 'ishhaqi') {
      if (tx.toUser != null) {
        final mem = await supabase
            .from('ob_members')
            .select('ishaqi, kirim')
            .eq('ob_id', tx.obId)
            .eq('user_id', tx.toUser!)
            .maybeSingle();
        if (mem != null) {
          final newI = ((mem['ishaqi'] as num?) ?? 0) - tx.summa;
          final newK = ((mem['kirim'] as num?) ?? 0) - tx.summa;
          await supabase
              .from('ob_members')
              .update({
                'ishaqi': newI < 0 ? 0 : newI,
                'kirim': newK < 0 ? 0 : newK,
              })
              .eq('ob_id', tx.obId)
              .eq('user_id', tx.toUser!);
        }
      }
    }
  }
}
