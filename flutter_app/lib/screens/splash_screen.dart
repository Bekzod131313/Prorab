import 'dart:io';
import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';

import '../main.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import 'auth_screen.dart';
import 'root_shell.dart';
import 'profile_setup_screen.dart';
import 'pin_lock_screen.dart';
import '../services/security_service.dart';
import '../data/session_repository.dart';

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
    if (!mounted) return;

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
          FlutterNativeSplash.remove();
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
      // Proceed on check fail (offline / server issues / timeout)
    }

    FlutterNativeSplash.remove();
    final session = supabase.auth.currentSession;
    if (session == null) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const AuthScreen()),
      );
    } else {
      // Register current device active session
      SessionRepository().registerCurrentDevice();

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
          backgroundColor: const Color(0xFFF3F4FA),
          body: SafeArea(
            child: Stack(
              children: [
                // Centered logo + tagline
                Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // White rounded card for logo
                      Container(
                        width: 160,
                        height: 160,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(36),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.04),
                              blurRadius: 20,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        padding: const EdgeInsets.all(20),
                        child: Image.asset(
                          'assets/logo.png',
                          fit: BoxFit.contain,
                        ),
                      ),
                      const SizedBox(height: 24),
                      // Tagline
                      Text(
                        tr('tagline'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF49515B),
                          letterSpacing: -0.1,
                        ),
                      ),
                    ],
                  ),
                ),

                // Version at the bottom
                Positioned(
                  bottom: 32,
                  left: 0,
                  right: 0,
                  child: Text(
                    _version.isNotEmpty ? _version : 'v1.0.0 (9)',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 13,
                      color: Color(0xFF979EA6),
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
