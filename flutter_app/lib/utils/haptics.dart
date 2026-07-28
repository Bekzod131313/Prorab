import 'package:flutter/services.dart';

class AppHaptics {
  /// Light haptic tap for general button clicks and tab switching.
  static Future<void> light() async {
    await HapticFeedback.lightImpact();
  }

  /// Selection haptic tap for switches, dropdowns, and checkboxes.
  static Future<void> selection() async {
    await HapticFeedback.selectionClick();
  }

  /// Medium haptic feedback for primary actions and dialog triggers.
  static Future<void> medium() async {
    await HapticFeedback.mediumImpact();
  }

  /// Heavy haptic feedback for key operations (e.g. success alerts, save).
  static Future<void> heavy() async {
    await HapticFeedback.heavyImpact();
  }

  /// Strong physical vibration feedback.
  static Future<void> vibrate() async {
    await HapticFeedback.vibrate();
    await HapticFeedback.heavyImpact();
  }

  /// Distinct double vibration for delete, remove, and destructive actions.
  static Future<void> delete() async {
    await HapticFeedback.vibrate();
    await Future.delayed(const Duration(milliseconds: 60));
    await HapticFeedback.heavyImpact();
  }

  /// Strong vibration for long press gesture activations.
  static Future<void> longPress() async {
    await HapticFeedback.vibrate();
    await HapticFeedback.heavyImpact();
  }
}
