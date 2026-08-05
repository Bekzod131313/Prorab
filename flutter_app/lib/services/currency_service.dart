import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class CurrencyRate {
  final String code;
  final String nameUz;
  final String nameRu;
  final String nameEn;
  final String symbol;
  final String flag;
  final double rateInUzs; // rate of 1 unit in UZS
  final double diff;
  final String date;

  const CurrencyRate({
    required this.code,
    required this.nameUz,
    required this.nameRu,
    required this.nameEn,
    required this.symbol,
    required this.flag,
    required this.rateInUzs,
    required this.diff,
    required this.date,
  });

  String getName(String lang) {
    if (lang == 'ru') return nameRu;
    if (lang == 'en') return nameEn;
    return nameUz;
  }
}

class CurrencyService {
  static final CurrencyService _instance = CurrencyService._internal();
  factory CurrencyService() => _instance;
  CurrencyService._internal();

  final displayCurrencyNotifier = ValueNotifier<String>('UZS');
  double usdToUzsRate = 12800.0; // fallback default rate
  String lastUpdatedDate = '';

  List<CurrencyRate> _rates = [];
  List<CurrencyRate> get rates => List.unmodifiable(_rates);

  String get displayCurrency => displayCurrencyNotifier.value;

  Future<void> init() async {
    // 1. Load saved display currency
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString('display_currency') ?? 'UZS';
    displayCurrencyNotifier.value = saved;

    // 2. Initialize default rates list
    _initDefaultRates();

    // 3. Fetch live rates asynchronously in background without blocking app launch
    fetchLiveRate();
  }

  void _initDefaultRates() {
    final dateStr = '${DateTime.now().day}.${DateTime.now().month}.${DateTime.now().year}';
    lastUpdatedDate = dateStr;
    _rates = [
      CurrencyRate(
        code: 'UZS',
        nameUz: "O'zbekiston so'mi",
        nameRu: 'Узбекский сум',
        nameEn: 'Uzbekistan Sum',
        symbol: "so'm",
        flag: '🇺🇿',
        rateInUzs: 1.0,
        diff: 0.0,
        date: dateStr,
      ),
      CurrencyRate(
        code: 'USD',
        nameUz: 'AQSH dollari',
        nameRu: 'Доллар США',
        nameEn: 'US Dollar',
        symbol: r'$',
        flag: '🇺🇸',
        rateInUzs: usdToUzsRate,
        diff: 15.0,
        date: dateStr,
      ),
      CurrencyRate(
        code: 'EUR',
        nameUz: 'Yevro',
        nameRu: 'Евро',
        nameEn: 'Euro',
        symbol: '€',
        flag: '🇪🇺',
        rateInUzs: 13950.0,
        diff: 22.0,
        date: dateStr,
      ),
      CurrencyRate(
        code: 'RUB',
        nameUz: 'Rossiya rubli',
        nameRu: 'Российский рубль',
        nameEn: 'Russian Ruble',
        symbol: '₽',
        flag: '🇷🇺',
        rateInUzs: 142.5,
        diff: -0.3,
        date: dateStr,
      ),
      CurrencyRate(
        code: 'KZT',
        nameUz: "Qozog'iston tengesi",
        nameRu: 'Казахстанский тенге',
        nameEn: 'Kazakhstani Tenge',
        symbol: '₸',
        flag: '🇰🇿',
        rateInUzs: 26.5,
        diff: 0.1,
        date: dateStr,
      ),
      CurrencyRate(
        code: 'GBP',
        nameUz: 'Angliya funt sterlingi',
        nameRu: 'Фунт стерлингов',
        nameEn: 'British Pound',
        symbol: '£',
        flag: '🇬🇧',
        rateInUzs: 16400.0,
        diff: 35.0,
        date: dateStr,
      ),
      CurrencyRate(
        code: 'CNY',
        nameUz: 'Xitoy yuani',
        nameRu: 'Китайский юань',
        nameEn: 'Chinese Yuan',
        symbol: '¥',
        flag: '🇨🇳',
        rateInUzs: 1780.0,
        diff: 2.5,
        date: dateStr,
      ),
      CurrencyRate(
        code: 'TRY',
        nameUz: 'Turk lirasi',
        nameRu: 'Турецкая лира',
        nameEn: 'Turkish Lira',
        symbol: '₺',
        flag: '🇹🇷',
        rateInUzs: 380.0,
        diff: -1.2,
        date: dateStr,
      ),
      CurrencyRate(
        code: 'AED',
        nameUz: 'BAA dirhami',
        nameRu: 'Дирхам ОАЭ',
        nameEn: 'UAE Dirham',
        symbol: 'د.إ',
        flag: '🇦🇪',
        rateInUzs: 3485.0,
        diff: 4.1,
        date: dateStr,
      ),
    ];
  }

  Future<void> setDisplayCurrency(String currency) async {
    displayCurrencyNotifier.value = currency;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('display_currency', currency);
  }

