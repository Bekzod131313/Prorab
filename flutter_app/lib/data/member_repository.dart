import '../main.dart';
import '../models/member.dart';

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
  }) async {
    final userId = supabase.auth.currentUser?.id;

    final profileRow = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();

    if (profileRow == null) {
      throw "$phone topilmadi. Avval ro'yxatdan o'tishi kerak!";
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
    });
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
