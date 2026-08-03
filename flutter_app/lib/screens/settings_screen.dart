import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/profile_repository.dart';
import '../l10n/strings.dart';
import '../models/profile.dart';
import '../services/currency_service.dart';
import '../services/security_service.dart';
import '../theme/app_theme.dart';
import 'admin_panel_screen.dart';
import 'security_settings_screen.dart';
import 'active_devices_screen.dart';
import 'splash_screen.dart';

class SettingsScreen extends StatefulWidget {
  final Profile? profile;
  const SettingsScreen({super.key, this.profile});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _pinLockEnabled = false;
  bool _hasChanged = false;

  @override
  void initState() {
    super.initState();
    _loadSecuritySettings();
  }

  Future<void> _loadSecuritySettings() async {
    final pinEnabled = await SecurityService.isPinEnabled();
    if (mounted) {
      setState(() {
        _pinLockEnabled = pinEnabled;
      });
    }
  }

  void _showLanguageBottomSheet() {
    final currentLang = appLocaleNotifier.value;
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                tr('language'),
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.text),
              ),
              const SizedBox(height: 16),
              _SelectOptionTile(
                title: "O'zbekcha",
                subtitle: "O'zbek tili",
                isSelected: currentLang == 'uz',
                onTap: () {
                  setLocale('uz');
                  _hasChanged = true;
                  Navigator.of(ctx).pop();
                },
              ),
              const SizedBox(height: 8),
              _SelectOptionTile(
                title: "Русский",
                subtitle: "Русский язык",
                isSelected: currentLang == 'ru',
                onTap: () {
                  setLocale('ru');
                  _hasChanged = true;
                  Navigator.of(ctx).pop();
                },
              ),
              const SizedBox(height: 8),
              _SelectOptionTile(
                title: "English",
                subtitle: "English language",
                isSelected: currentLang == 'en',
                onTap: () {
                  setLocale('en');
                  _hasChanged = true;
                  Navigator.of(ctx).pop();
                },
              ),
            ],
          ),
        );
      },
    );
  }

  void _showCurrencyBottomSheet() {
    final currentCurrency = CurrencyService().displayCurrencyNotifier.value;
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                tr('currency'),
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppColors.text),
              ),
              const SizedBox(height: 16),
              _SelectOptionTile(
                title: "O'zbek so'mi (UZS)",
                subtitle: "So'm",
                isSelected: currentCurrency == 'UZS',
                onTap: () {
                  CurrencyService().setDisplayCurrency('UZS');
                  _hasChanged = true;
                  Navigator.of(ctx).pop();
                },
              ),
              const SizedBox(height: 8),
              _SelectOptionTile(
                title: "AQSh dollari (USD)",
                subtitle: "\$ Dollar",
                isSelected: currentCurrency == 'USD',
                onTap: () {
                  CurrencyService().setDisplayCurrency('USD');
                  _hasChanged = true;
                  Navigator.of(ctx).pop();
                },
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: appLocaleNotifier,
      builder: (_, lang, ___) {
        String langLabel;
        if (lang == 'en') {
          langLabel = "English";
        } else if (lang == 'ru') {
          langLabel = "Русский";
        } else {
          langLabel = "O'zbekcha";
        }

        return Scaffold(
            backgroundColor: AppColors.bg,
            appBar: AppBar(
              backgroundColor: AppColors.bg,
              surfaceTintColor: Colors.transparent,
              elevation: 0,
              leading: IconButton(
                icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: AppColors.text),
                onPressed: () => Navigator.of(context).pop(_hasChanged),
              ),
              title: Text(
                tr('settings'),
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.text),
              ),
              centerTitle: true,
            ),
          body: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            children: [
              // ── Security Card ──────────────────────────────────────────────
              _SettingsGroupCard(
                headerTitle: tr('security'),
                children: [
                  _SettingsTile(
                    leading: const _SettingsIconBadge(
                      icon: Icons.lock_rounded,
                      color: Color(0xFFFF9500),
                    ),
                    title: tr('security_and_pin'),
                    subtitle: _pinLockEnabled ? tr('enabled') : tr('disabled'),
                    trailing: const Icon(Icons.chevron_right_rounded, size: 20, color: AppColors.muted),
                    onTap: () async {
                      await Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const SecuritySettingsScreen()),
                      );
                      _loadSecuritySettings();
                    },
                  ),
                  _SettingsTile(
                    leading: const _SettingsIconBadge(
                      icon: Icons.devices_rounded,
                      color: Color(0xFF007AFF),
                    ),
                    title: tr('active_devices'),
                    subtitle: tr('active_devices_sub'),
                    trailing: const Icon(Icons.chevron_right_rounded, size: 20, color: AppColors.muted),
                    onTap: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const ActiveDevicesScreen()),
                      );
                    },
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // ── App Preferences Card (Language & Currency) ─────────────────
              _SettingsGroupCard(
                headerTitle: tr('app_settings'),
                children: [
                  _SettingsTile(
                    leading: const _SettingsIconBadge(
                      icon: Icons.language_rounded,
                      color: Color(0xFFAF52DE),
                    ),
                    title: tr('language'),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          langLabel,
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.muted),
                        ),
                        const SizedBox(width: 4),
                        const Icon(Icons.chevron_right_rounded, size: 20, color: AppColors.muted),
                      ],
                    ),
                    onTap: _showLanguageBottomSheet,
                  ),
                  ValueListenableBuilder<String>(
                    valueListenable: CurrencyService().displayCurrencyNotifier,
                    builder: (ctx, activeCurrency, _) => _SettingsTile(
                      leading: const _SettingsIconBadge(
                        icon: Icons.payments_rounded,
                        color: Color(0xFF30B0C7),
                      ),
                      title: tr('currency'),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            activeCurrency == 'UZS' ? "UZS (so'm)" : "USD (\$)",
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.muted),
                          ),
                          const SizedBox(width: 4),
                          const Icon(Icons.chevron_right_rounded, size: 20, color: AppColors.muted),
                        ],
                      ),
                      onTap: _showCurrencyBottomSheet,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // ── Admin Panel Card (If Admin) ──────────────────────────────────
              if (widget.profile?.isAdmin == true) ...[
                _SettingsGroupCard(
                  children: [
                    _SettingsTile(
                      leading: const _SettingsIconBadge(
                        icon: Icons.admin_panel_settings_rounded,
                        color: Color(0xFFFF3B30),
                      ),
                      title: "Admin Panel",
                      subtitle: tr('admin_panel_sub'),
                      trailing: const Icon(Icons.chevron_right_rounded, size: 20, color: AppColors.muted),
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const AdminPanelScreen()),
                        );
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 16),
              ],

              // ── Account Actions Card (Logout & Delete) ─────────────────────
              _SettingsGroupCard(
                headerTitle: tr('account'),
                children: [
                  _SettingsTile(
                    leading: const _SettingsIconBadge(
                      icon: Icons.logout_rounded,
                      color: Color(0xFF8E8E93),
                    ),
                    title: tr('logout'),
                    trailing: const Icon(Icons.chevron_right_rounded, size: 20, color: AppColors.muted),
                    onTap: () async {
                      final confirm = await showDialog<bool>(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          title: Text(tr('logout_confirm_title')),
                          content: Text(tr('logout_confirm_body')),
                          actions: [
                            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(tr('cancel'))),
                            ElevatedButton(
                              onPressed: () => Navigator.of(ctx).pop(true),
                              child: Text(tr('logout_yes')),
                            ),
                          ],
                        ),
                      );
                      if (confirm == true) {
                        await Supabase.instance.client.auth.signOut();
                        if (context.mounted) {
                          Navigator.of(context).pushAndRemoveUntil(
                            MaterialPageRoute(builder: (_) => const SplashScreen()),
                            (_) => false,
                          );
                        }
                      }
                    },
                  ),
                  _SettingsTile(
                    leading: const _SettingsIconBadge(
                      icon: Icons.delete_forever_rounded,
                      color: Color(0xFFFF3B30),
                    ),
                    title: tr('delete_account'),
                    titleColor: AppColors.red,
                    trailing: const Icon(Icons.chevron_right_rounded, size: 20, color: AppColors.muted),
                    onTap: () async {
                      final confirm1 = await showDialog<bool>(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          title: Text(tr('delete_account_title')),
                          content: Text(tr('delete_account_body')),
                          actions: [
                            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(tr('cancel'))),
                            ElevatedButton(
                              style: ElevatedButton.styleFrom(backgroundColor: AppColors.red),
                              onPressed: () => Navigator.of(ctx).pop(true),
                              child: Text(tr('delete_yes')),
                            ),
                          ],
                        ),
                      );
                      if (confirm1 != true || !context.mounted) return;

                      final confirm2 = await showDialog<bool>(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          title: Text(tr('delete_account_warn')),
                          content: Text(tr('delete_account_warn2')),
                          actions: [
                            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(tr('no_go_back'))),
                            ElevatedButton(
                              style: ElevatedButton.styleFrom(backgroundColor: AppColors.red),
                              onPressed: () => Navigator.of(ctx).pop(true),
                              child: Text(tr('delete_yes')),
                            ),
                          ],
                        ),
                      );
                      if (confirm2 != true || !context.mounted) return;

                      try {
                        await ProfileRepository().deleteAccount();
                        await Supabase.instance.client.auth.signOut();
                        if (context.mounted) {
                          Navigator.of(context).pushAndRemoveUntil(
                            MaterialPageRoute(builder: (_) => const SplashScreen()),
                            (_) => false,
                          );
                        }
                      } catch (e) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text("Xato: $e")),
                          );
                        }
                      }
                    },
                  ),
                ],
              ),
              const SizedBox(height: 32),
            ],
          ),
        );
      },
    );
  }
}

