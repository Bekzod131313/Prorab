import '../main.dart';
import '../models/profile.dart';
import '../models/worker.dart';
import '../services/currency_service.dart';

class WorkerRepository {
  Future<List<Worker>> loadAll() async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return [];

    // 1. Fetch assigned workers from ob_members
    final myObs = await supabase.from('ob_members').select('ob_id,ob:obyektlar(*)').eq('user_id', userId);
    final activeObs = (myObs as List)
        .where((row) => row['ob'] != null && (row['ob']['status'] ?? 'active') != 'done')
        .toList();

    final obIds = activeObs.map((row) => row['ob_id'].toString()).toList();
    final obNames = {
      for (final row in activeObs) row['ob_id'].toString(): (row['ob']['nomi'] ?? '') as String,
    };

    final result = <String, Worker>{};

    if (obIds.isNotEmpty) {
      try {
        final members = await supabase
            .from('ob_members')
            .select('*,profiles(*)')
            .inFilter('ob_id', obIds)
            .neq('user_id', userId);

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
            if (!existing.obsList.any((op) => op.obId == obId)) {
              existing.obsList.add(obEntry);
            }
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
      } catch (_) {}
    }

    // 2. Fetch global workers from my_workers table (if table exists)
    try {
      final globalMembers = await supabase
          .from('my_workers')
          .select('*,profiles:profiles!worker_id(*)')
          .eq('owner_id', userId);

      for (final row in globalMembers as List) {
        final uid = row['worker_id'].toString();
        final profileRow = row['profiles'] as Map<String, dynamic>?;

        final existing = result[uid];
        if (existing == null) {
          result[uid] = Worker(
            userId: uid,
            profile: profileRow != null ? Profile.fromMap(profileRow) : null,
            kasb: row['kasb'],
            ishaqi: 0,
            olingan: 0,
            obsList: [],
          );
        }
      }
    } catch (_) {}

    final uids = result.keys.toList();
    if (uids.isNotEmpty) {
      try {
        final txs = await supabase
            .from('transactions')
            .select('to_user,from_user,tx_date,created_at')
            .or('to_user.in.(${uids.join(",")}),from_user.in.(${uids.join(",")})');

        final lastDates = <String, DateTime>{};
        for (final row in (txs as List)) {
          final dtStr = row['tx_date'] ?? row['created_at'];
          if (dtStr == null) continue;
          final dt = DateTime.tryParse(dtStr.toString());
          if (dt == null) continue;

          final toU = row['to_user']?.toString();
          final fromU = row['from_user']?.toString();

          if (toU != null && uids.contains(toU)) {
            final existing = lastDates[toU];
            if (existing == null || dt.isAfter(existing)) {
              lastDates[toU] = dt;
            }
          }
          if (fromU != null && uids.contains(fromU)) {
            final existing = lastDates[fromU];
            if (existing == null || dt.isAfter(existing)) {
              lastDates[fromU] = dt;
            }
          }
        }

        for (final uid in uids) {
          if (lastDates.containsKey(uid)) {
            result[uid]!.lastActive = lastDates[uid];
          }
        }
      } catch (_) {}
    }

    return result.values.toList();
  }

  Future<void> addWorkerGlobal({required String phone, String? kasb}) async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return;

    final digits = phone.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) throw "Raqam xato kiritildi";

    final phoneWithPlus = '+$digits';
    final phoneWithoutPlus = digits;
    final nineDigits = digits.length >= 9 ? digits.substring(digits.length - 9) : digits;

    final profileRow = await supabase
        .from('profiles')
        .select('id')
        .or('phone.eq.$phoneWithPlus,phone.eq.$phoneWithoutPlus,phone.eq.$nineDigits')
        .maybeSingle();

    if (profileRow == null) {
      throw "$phone topilmadi. Avval ro'yxatdan o'tishi kerak!";
    }

    final workerId = profileRow['id'].toString();

    if (workerId == userId) {
      throw "O'zingizni ishchi qilib qo'sha olmaysiz";
    }

    await supabase.from('my_workers').insert({
      'owner_id': userId,
      'worker_id': workerId,
      'kasb': kasb?.isNotEmpty == true ? kasb : null,
    });
  }

  /// Records an advance ("avans") payment to a worker on a project; increases `olingan`.
  Future<void> giveAvans({
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
      'izoh': izoh?.isNotEmpty == true ? izoh : 'Avans',
      'tx_date': (txDate ?? DateTime.now()).toIso8601String(),
      'currency': currency,
      'exchange_rate': liveRate,
      'summa_usd': amountUsd,
      'summa_uzs': amountUzs,
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
          .update({'olingan': (member['olingan'] ?? 0) + amountUzs})
          .eq('ob_id', obId)
          .eq('user_id', toUserId);
    } else {
      await supabase.from('ob_members').insert({
        'ob_id': obId,
        'user_id': toUserId,
        'role': 'member',
        'ishaqi': 0,
        'olingan': amountUzs,
        'balance': 0,
      });
    }
  }

  /// Records a wage ("ish haqi") entry for a worker on a project; increases `ishaqi`.
  Future<void> giveIshHaqi({
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
      'tur': 'ishhaqi',
      'kategoriya': 'usta',
      'izoh': izoh?.isNotEmpty == true ? izoh : 'Ish haqi',
      'tx_date': (txDate ?? DateTime.now()).toIso8601String(),
      'currency': currency,
      'exchange_rate': liveRate,
      'summa_usd': amountUsd,
      'summa_uzs': amountUzs,
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
          .update({'ishaqi': (member['ishaqi'] ?? 0) + amountUzs})
          .eq('ob_id', obId)
          .eq('user_id', toUserId);
    } else {
      await supabase.from('ob_members').insert({
        'ob_id': obId,
        'user_id': toUserId,
        'role': 'member',
        'ishaqi': amountUzs,
        'olingan': 0,
        'balance': 0,
      });
    }
  }
}
