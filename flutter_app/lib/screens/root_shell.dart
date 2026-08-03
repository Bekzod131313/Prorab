import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../services/currency_service.dart';
import 'analytics_screen.dart';
import 'dashboard_screen.dart';
import 'profile_screen.dart';
import 'projects_screen.dart';
import 'workers_screen.dart';
import 'auth_screen.dart';
import '../data/session_repository.dart';
import '../main.dart';
import '../utils/haptics.dart';

class RootShell extends StatefulWidget {
  const RootShell({super.key});

  static RootShellState? of(BuildContext context) {
    return context.findAncestorStateOfType<RootShellState>();
  }

  @override
  State<RootShell> createState() => RootShellState();
}

class RootShellState extends State<RootShell> {
  int _index = 0;
  StreamSubscription<AuthState>? _authSub;
  Timer? _sessionCheckTimer;
  bool _loggingOut = false;

  @override
  void initState() {
    super.initState();
    _authSub = supabase.auth.onAuthStateChange.listen((data) {
      if (data.event == AuthChangeEvent.signedOut || (data.session == null && data.event != AuthChangeEvent.initialSession)) {
        _forceLogout();
      }
    });

    _sessionCheckTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      _checkSession();
    });
  }

  Future<void> _checkSession() async {
    if (_loggingOut) return;
    final isTerminated = await SessionRepository.isCurrentSessionTerminated();
    if (isTerminated && mounted) {
      _forceLogout();
    }
  }

  Future<void> _forceLogout() async {
    if (_loggingOut) return;
    _loggingOut = true;
    try {
      await supabase.auth.signOut();
    } catch (_) {}
    if (mounted) {
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const AuthScreen()),
        (route) => false,
      );
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr('session_terminated'))),
      );
    }
  }

  @override
  void dispose() {
    _authSub?.cancel();
    _sessionCheckTimer?.cancel();
    super.dispose();
  }

  void setIndex(int index) {
    AppHaptics.selection();
    setState(() => _index = index);
  }

  static const _icons = [
    (Icons.home_outlined, Icons.home_rounded),
    (Icons.folder_outlined, Icons.folder_rounded),
    (Icons.bar_chart_outlined, Icons.bar_chart_rounded),
    (Icons.people_outline_rounded, Icons.people_rounded),
    (Icons.person_outline_rounded, Icons.person_rounded),
  ];

  static const _keys = ['nav_home', 'nav_projects', 'nav_report', 'nav_workers', 'nav_profile'];

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: appLocaleNotifier,
      builder: (_, __, ___) => ValueListenableBuilder<String>(
        valueListenable: CurrencyService().displayCurrencyNotifier,
        builder: (_, activeCurrency, ___) => Scaffold(
          backgroundColor: AppColors.bg,
          body: IndexedStack(
            index: _index,
            children: [
              DashboardScreen(
                key: ValueKey('db_$activeCurrency'),
                isActive: _index == 0,
              ),
              ProjectsScreen(key: ValueKey('pr_$activeCurrency')),
              AnalyticsScreen(key: ValueKey('an_$activeCurrency')),
              WorkersScreen(key: ValueKey('wk_$activeCurrency')),
              ProfileScreen(key: ValueKey('pf_$activeCurrency')),
            ],
          ),
        bottomNavigationBar: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.06),
                blurRadius: 10,
                offset: const Offset(0, -2),
              ),
            ],
            border: const Border(top: BorderSide(color: AppColors.border, width: 1.2)),
          ),
          child: SafeArea(
            child: SizedBox(
              height: 72,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                child: Row(
                  children: List.generate(_icons.length, (i) {
                    final (outIcon, selIcon) = _icons[i];
                    final selected = _index == i;
                    return Expanded(
                      child: InkWell(
                        onTap: () {
                          AppHaptics.selection();
                          setState(() => _index = i);
                        },
                        borderRadius: BorderRadius.circular(16),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          decoration: BoxDecoration(
                            color: selected ? AppColors.accent.withOpacity(0.12) : Colors.transparent,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                selected ? selIcon : outIcon,
                                size: selected ? 26 : 24,
                                color: selected ? AppColors.accent : const Color(0xFF475569),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                tr(_keys[i]),
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: selected ? FontWeight.w800 : FontWeight.w700,
                                  color: selected ? AppColors.accent : const Color(0xFF475569),
                                  letterSpacing: -0.2,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
}
