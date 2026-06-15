class CurrencyRate {
  final String code;
  final String nameUz;
  final String nameEn;
  final double rate;
  final double diff;

  CurrencyRate({required this.code, required this.nameUz, required this.nameEn, required this.rate, required this.diff});

  factory CurrencyRate.fromMap(Map<String, dynamic> row) {
    return CurrencyRate(
      code: row['Ccy'] ?? '',
      nameUz: row['CcyNm_UZ'] ?? '',
      nameEn: row['CcyNm_EN'] ?? '',
      rate: double.tryParse(row['Rate'].toString()) ?? 0,
      diff: double.tryParse(row['Diff'].toString()) ?? 0,
    );
  }
}
