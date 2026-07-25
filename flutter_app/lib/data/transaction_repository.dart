import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import '../main.dart';
import '../models/transaction.dart';
import '../services/currency_service.dart';
import '../l10n/strings.dart';

class TransactionRepository {
  Future<List<ProjectTransaction>> loadForProject(String obId, {String? createdBy}) async {
    var query = supabase
        .from('transactions')
        .select('*')
        .eq('ob_id', obId);
    if (createdBy != null) {
      query = query.or('created_by.eq.$createdBy,to_user.eq.$createdBy,from_user.eq.$createdBy');
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
    List<String>? files,
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
        'files': files ?? [],
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
      String? finalIzoh = izoh;
      if (toUserId != null && userId != null) {
        final profile = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', userId)
            .maybeSingle();
        final senderName = profile?['full_name']?.toString();
        if (senderName != null) {
          finalIzoh = izoh?.isNotEmpty == true ? "$senderName: $izoh" : senderName;
        }
      }

      await supabase.from('transactions').insert({
        'ob_id': obId,
        'from_user': userId,
        'to_user': toUserId,
        'summa': amount,
        'tur': 'spend',
        'kategoriya': kategoriya,
        'izoh': finalIzoh,
        'tx_date': txDate0,
        'currency': currency,
        'exchange_rate': liveRate,
        'summa_usd': amountUsd,
        'summa_uzs': amountUzs,
        'created_by': userId,
        'files': files ?? [],
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

        sendWorkerNotification(
          obId: obId,
          toUserId: toUserId,
          amount: amount,
          currency: currency,
        ).catchError((e) {
          print("Error sending worker notification: $e");
        });
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
    List<String>? files,
  }) async {
    final userId = supabase.auth.currentUser?.id;
    final liveRate = CurrencyService().usdToUzsRate;
    final converted = CurrencyService().convert(amount.toDouble(), currency);
    final amountUzs = converted['UZS']!;
    final amountUsd = converted['USD']!;

    String? finalIzoh = izoh;
    if (userId != null) {
      final profile = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', userId)
          .maybeSingle();
      final senderName = profile?['full_name']?.toString();
      if (senderName != null) {
        finalIzoh = izoh?.isNotEmpty == true ? "$senderName: $izoh" : senderName;
      }
    }

    await supabase.from('transactions').insert({
      'ob_id': obId,
      'from_user': userId,
      'to_user': toUserId,
      'summa': amount,
      'tur': 'send',
      'kategoriya': 'usta',
      'izoh': finalIzoh,
      'tx_date': (txDate ?? DateTime.now()).toIso8601String(),
      'currency': currency,
      'exchange_rate': liveRate,
      'summa_usd': amountUsd,
      'summa_uzs': amountUzs,
      'created_by': userId,
      'files': files ?? [],
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

    sendWorkerNotification(
      obId: obId,
      toUserId: toUserId,
      amount: amount,
      currency: currency,
    ).catchError((e) {
      print("Error sending worker notification: $e");
    });
  }

  /// Sends a push notification to user_{id}_uz and user_{id}_ru topics,
  /// and saves it in the database notifications table.
  Future<void> sendWorkerNotification({
    required String obId,
    required String toUserId,
    required num amount,
    required String currency,
  }) async {
    try {
      final senderId = supabase.auth.currentUser?.id;
      if (senderId == null || toUserId == senderId) return;

      // 1. Fetch sender name
      final senderData = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', senderId)
          .maybeSingle();
      final senderName = senderData?['full_name'] ?? 'Tizim';

      // 2. Fetch project name
      final obData = await supabase
          .from('obyektlar')
          .select('nomi')
          .eq('id', obId)
          .maybeSingle();
      final projectName = obData?['nomi'] ?? 'Loyiha';

      // 3. Format the amount
      final f = NumberFormat.decimalPattern('uz');
      final formattedAmount = currency == 'USD' 
          ? '\$${f.format(amount.round())}' 
          : f.format(amount.round());

      // 4. Construct messages
      const titleUz = 'Kirim';
      final bodyUz = '+ $formattedAmount (${senderName}dan, $projectName loyihasi)';

      const titleRu = 'Приход';
      final bodyRu = '+ $formattedAmount (от $senderName, проект $projectName)';

      const titleEn = 'Income';
      final bodyEn = '+ $formattedAmount (from $senderName, project $projectName)';

      // 5. Save to database notifications table
      final currentLang = appLocaleNotifier.value;
      final titleDb = currentLang == 'en' ? titleEn : (currentLang == 'ru' ? titleRu : titleUz);
      final bodyDb = currentLang == 'en' ? bodyEn : (currentLang == 'ru' ? bodyRu : bodyUz);

      await supabase.from('notifications').insert({
        'user_id': toUserId,
        'title': titleDb,
        'body': bodyDb,
        'title_uz': titleUz,
        'body_uz': bodyUz,
        'title_ru': titleRu,
        'body_ru': bodyRu,
        'title_en': titleEn,
        'body_en': bodyEn,
        'type': 'personal',
      });

      // 6. Send push notifications via Firebase Cloud Function to all 3 channels
      const cfUrl = 'https://us-central1-risq-91c54.cloudfunctions.net/sendPushNotification';

      try {
        await http.post(
          Uri.parse(cfUrl),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'topic': 'user_${toUserId}_uz',
            'title': titleUz,
            'body': bodyUz,
          }),
        );

        await http.post(
          Uri.parse(cfUrl),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'topic': 'user_${toUserId}_ru',
            'title': titleRu,
            'body': bodyRu,
          }),
        );

        await http.post(
          Uri.parse(cfUrl),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'topic': 'user_${toUserId}_en',
            'title': titleEn,
            'body': bodyEn,
          }),
        );
      } catch (e) {
        print("Error calling sendPushNotification function: $e");
      }
    } catch (e) {
      print('Error in sendWorkerNotification: $e');
    }
  }

  /// Sends a personal notification to a worker when added to a project.
  Future<void> sendWorkerAddedToProjectNotification({
    required String obId,
    required String toUserId,
  }) async {
    try {
      final senderId = supabase.auth.currentUser?.id;
      if (senderId == null || toUserId == senderId) return;

      final obData = await supabase
          .from('obyektlar')
          .select('nomi')
          .eq('id', obId)
          .maybeSingle();
      final projectName = obData?['nomi'] ?? 'Loyiha';

      const titleUz = 'Loyiha';
      final bodyUz = "Siz '$projectName' loyihasiga qo'shildingiz";

      const titleRu = 'Проект';
      final bodyRu = "Вы добавлены в проект '$projectName'";

      const titleEn = 'Project';
      final bodyEn = "You were added to project '$projectName'";

      final currentLang = appLocaleNotifier.value;
      final titleDb = currentLang == 'en' ? titleEn : (currentLang == 'ru' ? titleRu : titleUz);
      final bodyDb = currentLang == 'en' ? bodyEn : (currentLang == 'ru' ? bodyRu : bodyUz);

      await supabase.from('notifications').insert({
        'user_id': toUserId,
        'title': titleDb,
        'body': bodyDb,
        'title_uz': titleUz,
        'body_uz': bodyUz,
        'title_ru': titleRu,
        'body_ru': bodyRu,
        'title_en': titleEn,
        'body_en': bodyEn,
        'type': 'personal',
      });

      const cfUrl = 'https://us-central1-risq-91c54.cloudfunctions.net/sendPushNotification';
      try {
        await http.post(
          Uri.parse(cfUrl),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'topic': 'user_${toUserId}_uz',
            'title': titleUz,
            'body': bodyUz,
          }),
        );
        await http.post(
          Uri.parse(cfUrl),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'topic': 'user_${toUserId}_ru',
            'title': titleRu,
            'body': bodyRu,
          }),
        );
        await http.post(
          Uri.parse(cfUrl),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'topic': 'user_${toUserId}_en',
            'title': titleEn,
            'body': bodyEn,
          }),
        );
      } catch (_) {}
    } catch (e) {
      print('Error in sendWorkerAddedToProjectNotification: $e');
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
    List<String>? files,
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
      'files': files ?? [],
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
      query = query.or('created_by.eq.$userId,to_user.eq.$userId,from_user.eq.$userId');
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

  Future<void> updateTransaction({
    required String id,
    required num newAmount,
    required String newKategoriya,
    required String? newIzoh,
    required DateTime newTxDate,
    required String newCurrency,
    String? newToUserId,
    List<String>? newFiles,
  }) async {
    // 1. Load the original transaction
    final row = await supabase.from('transactions').select('*').eq('id', id).single();
    final oldTx = ProjectTransaction.fromMap(row);

    // 2. Convert new amount to UZS and USD
    final liveRate = CurrencyService().usdToUzsRate;
    final converted = CurrencyService().convert(newAmount.toDouble(), newCurrency);
    final newAmountUzs = converted['UZS']!;
    final newAmountUsd = converted['USD']!;

    // 3. Update the transaction row
    await supabase.from('transactions').update({
      'summa': newAmount,
      'kategoriya': newKategoriya,
      'izoh': newIzoh?.isNotEmpty == true ? newIzoh : null,
      'tx_date': newTxDate.toIso8601String(),
      'currency': newCurrency,
      'exchange_rate': liveRate,
      'summa_usd': newAmountUsd,
      'summa_uzs': newAmountUzs,
      'to_user': newToUserId,
      'files': newFiles ?? [],
    }).eq('id', id);

    // 4. Update project and member cache totals (subtract old amount, add new amount)
    final diffUzs = newAmountUzs - oldTx.summaUzs;
    if (diffUzs == 0) return; // No financial changes

    if (oldTx.tur == 'income') {
      // Update obyektlar kirim
      final ob = await supabase.from('obyektlar').select('kirim').eq('id', oldTx.obId).single();
      final newVal = ((ob['kirim'] as num?) ?? 0) + diffUzs;
      await supabase.from('obyektlar').update({'kirim': newVal < 0 ? 0 : newVal}).eq('id', oldTx.obId);

      // Update toUser member kirim
      if (oldTx.toUser != null) {
        final mem = await supabase.from('ob_members').select('kirim').eq('ob_id', oldTx.obId).eq('user_id', oldTx.toUser!).maybeSingle();
        if (mem != null) {
          final newK = ((mem['kirim'] as num?) ?? 0) + diffUzs;
          await supabase.from('ob_members').update({'kirim': newK < 0 ? 0 : newK}).eq('ob_id', oldTx.obId).eq('user_id', oldTx.toUser!);
        }
      }
    } else if (oldTx.tur == 'spend') {
      // Update obyektlar chiqim
      final ob = await supabase.from('obyektlar').select('chiqim').eq('id', oldTx.obId).single();
      final newVal = ((ob['chiqim'] as num?) ?? 0) + diffUzs;
      await supabase.from('obyektlar').update({'chiqim': newVal < 0 ? 0 : newVal}).eq('id', oldTx.obId);

      // Update fromUser member chiqim
      if (oldTx.fromUser != null) {
        final mem = await supabase.from('ob_members').select('chiqim').eq('ob_id', oldTx.obId).eq('user_id', oldTx.fromUser!).maybeSingle();
        if (mem != null) {
          final newC = ((mem['chiqim'] as num?) ?? 0) + diffUzs;
          await supabase.from('ob_members').update({'chiqim': newC < 0 ? 0 : newC}).eq('ob_id', oldTx.obId).eq('user_id', oldTx.fromUser!);
        }
      }

      // Update toUser member olingan and kirim
      if (oldTx.toUser != null) {
        final mem = await supabase.from('ob_members').select('olingan, kirim').eq('ob_id', oldTx.obId).eq('user_id', oldTx.toUser!).maybeSingle();
        if (mem != null) {
          final newO = ((mem['olingan'] as num?) ?? 0) + diffUzs;
          final newK = ((mem['kirim'] as num?) ?? 0) + diffUzs;
          await supabase.from('ob_members').update({
            'olingan': newO < 0 ? 0 : newO,
            'kirim': newK < 0 ? 0 : newK,
          }).eq('ob_id', oldTx.obId).eq('user_id', oldTx.toUser!);
        }
      }
    }
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
      final ob = await supabase
          .from('obyektlar')
          .select('chiqim')
          .eq('id', tx.obId)
          .maybeSingle();
      if (ob != null) {
        final newVal = ((ob['chiqim'] as num?) ?? 0) - tx.summaUzs;
        await supabase
            .from('obyektlar')
            .update({'chiqim': newVal < 0 ? 0 : newVal})
            .eq('id', tx.obId);
      }

      if (tx.fromUser != null) {
        final mem = await supabase
            .from('ob_members')
            .select('chiqim')
            .eq('ob_id', tx.obId)
            .eq('user_id', tx.fromUser!)
            .maybeSingle();
        if (mem != null) {
          final newC = ((mem['chiqim'] as num?) ?? 0) - tx.summaUzs;
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
