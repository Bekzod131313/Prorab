import 'package:flutter/services.dart';

class AppHaptics {
  /// Light haptic tap for general button clicks.
  static Future<void> light() async {
    await HapticFeedback.lightImpact();
  }

  /// Selection haptic tap for switches, dropdowns, and checkboxes.
  static Future<void> selection() async {
    await HapticFeedback.selectionClick();
  }

  /// Medium haptic feedback.
  static Future<void> medium() async {
    await HapticFeedback.mediumImpact();
  }

  /// Heavy haptic feedback for key operations (e.g. success alerts).
  static Future<void> heavy() async {
    await HapticFeedback.heavyImpact();
  }

  /// Standard device vibration.
  static Future<void> vibrate() async {
    await HapticFeedback.vibrate();
  }
}
