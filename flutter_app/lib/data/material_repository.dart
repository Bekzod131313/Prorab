import '../main.dart';
import '../models/material.dart';

class MaterialRepository {
  Future<List<ObMaterial>> loadForProject(String obId) async {
    final data = await supabase
        .from('materials')
        .select('*')
        .eq('ob_id', obId)
        .order('created_at', ascending: false);

    return (data as List).map((row) => ObMaterial.fromMap(row as Map<String, dynamic>)).toList();
  }

  Future<void> addMaterial({
    required String obId,
    required String nomi,
    required num miqdor,
    required String birlik,
  }) async {
    await supabase.from('materials').insert({
      'ob_id': obId,
      'nomi': nomi,
      'miqdor': miqdor,
      'birlik': birlik,
      'holat': 'kerak',
    });
  }
}
