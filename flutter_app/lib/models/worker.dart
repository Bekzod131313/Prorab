import 'profile.dart';

class WorkerProject {
  final String obId;
  final String obNomi;
  final num balans;

  WorkerProject({required this.obId, required this.obNomi, required this.balans});
}

class Worker {
  final String userId;
  final Profile? profile;
  final String? kasb;
  num ishaqi;
  num olingan;
  final List<WorkerProject> obsList;
  DateTime? lastActive;
  bool isAddedByOther;

  Worker({
    required this.userId,
    required this.profile,
    required this.kasb,
    required this.ishaqi,
    required this.olingan,
    required this.obsList,
    this.lastActive,
    this.isAddedByOther = false,
  });

  num get balans => ishaqi - olingan;

  String get displayName => profile?.displayName ?? '?';

  int get obsCount => obsList.length;
}
