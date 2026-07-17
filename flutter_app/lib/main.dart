import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'firebase_options.dart';
import 'l10n/strings.dart';
import 'services/notification_service.dart';
import 'services/currency_service.dart';
import 'theme/app_theme.dart';
import 'screens/splash_screen.dart';

const supabaseUrl = 'https://djreovvpojsiccndlgzu.supabase.co';
const supabaseAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqcmVvdnZwb2pzaWNjbmRsZ3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NzMzOTksImV4cCI6MjA5NTA0OTM5OX0.fgaat8STrBIj6WC_p98zYN3Tfp6kScDKYXuHk1lLDKk';

late final SupabaseClient supabase;
final navigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
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
        ),
      ),
    );
  }
}