class _SettingsIconBadge extends StatelessWidget {
  final IconData icon;
  final Color color;

  const _SettingsIconBadge({
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 30,
      height: 30,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(7),
      ),
      child: Icon(
        icon,
        color: Colors.white,
        size: 17,
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  final Widget leading;
  final String title;
  final Color? titleColor;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  const _SettingsTile({
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
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.muted,
                      ),
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

class _SettingsGroupCard extends StatelessWidget {
  final List<Widget> children;
  final String? headerTitle;

  const _SettingsGroupCard({
    required this.children,
    this.headerTitle,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (headerTitle != null) ...[
          Padding(
            padding: const EdgeInsets.only(left: 16, bottom: 6, top: 4),
            child: Text(
              headerTitle!.toUpperCase(),
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.muted,
                letterSpacing: 0.5,
              ),
            ),
          ),
        ],
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

class _SelectOptionTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final bool isSelected;
  final VoidCallback onTap;

  const _SelectOptionTile({
    required this.title,
    required this.subtitle,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.accent.withOpacity(0.08) : AppColors.bg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected ? AppColors.accent : AppColors.border,
            width: isSelected ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: isSelected ? AppColors.accent : AppColors.text,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(fontSize: 12, color: AppColors.muted),
                  ),
                ],
              ),
            ),
            if (isSelected)
              const Icon(Icons.check_circle_rounded, color: AppColors.accent, size: 22)
            else
              const Icon(Icons.circle_outlined, color: AppColors.muted, size: 22),
          ],
        ),
      ),
    );
  }
}
