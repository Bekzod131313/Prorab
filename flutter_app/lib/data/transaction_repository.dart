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
}
