import '../main.dart';
import '../models/member.dart';
import '../utils/phone_formatter.dart';
import 'transaction_repository.dart';

class MemberRepository {
  Future<List<ObMember>> loadForProject(String obId) async {
    final response = await supabase
        .from('ob_members')
        .select('*,profiles(*)')
        .eq('ob_id', obId);

    return (response as List)
        .map((row) => ObMember.fromMap(row as Map<String, dynamic>))
        .toList();
  }

  /// Adds a member by phone number. Throws a [String] message on failure.
  Future<void> addMember({
    required String obId,
    required String phone,
    String? kasb,
    num ishaqi = 0,
    DateTime? boshlanish,
    DateTime? tugash,
  }) async {
    final userId = supabase.auth.currentUser?.id;

    var digits = phone.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) throw "Raqam xato kiritildi";

    if (digits.length == 9) {
      digits = '998$digits';
    }

    final phoneWithPlus = '+$digits';
    final phoneWithoutPlus = digits;
    final nineDigits = digits.length >= 9 ? digits.substring(digits.length - 9) : digits;

    final profileRow = await supabase
        .from('profiles')
        .select('id')
        .or('phone.eq.$phoneWithPlus,phone.eq.$phoneWithoutPlus,phone.eq.$nineDigits')
        .maybeSingle();

    if (profileRow == null) {
      final formatted = PhoneFormatter.format(phone);
      throw "$formatted topilmadi. Avval ro'yxatdan o'tishi kerak!";
    }

    final newUserId = profileRow['id'].toString();

    final existing = await supabase
        .from('ob_members')
        .select('user_id')
        .eq('ob_id', obId)
        .eq('user_id', newUserId)
        .maybeSingle();

    if (existing != null) {
      throw "Allaqachon qo'shilgan";
    }

    await supabase.from('ob_members').insert({
      'ob_id': obId,
      'user_id': newUserId,
      'role': 'member',
      'balance': 0,
      'added_by': userId,
      'kasb': kasb?.isNotEmpty == true ? kasb : null,
      'ishaqi': ishaqi,
      'boshlanish': boshlanish?.toIso8601String().substring(0, 10),
      'tugash': tugash?.toIso8601String().substring(0, 10),
      'kirim': 0,
      'chiqim': 0,
    });

    if (ishaqi > 0) {
      try {
        await supabase.from('transactions').insert({
          'ob_id': obId,
          'from_user': userId,
          'to_user': newUserId,
          'summa': ishaqi,
          'tur': 'ishhaqi',
          'kategoriya': 'usta',
          'izoh': "Boshlang'ich ish haqi",
          'tx_date': DateTime.now().toIso8601String(),
        });
      } catch (_) {}
    }

    TransactionRepository().sendWorkerAddedToProjectNotification(
      obId: obId,
      toUserId: newUserId,
    ).catchError((_) {});
  }

  Future<List<Map<String, dynamic>>> searchUsers(String query) async {
    if (query.trim().length < 2) return [];
    final q = query.trim();
    final rows = await supabase
        .from('profiles')
        .select('id,full_name,phone')
        .or('full_name.ilike.%$q%,phone.ilike.%$q%')
        .limit(10);
    return (rows as List).cast<Map<String, dynamic>>();
  }

  Future<void> removeMember({required String obId, required String userId}) async {
    await supabase.from('ob_members').delete().eq('ob_id', obId).eq('user_id', userId);
  }

  Future<void> updateKasb({required String obId, required String userId, required String kasb}) async {
    await supabase.from('ob_members').update({'kasb': kasb.isNotEmpty ? kasb : null}).eq('ob_id', obId).eq('user_id', userId);
  }
}
