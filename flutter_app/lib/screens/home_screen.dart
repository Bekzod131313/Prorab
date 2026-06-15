import 'package:flutter/material.dart';

import '../main.dart';
import '../theme/app_theme.dart';
import '../widgets/moliya_logo.dart';
import 'auth_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  Future<void> _signOut(BuildContext context) async {
    await supabase.auth.signOut();
    if (!context.mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const AuthScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = supabase.auth.currentUser;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Row(
          children: const [
            MoliyaLogo(size: 28),
            SizedBox(width: 10),
            Text('Moliya'),
          ],
        ),
        actions: [
          IconButton(
            onPressed: () => _signOut(context),
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.dashboard_rounded, size: 56, color: AppColors.accentTeal),
              const SizedBox(height: 16),
              Text(
                'Xush kelibsiz!',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              Text(
                user?.email ?? '',
                style: TextStyle(color: AppColors.text2),
              ),
              const SizedBox(height: 24),
              Text(
                'Loyihalar va hisobotlar bu yerda paydo bo\'ladi.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.muted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
