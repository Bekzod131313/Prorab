import 'package:flutter_test/flutter_test.dart';
import 'package:app/l10n/strings.dart';

void main() {
  test('tr translation helper test', () {
    expect(tr('nav_home'), 'Asosiy');
  });
}

