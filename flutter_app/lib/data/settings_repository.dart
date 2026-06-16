import 'package:shared_preferences/shared_preferences.dart';

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
