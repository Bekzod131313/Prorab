import 'package:flutter/services.dart';

class PhoneFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    var digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    if (digits.startsWith('998')) digits = digits.substring(3);
    digits = digits.length > 9 ? digits.substring(0, 9) : digits;
    final text = '+998$digits';
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }

  static String format(String phone) {
    var digits = phone.replaceAll(RegExp(r'\D'), '');
    if (digits.length == 9) {
      digits = '998$digits';
    }
    if (digits.length < 12) {
      return phone;
    }
    final country = '+998';
    final code = digits.substring(3, 5);
    final part1 = digits.substring(5, 8);
    final part2 = digits.substring(8, 10);
    final part3 = digits.substring(10, 12);
    return '$country $code $part1 $part2 $part3';
  }
}

class LocalPhoneFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final limited = digits.length > 9 ? digits.substring(0, 9) : digits;

    final buffer = StringBuffer();
    for (var i = 0; i < limited.length; i++) {
      if (i == 2) buffer.write(' ');
      if (i == 5) buffer.write(' ');
      if (i == 7) buffer.write(' ');
      buffer.write(limited[i]);
    }

    final text = buffer.toString();
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}
