import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import 'analytics_screen.dart';
import 'dashboard_screen.dart';
import 'profile_screen.dart';
import 'projects_screen.dart';
import 'workers_screen.dart';

class RootShell extends StatefulWidget {
  const RootShell({super.key});
  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> {
  int _index = 0;

  static const _screens = [
    DashboardScreen(),
    ProjectsScreen(),
    AnalyticsScreen(),
    WorkersScreen(),
    ProfileScreen(),
  ];

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
      builder: (_, __, ___) => Scaffold(
        backgroundColor: AppColors.bg,
        body: IndexedStack(index: _index, children: _screens),
        bottomNavigationBar: Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: AppColors.border)),
          ),
          child: SafeArea(
            child: SizedBox(
              height: 60,
              child: Row(
                children: List.generate(_icons.length, (i) {
                  final (outIcon, selIcon) = _icons[i];
                  final selected = _index == i;
                  return Expanded(
                    child: InkWell(
                      onTap: () => setState(() => _index = i),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(selected ? selIcon : outIcon, size: 22,
                            color: selected ? AppColors.accent : AppColors.muted),
                          const SizedBox(height: 2),
                          Text(tr(_keys[i]), style: TextStyle(fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: selected ? AppColors.accent : AppColors.muted)),
                        ],
                      ),
                    ),
                  );
                }),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
