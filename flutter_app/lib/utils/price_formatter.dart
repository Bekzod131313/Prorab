import 'package:flutter/services.dart';

class PriceInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
      TextEditingValue oldValue, TextEditingValue newValue) {
    if (newValue.selection.baseOffset == 0) {
      return newValue;
    }

    // Clean input of all non-digits
    final cleanString = newValue.text.replaceAll(RegExp(r'\D'), '');

    if (cleanString.isEmpty) {
      return const TextEditingValue(
        text: '',
        selection: TextSelection.collapsed(offset: 0),
      );
    }

    // Format the number with spaces as thousands separator
    final buffer = StringBuffer();
    for (int i = 0; i < cleanString.length; i++) {
      if (i > 0 && (cleanString.length - i) % 3 == 0) {
        buffer.write(' ');
      }
      buffer.write(cleanString[i]);
    }
    final formatted = buffer.toString();

    // Calculate cursor selection position
    int cursorPosition = newValue.selection.end;
    int spacesBeforeCursor = 0;
    for (int i = 0; i < cursorPosition && i < newValue.text.length; i++) {
      if (newValue.text[i] == ' ') {
        spacesBeforeCursor++;
      }
    }
    
    // Total digits before cursor
    int digitsBeforeCursor = cursorPosition - spacesBeforeCursor;

    // Determine new cursor offset based on digits
    int newCursorOffset = 0;
    int digitCount = 0;
    while (digitCount < digitsBeforeCursor && newCursorOffset < formatted.length) {
      if (formatted[newCursorOffset] != ' ') {
        digitCount++;
      }
      newCursorOffset++;
    }

    // Adjust cursor if it lands on a space
    if (newCursorOffset < formatted.length && formatted[newCursorOffset] == ' ') {
      newCursorOffset++;
    }

    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: newCursorOffset.clamp(0, formatted.length)),
    );
  }

  static String formatNumber(num value) {
    final str = value.round().toString();
    final buffer = StringBuffer();
    for (int i = 0; i < str.length; i++) {
      if (i > 0 && (str.length - i) % 3 == 0) {
        buffer.write(' ');
      }
      buffer.write(str[i]);
    }
    return buffer.toString();
  }
}
