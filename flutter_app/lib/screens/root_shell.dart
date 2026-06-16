import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import 'dashboard_screen.dart';
import 'projects_screen.dart';
import 'workers_screen.dart';
import 'analytics_screen.dart';

class RootShell extends StatefulWidget {
  const RootShell({super.key});
  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: IndexedStack(index: _index, children: const [
        DashboardScreen(),
        ProjectsScreen(),
        SizedBox(), // placeholder for FAB
        AnalyticsScreen(),
        WorkersScreen(),
      ]),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: AppColors.border)),
        ),
        child: SafeArea(
          child: SizedBox(
            height: 60,
            child: Row(
              children: [
                _NavItem(icon: Icons.home_rounded, label: 'Asosiy', selected: _index == 0, onTap: () => setState(() => _index = 0)),
                _NavItem(icon: Icons.folder_rounded, label: 'Loyihalar', selected: _index == 1, onTap: () => setState(() => _index = 1)),
                // Center FAB
                Expanded(
                  child: Center(
                    child: GestureDetector(
                      onTap: () {
                        // Navigate to projects and trigger add
                        setState(() => _index = 1);
                      },
                      child: Container(
                        width: 48, height: 48,
                        decoration: BoxDecoration(
                          color: AppColors.accent,
                          shape: BoxShape.circle,
                          boxShadow: [BoxShadow(color: AppColors.accent.withOpacity(0.3), blurRadius: 8, offset: Offset(0, 4))],
                        ),
                        child: const Icon(Icons.add_rounded, color: Colors.white, size: 28),
                      ),
                    ),
                  ),
                ),
                _NavItem(icon: Icons.bar_chart_rounded, label: 'Analitika', selected: _index == 3, onTap: () => setState(() => _index = 3)),
                _NavItem(icon: Icons.people_rounded, label: 'Odamlar', selected: _index == 4, onTap: () => setState(() => _index = 4)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _NavItem({required this.icon, required this.label, required this.selected, required this.onTap});
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 22, color: selected ? AppColors.accent : AppColors.muted),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: selected ? AppColors.accent : AppColors.muted)),
          ],
        ),
      ),
    );
  }
}