  Future<void> fetchLiveRate() async {
    try {
      final response = await http
          .get(Uri.parse('https://cbu.uz/uz/arkhiv-kursov-valyut/json/'))
          .timeout(const Duration(seconds: 6));

      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        final Map<String, dynamic> cbuMap = {};
        for (var item in data) {
          if (item is Map<String, dynamic> && item.containsKey('Ccy')) {
            cbuMap[item['Ccy'] as String] = item;
          }
        }

        final List<CurrencyRate> updated = [];

        // Always include UZS
        final dateStr = data.isNotEmpty && data[0]['Date'] != null
            ? data[0]['Date'].toString()
            : '${DateTime.now().day}.${DateTime.now().month}.${DateTime.now().year}';
        lastUpdatedDate = dateStr;

        updated.add(CurrencyRate(
          code: 'UZS',
          nameUz: "O'zbekiston so'mi",
          nameRu: 'Узбекский сум',
          nameEn: 'Uzbekistan Sum',
          symbol: "so'm",
          flag: '🇺🇿',
          rateInUzs: 1.0,
          diff: 0.0,
          date: dateStr,
        ));

        // Popular currencies list
        final targets = [
          {'code': 'USD', 'symbol': r'$', 'flag': '🇺🇸'},
          {'code': 'EUR', 'symbol': '€', 'flag': '🇪🇺'},
          {'code': 'RUB', 'symbol': '₽', 'flag': '🇷🇺'},
          {'code': 'KZT', 'symbol': '₸', 'flag': '🇰🇿'},
          {'code': 'GBP', 'symbol': '£', 'flag': '🇬🇧'},
          {'code': 'CNY', 'symbol': '¥', 'flag': '🇨🇳'},
          {'code': 'TRY', 'symbol': '₺', 'flag': '🇹🇷'},
          {'code': 'AED', 'symbol': 'د.إ', 'flag': '🇦🇪'},
          {'code': 'CHF', 'symbol': 'Fr', 'flag': '🇨🇭'},
          {'code': 'JPY', 'symbol': '¥', 'flag': '🇯🇵'},
          {'code': 'KRW', 'symbol': '₩', 'flag': '🇰🇷'},
        ];

        for (var t in targets) {
          final code = t['code']!;
          if (cbuMap.containsKey(code)) {
            final item = cbuMap[code]!;
            final nominal = double.tryParse(item['Nominal']?.toString() ?? '1') ?? 1.0;
            final rawRate = double.tryParse(item['Rate']?.toString() ?? '0') ?? 0.0;
            final rateInUzs = nominal > 0 ? rawRate / nominal : rawRate;
            final diff = double.tryParse(item['Diff']?.toString() ?? '0') ?? 0.0;

            if (code == 'USD' && rateInUzs > 0) {
              usdToUzsRate = rateInUzs;
            }

            updated.add(CurrencyRate(
              code: code,
              nameUz: item['CcyNm_UZ']?.toString() ?? code,
              nameRu: item['CcyNm_RU']?.toString() ?? code,
              nameEn: item['CcyNm_EN']?.toString() ?? code,
              symbol: t['symbol']!,
              flag: t['flag']!,
              rateInUzs: rateInUzs,
              diff: diff,
              date: item['Date']?.toString() ?? dateStr,
            ));
          }
        }

        if (updated.isNotEmpty) {
          _rates = updated;
        }
      }
    } catch (_) {
      // Secondary fallback to open.er-api if CBU fails
      try {
        final response = await http
            .get(Uri.parse('https://open.er-api.com/v6/latest/USD'))
            .timeout(const Duration(seconds: 5));
        if (response.statusCode == 200) {
          final data = json.decode(response.body);
          if (data['result'] == 'success' &&
              data['rates'] != null &&
              data['rates']['UZS'] != null) {
            usdToUzsRate = (data['rates']['UZS'] as num).toDouble();
            // update USD rate in list
            _rates = _rates.map((r) {
              if (r.code == 'USD') {
                return CurrencyRate(
                  code: r.code,
                  nameUz: r.nameUz,
                  nameRu: r.nameRu,
                  nameEn: r.nameEn,
                  symbol: r.symbol,
                  flag: r.flag,
                  rateInUzs: usdToUzsRate,
                  diff: r.diff,
                  date: r.date,
                );
              }
              return r;
            }).toList();
          }
        }
      } catch (_) {}
    }
  }

  /// Convert amount from one currency to another using UZS as standard base
  double convertBetween(double amount, String fromCode, String toCode) {
    if (fromCode == toCode) return amount;

    final fromRate = _rates.firstWhere(
      (r) => r.code == fromCode,
      orElse: () => CurrencyRate(
        code: fromCode,
        nameUz: fromCode,
        nameRu: fromCode,
        nameEn: fromCode,
        symbol: '',
        flag: '',
        rateInUzs: fromCode == 'USD' ? usdToUzsRate : 1.0,
        diff: 0,
        date: '',
      ),
    );

    final toRate = _rates.firstWhere(
      (r) => r.code == toCode,
      orElse: () => CurrencyRate(
        code: toCode,
        nameUz: toCode,
        nameRu: toCode,
        nameEn: toCode,
        symbol: '',
        flag: '',
        rateInUzs: toCode == 'USD' ? usdToUzsRate : 1.0,
        diff: 0,
        date: '',
      ),
    );

    if (toRate.rateInUzs == 0) return 0.0;
    // Amount in UZS = amount * fromRate.rateInUzs
    final amountUzs = amount * fromRate.rateInUzs;
    // Amount in target = amountUzs / toRate.rateInUzs
    return amountUzs / toRate.rateInUzs;
  }

  /// Legacy helper: Converts a value from transaction currency to UZS and USD.
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

