import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class CurrencyService {
  static final CurrencyService _instance = CurrencyService._internal();
  factory CurrencyService() => _instance;
  CurrencyService._internal();

  final displayCurrencyNotifier = ValueNotifier<String>('UZS');
  double usdToUzsRate = 12800.0; // fallback default rate

  String get displayCurrency => displayCurrencyNotifier.value;

  Future<void> init() async {
    // 1. Load saved display currency
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('display_currency') ?? 'UZS';
    displayCurrencyNotifier.value = saved;

    // 2. Fetch live rate
    await fetchLiveRate();
  }

  Future<void> setDisplayCurrency(String currency) async {
    displayCurrencyNotifier.value = currency;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('display_currency', currency);
  }

  Future<void> fetchLiveRate() async {
    try {
      final response = await http.get(Uri.parse('https://open.er-api.com/v6/latest/USD')).timeout(const Duration(seconds: 5));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['result'] == 'success' && data['rates'] != null && data['rates']['UZS'] != null) {
          usdToUzsRate = (data['rates']['UZS'] as num).toDouble();
        }
      }
    } catch (_) {
      // Keep fallback if offline
    }
  }

  /// Converts a value from transaction currency to UZS and USD.
  /// Returns a map with both converted amounts.
  Map<String, double> convert(double amount, String fromCurrency) {
    if (fromCurrency == 'USD') {
      return {
        'USD': amount,
        'UZS': amount * usdToUzsRate,
      };
    } else {
      return {
        'UZS': amount,
        'USD': amount / usdToUzsRate,
      };
    }
  }

  /// Converts UZS amount to the current display currency.
  double convertUzsToDisplay(double amountUzs) {
    if (displayCurrency == 'USD') {
      return amountUzs / usdToUzsRate;
    }
    return amountUzs;
  }
}
