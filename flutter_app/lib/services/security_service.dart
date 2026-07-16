import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SecurityService {
  static final _auth = LocalAuthentication();
  static const _pinEnabledKey = 'security_pin_enabled';
  static const _pinCodeKey = 'security_pin_code';
  static const _biometricsEnabledKey = 'security_biometrics_enabled';

  static Future<bool> isPinEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_pinEnabledKey) ?? false;
  }

  static Future<String?> getPinCode() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_pinCodeKey);
  }

  static Future<void> setPinCode(String pin) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_pinEnabledKey, true);
    await prefs.setString(_pinCodeKey, pin);
  }

  static Future<void> disablePin() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_pinEnabledKey, false);
    await prefs.remove(_pinCodeKey);
    await prefs.setBool(_biometricsEnabledKey, false);
  }

  static Future<bool> isBiometricsEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_biometricsEnabledKey) ?? false;
  }

  static Future<void> setBiometricsEnabled(bool enabled) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_biometricsEnabledKey, enabled);
  }

  static Future<bool> canUseBiometrics() async {
    try {
      final isAvailable = await _auth.canCheckBiometrics;
      final isDeviceSupported = await _auth.isDeviceSupported();
      return isAvailable && isDeviceSupported;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> authenticateBiometrics() async {
    try {
      final canCheck = await canUseBiometrics();
      if (!canCheck) return false;

      return await _auth.authenticate(
        localizedReason: 'Ilovaga xavfsiz kirish uchun Face ID biometriyasidan foydalaning',
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: true,
        ),
      );
    } catch (_) {
      return false;
    }
  }
}
