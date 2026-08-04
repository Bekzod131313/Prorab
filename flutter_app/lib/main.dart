import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'package:flutter_native_splash/flutter_native_splash.dart';

import 'firebase_options.dart';
import 'l10n/strings.dart';
import 'services/notification_service.dart';
import 'services/currency_service.dart';
import 'theme/app_theme.dart';
import 'screens/splash_screen.dart';
import 'utils/haptics.dart';

const supabaseUrl = 'https://djreovvpojsiccndlgzu.supabase.co';
const supabaseAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqcmVvdnZwb2pzaWNjbmRsZ3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NzMzOTksImV4cCI6MjA5NTA0OTM5OX0.fgaat8STrBIj6WC_p98zYN3Tfp6kScDKYXuHk1lLDKk';

late final SupabaseClient supabase;
final navigatorKey = GlobalKey<NavigatorState>();

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
  await NotificationService.initialize();
  runApp(const MoliyaApp());
}

class MoliyaApp extends StatelessWidget {
  const MoliyaApp({super.key});

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
          home: const SplashScreen(),
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
