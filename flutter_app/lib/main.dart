import 'dart:async';
import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'firebase_options.dart';
import 'l10n/strings.dart';
import 'services/notification_service.dart';
import 'services/currency_service.dart';
import 'services/security_service.dart';
import 'data/session_repository.dart';
import 'theme/app_theme.dart';
import 'screens/auth_screen.dart';
import 'screens/root_shell.dart';
import 'screens/profile_setup_screen.dart';
import 'screens/pin_lock_screen.dart';
import 'screens/force_update_screen.dart';
import 'utils/haptics.dart';

const supabaseUrl = 'https://djreovvpojsiccndlgzu.supabase.co';
const supabaseAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqcmVvdnZwb2pzaWNjbmRsZ3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NzMzOTksImV4cCI6MjA5NTA0OTM5OX0.fgaat8STrBIj6WC_p98zYN3Tfp6kScDKYXuHk1lLDKk';

late final SupabaseClient supabase;
final navigatorKey = GlobalKey<NavigatorState>();

bool _isVersionOlder(String current, String required) {
  final currentParts = current.split('.').map((e) => int.tryParse(e) ?? 0).toList();
  final requiredParts = required.split('.').map((e) => int.tryParse(e) ?? 0).toList();
  final maxLen = currentParts.length > requiredParts.length ? currentParts.length : requiredParts.length;
  for (var i = 0; i < maxLen; i++) {
    final cur = i < currentParts.length ? currentParts[i] : 0;
    final req = i < requiredParts.length ? requiredParts[i] : 0;
    if (cur < req) return true;
    if (cur > req) return false;
  }
  return false;
}

Future<Widget> _determineInitialScreen() async {
  // 1. Force update check
  try {
    final res = await supabase
        .from('app_versions')
        .select()
        .order('created_at', ascending: false)
        .limit(1)
        .maybeSingle()
        .timeout(const Duration(seconds: 2));

    if (res != null) {
      final packageInfo = await PackageInfo.fromPlatform();
      final currentVersion = packageInfo.version;
      final currentBuild = int.tryParse(packageInfo.buildNumber) ?? 0;

      String requiredVersion = '1.0.0';
      int requiredBuild = 1;
      String updateUrl = 'https://google.com';

      if (Platform.isIOS) {
        requiredVersion = res['appstore_version']?.toString() ?? '1.0.0';
        requiredBuild = (res['appstore_build_number'] as num?)?.toInt() ?? 1;
        updateUrl = res['appstore_url']?.toString() ?? 'https://apps.apple.com';
      } else if (Platform.isAndroid) {
        requiredVersion = res['playmarket_version']?.toString() ?? '1.0.0';
        requiredBuild = (res['playmarket_build_number'] as num?)?.toInt() ?? 1;
        updateUrl = res['playmarket_url']?.toString() ?? 'https://play.google.com';
      }

      bool needsUpdate = false;
      if (_isVersionOlder(currentVersion, requiredVersion)) {
        needsUpdate = true;
      } else if (currentVersion == requiredVersion && currentBuild < requiredBuild) {
        needsUpdate = true;
      }

      if (needsUpdate) {
        return ForceUpdateScreen(
          currentVersion: currentVersion,
          currentBuild: currentBuild,
          requiredVersion: requiredVersion,
          requiredBuild: requiredBuild,
          updateUrl: updateUrl,
        );
      }
    }
  } catch (_) {}

  // 2. Auth Session Check
  final session = supabase.auth.currentSession;
  if (session == null) {
    return const AuthScreen();
  }

  // 3. Register current device
  SessionRepository().registerCurrentDevice();

  // 4. Profile completeness check
  String? fullName;
  try {
    final profileData = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .maybeSingle();
    fullName = profileData?['full_name'] as String?;
  } catch (e) {
    debugPrint('Profile check error: $e');
  }

  if (fullName == null || fullName.trim().isEmpty) {
    return const ProfileSetupScreen();
  }

  // 5. PIN Lock Check
  final pinEnabled = await SecurityService.isPinEnabled();
  if (pinEnabled) {
    return const PinLockScreen(mode: PinLockMode.validation);
  }

  return const RootShell();
}

Future<void> main() async {
  final widgetsBinding = WidgetsFlutterBinding.ensureInitialized();
  FlutterNativeSplash.preserve(widgetsBinding: widgetsBinding);
  PaintingBinding.instance.imageCache.maximumSize = 1000;
  PaintingBinding.instance.imageCache.maximumSizeBytes = 200 * 1024 * 1024;

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  await initializeDateFormatting();
  await Supabase.initialize(url: supabaseUrl, anonKey: supabaseAnonKey);
  supabase = Supabase.instance.client;
  await loadSavedLocale();
  await CurrencyService().init();
  unawaited(NotificationService.initialize());

  final initialScreen = await _determineInitialScreen();

  runApp(MoliyaApp(initialScreen: initialScreen));
}

class MoliyaApp extends StatelessWidget {
  final Widget initialScreen;
  const MoliyaApp({super.key, required this.initialScreen});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: appLocaleNotifier,
      builder: (_, lang, ___) => ValueListenableBuilder<String>(
        valueListenable: CurrencyService().displayCurrencyNotifier,
        builder: (_, __, ___) => MaterialApp(
          navigatorKey: navigatorKey,
          title: 'Risq',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light,
          themeMode: ThemeMode.light,
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [
            Locale('uz'),
            Locale('ru'),
            Locale('en'),
          ],
          locale: Locale(lang),
          home: _InitialHost(initialScreen: initialScreen),
          builder: (context, child) {
            final bottomInset = MediaQuery.of(context).viewInsets.bottom;
            final isKeyboardVisible = bottomInset > 80;

            return Stack(
              children: [
                child ?? const SizedBox(),
                if (isKeyboardVisible)
                  Positioned(
                    right: 16,
                    bottom: bottomInset + 12,
                    child: Material(
                      color: Colors.transparent,
                      elevation: 6,
                      shape: const CircleBorder(),
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: () {
                          AppHaptics.light();
                          FocusManager.instance.primaryFocus?.unfocus();
                        },
                        child: Container(
                          width: 44,
                          height: 44,
                          decoration: const BoxDecoration(
                            color: AppColors.accent,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.keyboard_hide_rounded,
                            color: Colors.white,
                            size: 22,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _InitialHost extends StatefulWidget {
  final Widget initialScreen;
  const _InitialHost({required this.initialScreen});

  @override
  State<_InitialHost> createState() => _InitialHostState();
}

class _InitialHostState extends State<_InitialHost> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      FlutterNativeSplash.remove();
    });
  }

  @override
  Widget build(BuildContext context) {
    return widget.initialScreen;
  }
}
