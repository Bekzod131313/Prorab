import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../l10n/strings.dart';
import '../services/currency_service.dart';
import '../theme/app_theme.dart';

class CurrenciesScreen extends StatefulWidget {
  const CurrenciesScreen({super.key});

  @override
  State<CurrenciesScreen> createState() => _CurrenciesScreenState();
}

class _CurrenciesScreenState extends State<CurrenciesScreen> {
  final _currencyService = CurrencyService();
  final _searchController = TextEditingController();
  final _amountController = TextEditingController(text: '100');

  String _fromCurrency = 'USD';
  String _toCurrency = 'UZS';
  String _searchQuery = '';
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _refreshRates();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _refreshRates() async {
    setState(() => _loading = true);
    await _currencyService.fetchLiveRate();
    if (mounted) {
      setState(() => _loading = false);
    }
  }

  String _formatRate(double val) {
    if (val >= 100) {
      return NumberFormat.decimalPattern('ru').format(val.round());
    } else if (val >= 1) {
      return val.toStringAsFixed(2);
    } else {
      return val.toStringAsFixed(4);
    }
  }

  @override
  Widget build(BuildContext context) {
    final lang = appLocaleNotifier.value;
    final rates = _currencyService.rates;
    final filteredRates = rates.where((r) {
      if (_searchQuery.isEmpty) return true;
      final q = _searchQuery.toLowerCase();
      return r.code.toLowerCase().contains(q) ||
          r.getName(lang).toLowerCase().contains(q);
    }).toList();

    final inputAmount = double.tryParse(_amountController.text) ?? 0.0;
    final convertedValue = _currencyService.convertBetween(
      inputAmount,
      _fromCurrency,
      _toCurrency,
    );

    return ValueListenableBuilder<String>(
      valueListenable: _currencyService.displayCurrencyNotifier,
      builder: (context, activeDisplayCurrency, _) {
        return Scaffold(
          backgroundColor: AppColors.bg,
          appBar: AppBar(
            backgroundColor: AppColors.bg,
            surfaceTintColor: Colors.transparent,
            elevation: 0,
            leading: IconButton(
              icon: const Icon(Icons.arrow_back_rounded, color: AppColors.text),
              onPressed: () => Navigator.of(context).pop(),
            ),
            title: Text(
              tr('currencies_title'),
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.text,
              ),
            ),
            actions: [
              IconButton(
                icon: _loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh_rounded, color: AppColors.text2),
                onPressed: _loading ? null : _refreshRates,
                tooltip: tr('rates_updated'),
              ),
              const SizedBox(width: 8),
            ],
          ),
          body: RefreshIndicator(
            onRefresh: _refreshRates,
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              children: [
                // 1. Converter Card
                _buildConverterCard(inputAmount, convertedValue, rates, lang),

                const SizedBox(height: 20),

                // 2. Search & List Section Header
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        tr('currencies_title'),
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: AppColors.text,
                        ),
                      ),
                    ),
                    if (_currencyService.lastUpdatedDate.isNotEmpty)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.muted.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          '${tr('rates_updated')}: ${_currencyService.lastUpdatedDate}',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: AppColors.muted,
                          ),
                        ),
                      ),
                  ],
                ),

                const SizedBox(height: 10),

                // Search Bar
                TextField(
                  controller: _searchController,
                  onChanged: (val) => setState(() => _searchQuery = val),
                  decoration: InputDecoration(
                    hintText: tr('search_currency'),
                    hintStyle: const TextStyle(color: AppColors.muted, fontSize: 14),
                    prefixIcon: const Icon(Icons.search_rounded, color: AppColors.muted),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    filled: true,
                    fillColor: AppColors.card,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: AppColors.border),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: AppColors.border),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: AppColors.accent, width: 1.5),
                    ),
                  ),
                ),

                const SizedBox(height: 12),

                // Exchange Rates List
                if (filteredRates.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Center(
                      child: Text(
                        tr('search_currency'),
                        style: const TextStyle(color: AppColors.muted),
                      ),
                    ),
                  )
                else
                  ...filteredRates.map((rate) => _buildRateCard(rate, lang)),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildConverterCard(
      double inputAmount, double convertedValue, List<CurrencyRate> rates, String lang) {
    final availableCodes = rates.map((r) => r.code).toList();
    if (!availableCodes.contains(_fromCurrency)) _fromCurrency = 'USD';
    if (!availableCodes.contains(_toCurrency)) _toCurrency = 'UZS';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.calculate_rounded, color: AppColors.accent, size: 20),
              const SizedBox(width: 8),
              Text(
                tr('currency_converter'),
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: AppColors.text,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Amount Input
          TextField(
            controller: _amountController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: tr('amount'),
              labelStyle: const TextStyle(color: AppColors.muted, fontSize: 13),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              filled: true,
              fillColor: AppColors.bg,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: AppColors.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: AppColors.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: AppColors.accent, width: 1.5),
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Selectors Row (From -> Swap -> To)
          Row(
            children: [
              // From Dropdown
              Expanded(
                child: _buildCurrencyDropdown(
                  label: tr('from_currency'),
                  value: _fromCurrency,
                  rates: rates,
                  onChanged: (val) {
                    if (val != null) setState(() => _fromCurrency = val);
                  },
                ),
              ),

              // Swap Button
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: IconButton(
                  style: IconButton.styleFrom(
                    backgroundColor: AppColors.bg,
                    side: const BorderSide(color: AppColors.border),
                  ),
                  icon: const Icon(Icons.swap_horiz_rounded, color: AppColors.accent),
                  onPressed: () {
                    setState(() {
                      final temp = _fromCurrency;
                      _fromCurrency = _toCurrency;
                      _toCurrency = temp;
                    });
                  },
                ),
              ),

              // To Dropdown
              Expanded(
                child: _buildCurrencyDropdown(
                  label: tr('to_currency'),
                  value: _toCurrency,
                  rates: rates,
                  onChanged: (val) {
                    if (val != null) setState(() => _toCurrency = val);
                  },
                ),
              ),
            ],
          ),

          const SizedBox(height: 14),

          // Result Container
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  AppColors.accent.withOpacity(0.08),
                  AppColors.accentTeal.withOpacity(0.08),
                ],
              ),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.accent.withOpacity(0.2)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tr('convert_result'),
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppColors.muted,
                  ),
                ),
                const SizedBox(height: 4),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    '${_formatRate(inputAmount)} $_fromCurrency = ${_formatRate(convertedValue)} $_toCurrency',
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: AppColors.accent,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCurrencyDropdown({
    required String label,
    required String value,
    required List<CurrencyRate> rates,
    required ValueChanged<String?> onChanged,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.bg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          isExpanded: true,
          icon: const Icon(Icons.arrow_drop_down_rounded, color: AppColors.text2),
          onChanged: onChanged,
          items: rates.map((r) {
            return DropdownMenuItem<String>(
              value: r.code,
              child: Text(
                '${r.flag} ${r.code}',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppColors.text,
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildRateCard(CurrencyRate rate, String lang) {
    final isUzs = rate.code == 'UZS';
    final diffIsPositive = rate.diff >= 0;
    final diffColor = isUzs
        ? AppColors.muted
        : (diffIsPositive ? AppColors.green : AppColors.red);
    final diffText = isUzs
        ? 'Base'
        : '${diffIsPositive ? '+' : ''}${rate.diff.toStringAsFixed(1)}';

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: InkWell(
        onTap: () {
          setState(() {
            _fromCurrency = rate.code;
            _toCurrency = 'UZS';
          });
        },
        child: Row(
          children: [
            // Flag Container
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: AppColors.bg,
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.border.withOpacity(0.5)),
              ),
              child: Center(
                child: Text(
                  rate.flag,
                  style: const TextStyle(fontSize: 22),
                ),
              ),
            ),
            const SizedBox(width: 12),

            // Code & Name
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        rate.code,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: AppColors.text,
                        ),
                      ),
                      if (rate.symbol.isNotEmpty) ...[
                        const SizedBox(width: 6),
                        Text(
                          '(${rate.symbol})',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.muted,
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    rate.getName(lang),
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: AppColors.muted,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),

            // Rate Value & Diff Pill
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  isUzs
                      ? '1 so\'m'
                      : '${_formatRate(rate.rateInUzs)} so\'m',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: AppColors.text,
                  ),
                ),
                const SizedBox(height: 3),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: diffColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    diffText,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: diffColor,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
