import 'package:flutter/material.dart';

import '../l10n/strings.dart';
import '../services/security_service.dart';
import '../theme/app_theme.dart';
import 'pin_lock_screen.dart';

class SecuritySettingsScreen extends StatefulWidget {
  const SecuritySettingsScreen({super.key});

  @override
  State<SecuritySettingsScreen> createState() => _SecuritySettingsScreenState();
}

class _SecuritySettingsScreenState extends State<SecuritySettingsScreen> {
  bool _pinLockEnabled = false;
  bool _biometricsEnabled = false;
  bool _canUseBiometrics = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    setState(() => _loading = true);
    final pinEnabled = await SecurityService.isPinEnabled();
    final bioEnabled = await SecurityService.isBiometricsEnabled();
    final canBio = await SecurityService.canUseBiometrics();
    if (mounted) {
      setState(() {
        _pinLockEnabled = pinEnabled;
        _biometricsEnabled = bioEnabled;
        _canUseBiometrics = canBio;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: appLocaleNotifier,
      builder: (_, lang, ___) {
        final isUz = lang == 'uz';

        return Scaffold(
          backgroundColor: AppColors.bg,
          appBar: AppBar(
            backgroundColor: AppColors.bg,
            surfaceTintColor: Colors.transparent,
            elevation: 0,
            leading: IconButton(
              icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: AppColors.text),
              onPressed: () => Navigator.of(context).pop(),
            ),
            title: Text(
              isUz ? "Xavfsizlik va PIN-kod" : "Безопасность и PIN",
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.text),
            ),
            centerTitle: true,
          ),
          body: _loading
              ? const Center(child: CircularProgressIndicator())
              : ListView(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                  children: [
                    // Header Card
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: AppColors.card,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Column(
                        children: [
                          Container(
                            width: 64,
                            height: 64,
                            decoration: BoxDecoration(
                              color: AppColors.accent.withOpacity(0.12),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.security_rounded,
                              size: 32,
                              color: AppColors.accent,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            isUz ? "Ilova xavfsizligi" : "Безопасность приложения",
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.text),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            isUz
                                ? "PIN-kod va biometriya orqali ma'lumotlaringizni begona ko'zlardan himoya qiling."
                                : "Защитите свои данные с помощью PIN-кода и биометрии.",
                            textAlign: TextAlign.center,
                            style: const TextStyle(fontSize: 13, color: AppColors.muted, height: 1.4),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Grouped Passcode Card
                    _GroupCard(
                      headerTitle: isUz ? "PIN-KOD SOZLAMALARI" : "НАСТРОЙКИ PIN-КОДА",
                      children: [
                        if (!_pinLockEnabled) ...[
                          _SettingTile(
                            leading: const _BadgeIcon(icon: Icons.lock_outline_rounded, color: Color(0xFFFF9500)),
                            title: isUz ? "PIN-kodni yoqish" : "Включить PIN-код",
                            trailing: const Icon(Icons.chevron_right_rounded, size: 20, color: AppColors.muted),
                            onTap: () async {
                              final success = await Navigator.of(context).push<bool>(
                                MaterialPageRoute(
                                  builder: (_) => const PinLockScreen(mode: PinLockMode.setup),
                                ),
                              );
                              if (success == true) {
                                await _loadSettings();
                              }
                            },
                          ),
                        ] else ...[
                          _SettingTile(
                            leading: const _BadgeIcon(icon: Icons.lock_reset_rounded, color: Color(0xFF007AFF)),
                            title: isUz ? "PIN-kodni o'zgartirish" : "Изменить PIN-код",
                            trailing: const Icon(Icons.chevron_right_rounded, size: 20, color: AppColors.muted),
                            onTap: () async {
                              final success = await Navigator.of(context).push<bool>(
                                MaterialPageRoute(
                                  builder: (_) => const PinLockScreen(mode: PinLockMode.setup),
                                ),
                              );
                              if (success == true) {
                                await _loadSettings();
                              }
                            },
                          ),
                          _SettingTile(
                            leading: const _BadgeIcon(icon: Icons.lock_open_rounded, color: Color(0xFFFF3B30)),
                            title: isUz ? "PIN-kodni o'chirish" : "Выключить PIN-код",
                            titleColor: AppColors.red,
                            trailing: const Icon(Icons.chevron_right_rounded, size: 20, color: AppColors.muted),
                            onTap: () async {
                              final success = await Navigator.of(context).push<bool>(
                                MaterialPageRoute(
                                  builder: (_) => const PinLockScreen(mode: PinLockMode.confirmDisable),
                                ),
                              );
                              if (success == true) {
                                await _loadSettings();
                              }
                            },
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Biometrics Section (if PIN is active & biometrics supported)
                    if (_pinLockEnabled && _canUseBiometrics) ...[
                      _GroupCard(
                        headerTitle: isUz ? "BIOMETRIYA" : "БИОМЕТРИЯ",
                        children: [
                          _SettingTile(
                            leading: const _BadgeIcon(icon: Icons.fingerprint_rounded, color: Color(0xFF5856D6)),
                            title: isUz ? "Face ID / Barmoq izi" : "Face ID / Отпечаток пальца",
                            subtitle: isUz ? "Tezkor va xavfsiz kirish" : "Быстрый и безопасный вход",
                            trailing: Switch.adaptive(
                              value: _biometricsEnabled,
                              activeTrackColor: AppColors.accent,
                              onChanged: (val) async {
                                await SecurityService.setBiometricsEnabled(val);
                                await _loadSettings();
                              },
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
        );
      },
    );
  }
}

class _BadgeIcon extends StatelessWidget {
  final IconData icon;
  final Color color;
  const _BadgeIcon({required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 30,
      height: 30,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(7),
      ),
      child: Icon(icon, color: Colors.white, size: 17),
    );
  }
}

class _GroupCard extends StatelessWidget {
  final String headerTitle;
  final List<Widget> children;
  const _GroupCard({required this.headerTitle, required this.children});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 16, bottom: 6),
          child: Text(
            headerTitle,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppColors.muted,
              letterSpacing: 0.5,
            ),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            children: [
              for (int i = 0; i < children.length; i++) ...[
                children[i],
                if (i < children.length - 1)
                  const Padding(
                    padding: EdgeInsets.only(left: 60),
                    child: Divider(height: 1, thickness: 0.8, color: AppColors.border),
                  ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _SettingTile extends StatelessWidget {
  final Widget leading;
  final String title;
  final Color? titleColor;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  const _SettingTile({
    required this.leading,
    required this.title,
    this.titleColor,
    this.subtitle,
    this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            leading,
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: titleColor ?? AppColors.text,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle!,
                      style: const TextStyle(fontSize: 12, color: AppColors.muted),
                    ),
                  ],
                ],
              ),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      ),
    );
  }
}
