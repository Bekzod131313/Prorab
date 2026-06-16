import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class ClientPayment {
  final String id;
  final num amount;
  final DateTime date;
  final String? izoh;
  final bool isReceived;

  ClientPayment({
    required this.id,
    required this.amount,
    required this.date,
    this.izoh,
    this.isReceived = false,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'amount': amount,
        'date': date.toIso8601String(),
        'izoh': izoh,
        'isReceived': isReceived,
      };

  factory ClientPayment.fromJson(Map<String, dynamic> j) => ClientPayment(
        id: j['id'],
        amount: j['amount'],
        date: DateTime.parse(j['date']),
        izoh: j['izoh'],
        isReceived: j['isReceived'] ?? false,
      );

  ClientPayment copyWith({bool? isReceived}) => ClientPayment(
        id: id,
        amount: amount,
        date: date,
        izoh: izoh,
        isReceived: isReceived ?? this.isReceived,
      );
}

class ClientSchedule {
  final String obId;
  final num contractTotal;
  final List<ClientPayment> payments;

  ClientSchedule({
    required this.obId,
    required this.contractTotal,
    required this.payments,
  });

  num get totalReceived => payments.where((p) => p.isReceived).fold(0, (s, p) => s + p.amount);
  num get totalScheduled => payments.fold<num>(0, (s, p) => s + p.amount);
  num get remaining => contractTotal - totalReceived;

  Map<String, dynamic> toJson() => {
        'obId': obId,
        'contractTotal': contractTotal,
        'payments': payments.map((p) => p.toJson()).toList(),
      };

  factory ClientSchedule.fromJson(Map<String, dynamic> j) => ClientSchedule(
        obId: j['obId'],
        contractTotal: j['contractTotal'] ?? 0,
        payments: (j['payments'] as List? ?? [])
            .map((e) => ClientPayment.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class ClientScheduleRepository {
  static const _prefix = 'client_schedule_';

  String _key(String obId) => '$_prefix$obId';

  Future<ClientSchedule?> load(String obId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key(obId));
    if (raw == null) return null;
    try {
      return ClientSchedule.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> save(ClientSchedule schedule) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key(schedule.obId), jsonEncode(schedule.toJson()));
  }

  Future<void> markPaymentReceived(String obId, String paymentId) async {
    final schedule = await load(obId);
    if (schedule == null) return;
    final idx = schedule.payments.indexWhere((p) => p.id == paymentId);
    if (idx < 0) return;
    final updated = List<ClientPayment>.from(schedule.payments);
    updated[idx] = updated[idx].copyWith(isReceived: true);
    await save(ClientSchedule(obId: obId, contractTotal: schedule.contractTotal, payments: updated));
  }

  Future<void> addPayment(String obId, ClientPayment payment) async {
    final existing = await load(obId);
    final schedule = existing ?? ClientSchedule(obId: obId, contractTotal: 0, payments: []);
    final updated = List<ClientPayment>.from(schedule.payments)..add(payment);
    updated.sort((a, b) => a.date.compareTo(b.date));
    await save(ClientSchedule(obId: obId, contractTotal: schedule.contractTotal, payments: updated));
  }

  Future<void> delete(String obId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key(obId));
  }
}
