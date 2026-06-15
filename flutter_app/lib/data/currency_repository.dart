import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/currency.dart';

class CurrencyRepository {
  static const _watched = {'USD', 'EUR', 'RUB', 'CNY', 'GBP'};

  Future<List<CurrencyRate>> loadRates() async {
    final response = await http.get(Uri.parse('https://cbu.uz/uz/arkhiv-kursov-valyut/json/'));
    final data = jsonDecode(utf8.decode(response.bodyBytes)) as List;
    return data
        .map((row) => CurrencyRate.fromMap(row as Map<String, dynamic>))
        .where((rate) => _watched.contains(rate.code))
        .toList();
  }
}
