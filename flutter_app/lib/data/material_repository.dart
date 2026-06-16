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
    num? narx,
  }) async {
    await supabase.from('materials').insert({
      'ob_id': obId,
      'nomi': nomi,
      'miqdor': miqdor,
      'birlik': birlik,
      'holat': 'kerak',
      if (narx != null && narx > 0) 'narx': narx,
    });
  }

  Future<void> updateStatus(String id, String holat) async {
    await supabase.from('materials').update({'holat': holat}).eq('id', id);
  }

  Future<void> deleteMaterial(String id) async {
    await supabase.from('materials').delete().eq('id', id);
  }
}
