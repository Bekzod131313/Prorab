import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'data/settings_repository.dart';
import 'theme/app_theme.dart';
import 'screens/splash_screen.dart';

const supabaseUrl = 'https://djreovvpojsiccndlgzu.supabase.co';
const supabaseAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqcmVvdnZwb2pzaWNjbmRsZ3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NzMzOTksImV4cCI6MjA5NTA0OTM5OX0.fgaat8STrBIj6WC_p98zYN3Tfp6kScDKYXuHk1lLDKk';

late final SupabaseClient supabase;

/// Notifier that fires whenever the user changes currency or number format.
/// Listen to it in any StatefulWidget that calls formatMoney() and needs to
/// update immediately on settings change.
final settingsNotifier = ValueNotifier<int>(0);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(url: supabaseUrl, anonKey: supabaseAnonKey);
  supabase = Supabase.instance.client;
  // ✅ Load persisted currency/compact settings before the first frame
  await AppConfig.initialize();
  runApp(const MoliyaApp());
}

class MoliyaApp extends StatefulWidget {
  const MoliyaApp({super.key});

  @override
  State<MoliyaApp> createState() => _MoliyaAppState();
}

class _MoliyaAppState extends State<MoliyaApp> {
  @override
  void initState() {
    super.initState();
    // Rebuild the whole app when settings change so formatMoney() shows new values
    settingsNotifier.addListener(_onSettingsChanged);
  }

  @override
  void dispose() {
    settingsNotifier.removeListener(_onSettingsChanged);
    super.dispose();
  }

  void _onSettingsChanged() => setState(() {});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Moliya',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.dark,
      home: const SplashScreen(),
    );
  }
}
