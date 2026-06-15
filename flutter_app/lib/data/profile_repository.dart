import '../main.dart';
import '../models/profile.dart';

class ProfileRepository {
  Future<Profile?> loadCurrent() async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return null;

    final data = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (data == null) return null;
    return Profile.fromMap(data);
  }
}
