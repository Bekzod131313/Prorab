import '../main.dart';
import '../models/project.dart';
import '../models/transaction.dart';

class TopWorker {
  final String name;
  final num ishaqi;
  final num olingan;

  TopWorker({required this.name, required this.ishaqi, required this.olingan});

  num get balans => ishaqi - olingan;
}

class ProjectProfit {
  final String nomi;
  final num kirim;
  final num chiqim;

  ProjectProfit({required this.nomi, required this.kirim, required this.chiqim});

  num get foyda => kirim - chiqim;
}

class ReportData {
  final num totalIn;
  final num totalOut;
  final Map<String?, num> catTotals;
  final List<ProjectProfit> projects;
  final List<TopWorker> topWorkers;
  final List<ProjectTransaction> txs;
  final Map<String, String> obNames;
  final num avgDaily;
  final int? activeDay;

  ReportData({
    required this.totalIn,
    required this.totalOut,
    required this.catTotals,
    required this.projects,
    required this.topWorkers,
    required this.txs,
    required this.obNames,
    required this.avgDaily,
    required this.activeDay,
  });

  num get foyda => totalIn - totalOut;
}

class ReportRepository {
  Future<ReportData> load(List<Project> projects, {String period = 'all'}) async {
    final obIds = projects.map((p) => p.id).toList();
    final userId = supabase.auth.currentUser?.id;

    List<ProjectTransaction> txs = [];
    if (obIds.isNotEmpty) {
      var query = supabase.from('transactions').select('*').inFilter('ob_id', obIds);
      final now = DateTime.now();
      if (period == 'month') {
        final start = DateTime(now.year, now.month, 1);
        query = query.gte('created_at', start.toIso8601String());
      } else if (period == 'week') {
        final start = now.subtract(const Duration(days: 7));
        query = query.gte('created_at', start.toIso8601String());
      }
      final data = await query.order('created_at', ascending: true);
      txs = (data as List).map((row) => ProjectTransaction.fromMap(row as Map<String, dynamic>)).toList();
    }

    num totalIn = 0;
    num totalOut = 0;
    final catTotals = <String?, num>{};
    final dayTotals = <int, num>{};
    for (final tx in txs) {
      final isIn = tx.isIncomeFor(userId ?? '');
      final isOut = tx.isExpenseFor(userId ?? '');
      if (isIn) totalIn += tx.summa;
      if (isOut) {
        totalOut += tx.summa;
        catTotals[tx.kategoriya] = (catTotals[tx.kategoriya] ?? 0) + tx.summa;
      }
      dayTotals[tx.date.day] = (dayTotals[tx.date.day] ?? 0) + tx.summa;
    }

    final avgDaily = dayTotals.isEmpty ? 0 : (totalIn / dayTotals.length).round();
    int? activeDay;
    if (dayTotals.isNotEmpty) {
      activeDay = dayTotals.entries.reduce((a, b) => b.value > a.value ? b : a).key;
    }

    final projectProfits = projects
        .map((p) => ProjectProfit(nomi: p.nomi, kirim: p.kirim, chiqim: p.chiqim))
        .toList()
      ..sort((a, b) => b.foyda.compareTo(a.foyda));

    List<TopWorker> topWorkers = [];
    if (obIds.isNotEmpty) {
      final mems = await supabase
          .from('ob_members')
          .select('user_id,ishaqi,olingan,profiles(full_name,phone)')
          .inFilter('ob_id', obIds)
          .neq('role', 'owner');

      final agg = <String, TopWorker>{};
      for (final row in (mems as List)) {
        final m = row as Map<String, dynamic>;
        final key = m['user_id'].toString();
        final profile = m['profiles'] as Map<String, dynamic>?;
        final name = profile?['full_name'] ?? profile?['phone'] ?? '?';
        final existing = agg[key];
        agg[key] = TopWorker(
          name: name,
          ishaqi: (existing?.ishaqi ?? 0) + ((m['ishaqi'] as num?) ?? 0),
          olingan: (existing?.olingan ?? 0) + ((m['olingan'] as num?) ?? 0),
        );
      }
      topWorkers = agg.values.toList()..sort((a, b) => b.olingan.compareTo(a.olingan));
      if (topWorkers.length > 5) topWorkers = topWorkers.sublist(0, 5);
    }

    return ReportData(
      totalIn: totalIn,
      totalOut: totalOut,
      catTotals: catTotals,
      projects: projectProfits,
      topWorkers: topWorkers,
      txs: txs,
      obNames: {for (final p in projects) p.id: p.nomi},
      avgDaily: avgDaily,
      activeDay: activeDay,
    );
  }
}
