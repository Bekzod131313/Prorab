class ObMaterial {
  final String id;
  final String obId;
  final String nomi;
  final num miqdor;
  final String birlik;
  final String holat;
  final num? narx;

  ObMaterial({
    required this.id,
    required this.obId,
    required this.nomi,
    required this.miqdor,
    required this.birlik,
    required this.holat,
    this.narx,
  });

  factory ObMaterial.fromMap(Map<String, dynamic> row) {
    return ObMaterial(
      id: row['id'].toString(),
      obId: row['ob_id'].toString(),
      nomi: row['nomi'] ?? '',
      miqdor: row['miqdor'] ?? 0,
      birlik: row['birlik'] ?? '',
      holat: row['holat'] ?? 'kerak',
      narx: row['narx'],
    );
  }

  static const statusLabels = {'kerak': 'Kerak', 'buyurtma': 'Buyurtma', 'yetkazildi': 'Yetkazildi'};

  String get statusLabel => statusLabels[holat] ?? holat;

  num get total => (narx ?? 0) * miqdor;
}
