import 'dart:io';
import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../main.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import 'auth_screen.dart';
import 'root_shell.dart';
import 'profile_setup_screen.dart';
import 'pin_lock_screen.dart';
import '../services/security_service.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {

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

  void _showForceUpdateDialog(
    String currentVersion,
    int currentBuild,
    String requiredVersion,
    int requiredBuild,
    String updateUrl,
  ) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => PopScope(
        canPop: false,
        child: AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.orange.withOpacity(0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.system_update_rounded, color: AppColors.orange, size: 24),
              ),
              const SizedBox(width: 12),
              Text(tr('update_required'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                tr('update_msg'),
                style: const TextStyle(fontSize: 13, color: AppColors.text2, height: 1.4),
              ),
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.bg,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(tr('current_version'), style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                        Text("$currentVersion ($currentBuild)", style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.text)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(tr('new_version'), style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                        Text("$requiredVersion ($requiredBuild)", style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.green)),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          actions: [
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.accent,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  elevation: 0,
                ),
                onPressed: () async {
                  final uri = Uri.tryParse(updateUrl);
                  if (uri != null && await canLaunchUrl(uri)) {
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                  }
                },
                child: Text(tr('update_btn'), style: const TextStyle(fontWeight: FontWeight.w800, color: Colors.white)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _route() async {
    await Future.delayed(const Duration(milliseconds: 500));
    if (!mounted) return;

    try {
      final res = await supabase
          .from('app_versions')
          .select()
          .order('created_at', ascending: false)
          .limit(1)
          .maybeSingle();

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
          _showForceUpdateDialog(
            currentVersion,
            currentBuild,
            requiredVersion,
            requiredBuild,
            updateUrl,
          );
          return;
        }
      }
    } catch (_) {
      // Proceed on check fail (offline / server issues)
    }

    final session = supabase.auth.currentSession;
    if (session == null) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const AuthScreen()),
      );
    } else {
      // Check if user has completed profile
      String? fullName;
      try {
        final profileData = await supabase.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle();
        fullName = profileData?['full_name'] as String?;
      } catch (e) {
        debugPrint('Splash profile check error: $e');
      }

      if (!mounted) return;
      if (fullName == null || fullName.trim().isEmpty) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const ProfileSetupScreen()),
        );
      } else {
        final pinEnabled = await SecurityService.isPinEnabled();
        if (!mounted) return;
        if (pinEnabled) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => const PinLockScreen(mode: PinLockMode.validation)),
          );
        } else {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => const RootShell()),
          );
        }
      }
    }
  }

  String _version = '';

  @override
  void initState() {
    super.initState();
    _loadVersion();
    _route();
  }

  Future<void> _loadVersion() async {
    try {
      final info = await PackageInfo.fromPlatform();
      if (mounted) {
        setState(() {
          _version = 'v${info.version} (${info.buildNumber})';
        });
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: appLocaleNotifier,
      builder: (context, locale, _) {
        return Scaffold(
          backgroundColor: AppColors.bg,
          body: SafeArea(
            child: Stack(
              children: [
                // Centered logo + tagline
                Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Logo with rounded corners
                      ClipRRect(
                        borderRadius: BorderRadius.circular(28),
                        child: Image.asset(
                          'assets/logo.png',
                          width: 140,
                          height: 140,
                          fit: BoxFit.contain,
                        ),
                      ),
                      const SizedBox(height: 20),
                      // Tagline
                      Text(
                        tr('tagline'),
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: AppColors.text2,
                          letterSpacing: 0.2,
                        ),
                      ),
                    ],
                  ),
                ),

                // Version at the bottom
                if (_version.isNotEmpty)
                  Positioned(
                    bottom: 24,
                    left: 0,
                    right: 0,
                    child: Text(
                      _version,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.muted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}
