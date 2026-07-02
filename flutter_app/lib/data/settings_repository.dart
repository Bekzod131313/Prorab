import 'package:shared_preferences/shared_preferences.dart';

import '../main.dart' show settingsNotifier;

class SettingsRepository {
  static const _currencyKey = 'settings_currency';
  static const _compactKey = 'settings_compact_numbers';
  static const _notifKey = 'settings_notifications';

  Future<AppSettings> load() async {
    final prefs = await SharedPreferences.getInstance();
    return AppSettings(
      currency: prefs.getString(_currencyKey) ?? 'UZS',
      compactNumbers: prefs.getBool(_compactKey) ?? false,
      notifications: prefs.getBool(_notifKey) ?? true,
    );
  }

  Future<void> save(AppSettings settings) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_currencyKey, settings.currency);
    await prefs.setBool(_compactKey, settings.compactNumbers);
    await prefs.setBool(_notifKey, settings.notifications);
    // ✅ Keep the global singleton in sync so formatMoney() picks it up immediately
    AppConfig.update(settings);
    // ✅ Notify the app to rebuild all formatMoney() call sites
    settingsNotifier.value++;
  }
}


class AppSettings {
  final String currency;
  final bool compactNumbers;
  final bool notifications;

  const AppSettings({
    required this.currency,
    required this.compactNumbers,
    required this.notifications,
  });

  AppSettings copyWith({String? currency, bool? compactNumbers, bool? notifications}) {
    return AppSettings(
      currency: currency ?? this.currency,
      compactNumbers: compactNumbers ?? this.compactNumbers,
      notifications: notifications ?? this.notifications,
    );
  }
}

/// Global singleton that stores the currently active display settings.
/// Populated at startup and updated whenever the user changes settings.
class AppConfig {
  AppConfig._();

  static String currency = 'UZS';
  static bool compactNumbers = false;

  /// Call once at startup with the persisted settings.
  static Future<void> initialize() async {
    final settings = await SettingsRepository().load();
    currency = settings.currency;
    compactNumbers = settings.compactNumbers;
  }

  /// Call after saving new settings so the change is instant app-wide.
  static void update(AppSettings settings) {
    currency = settings.currency;
    compactNumbers = settings.compactNumbers;
  }
}

