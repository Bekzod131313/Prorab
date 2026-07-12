import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/profile_repository.dart';
import '../l10n/strings.dart';
import '../models/profile.dart';
import '../services/currency_service.dart';
import '../theme/app_theme.dart';
import '../widgets/project_card.dart' show formatMoney, formatUzsToDisplay;
import 'splash_screen.dart';
import 'admin_panel_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _repo = ProfileRepository();
  Profile? _profile;
  ProfileStats? _stats;
  List<String> _portfolio = [];
  bool _loading = true;
  bool _avatarUploading = false;
  bool _portfolioUploading = false;

  Future<void> _showFcmToken() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null) return;
      if (!mounted) return;
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text("FCM Token"),
          content: SelectableText(token),
          actions: [
            TextButton(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: token));
                Navigator.of(ctx).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text("FCM Token nusxalandi")),
                );
              },
              child: const Text("Ko'chirish"),
            ),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text("Yopish"),
            ),
          ],
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Tokenni olib bo'lmadi: $e")),
        );
      }
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _loadSilent() async {
    try {
      final userId = Supabase.instance.client.auth.currentUser?.id ?? '';
      final results = await Future.wait([
        _repo.loadCurrent(),
        _repo.loadStats(),
        _repo.loadPortfolio(userId),
      ]);
      if (!mounted) return;
      setState(() {
        _profile = results[0] as Profile?;
        _stats = results[1] as ProfileStats;
        _portfolio = results[2] as List<String>;
      });
    } catch (_) {}
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    await _loadSilent();
    if (mounted) {
      setState(() => _loading = false);
    }
  }

  Future<void> _pickAvatar() async {
    try {
      final picker = ImagePicker();
      final file = await picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
      if (file == null) return;
      final bytes = await file.readAsBytes();
      final userId = Supabase.instance.client.auth.currentUser?.id ?? '';
      setState(() => _avatarUploading = true);
      final url = await _repo.uploadAvatar(userId, bytes);
      await _repo.updateProfile(
        fullName: _profile?.fullName ?? '',
        phone: _profile?.phone ?? '',
        staj: _profile?.staj ?? 0,
        kasb: _profile?.kasb,
        avatarUrl: url,
      );
      await _loadSilent();
      setState(() => _avatarUploading = false);
    } catch (e) {
      if (mounted) {
        setState(() => _avatarUploading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Xato: $e')));
      }
    }
  }

  Future<void> _pickPortfolioPhoto() async {
    try {
      final picker = ImagePicker();
      final file = await picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
      if (file == null) return;
      final bytes = await file.readAsBytes();
      final userId = Supabase.instance.client.auth.currentUser?.id ?? '';
      setState(() => _portfolioUploading = true);
      await _repo.uploadPortfolioImage(userId, bytes);
      await _loadSilent();
      setState(() => _portfolioUploading = false);
    } catch (e) {
      if (mounted) {
        setState(() => _portfolioUploading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Xato: $e')));
      }
    }
  }

  Future<void> _openEditProfile() async {
    final nameCtrl = TextEditingController(text: _profile?.fullName ?? '');
    final phoneCtrl = TextEditingController(text: _profile?.phone ?? '');
    final stajCtrl = TextEditingController(text: (_profile?.staj ?? 0).toString());
    final kasbCtrl = TextEditingController(text: _profile?.kasb ?? '');

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 20, right: 20, top: 24, bottom: 24 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              Expanded(child: Text(tr('edit_profile'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17))),
              IconButton(
                icon: const Icon(Icons.camera_alt_outlined, color: AppColors.accent),
                onPressed: () async {
                  Navigator.of(ctx).pop();
                  await _pickAvatar();
                },
              ),
            ]),
            const SizedBox(height: 12),
            TextField(controller: nameCtrl, decoration: InputDecoration(labelText: tr('full_name'), prefixIcon: const Icon(Icons.person_outline_rounded, size: 18))),
            const SizedBox(height: 12),
            TextField(controller: phoneCtrl, keyboardType: TextInputType.phone,
              decoration: InputDecoration(labelText: tr('phone'), prefixIcon: const Icon(Icons.phone_outlined, size: 18))),
            const SizedBox(height: 12),
            TextField(controller: kasbCtrl, decoration: InputDecoration(labelText: tr('profession'), prefixIcon: const Icon(Icons.work_outline_rounded, size: 18))),
            const SizedBox(height: 12),
            TextField(controller: stajCtrl, keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: tr('experience'), prefixIcon: const Icon(Icons.timeline_rounded, size: 18))),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text(tr('save')),
            ),
          ],
        ),
      ),
    );

    if (saved == true) {
      try {
        await _repo.updateProfile(
          fullName: nameCtrl.text.trim(),
          phone: phoneCtrl.text.trim(),
          staj: int.tryParse(stajCtrl.text.trim()) ?? 0,
          kasb: kasbCtrl.text.trim(),
        );
        _load();
      } catch (e) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Xato: $e')));
      }
    }
    Future.delayed(const Duration(milliseconds: 350), () {
      nameCtrl.dispose();
      phoneCtrl.dispose();
      stajCtrl.dispose();
      kasbCtrl.dispose();
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = Supabase.instance.client.auth.currentUser;
    final email = user?.email ?? '';

    return ValueListenableBuilder<String>(
      valueListenable: appLocaleNotifier,
      builder: (_, __, ___) => Scaffold(
        backgroundColor: AppColors.bg,
        appBar: AppBar(
          backgroundColor: AppColors.bg,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          titleSpacing: 16,
          title: Text(tr('profile'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.text)),
          actions: [
            TextButton(
              onPressed: _openEditProfile,
              child: Text(tr('edit_profile'), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.accent)),
            ),
          ],
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    // Avatar + info card
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
                      child: Column(children: [
                        // Avatar
                        GestureDetector(
                          onTap: _avatarUploading ? null : _pickAvatar,
                          child: Stack(children: [
                            CircleAvatar(
                              radius: 40,
                              backgroundColor: AppColors.accent.withOpacity(0.12),
                              backgroundImage: _profile?.avatarUrl != null ? NetworkImage(_profile!.avatarUrl!) : null,
                              child: _avatarUploading
                                  ? const SizedBox(
                                      width: 24,
                                      height: 24,
                                      child: CircularProgressIndicator(strokeWidth: 2),
                                    )
                                  : _profile?.avatarUrl == null
                                      ? Text(_profile?.initial ?? '?', style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: AppColors.accent))
                                      : null,
                            ),
                            if (!_avatarUploading)
                              Positioned(
                                bottom: 0, right: 0,
                                child: Container(
                                  width: 26, height: 26,
                                  decoration: BoxDecoration(color: AppColors.accent, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)),
                                  child: const Icon(Icons.camera_alt_rounded, size: 13, color: Colors.white),
                                ),
                              ),
                          ]),
                        ),
                        const SizedBox(height: 12),
                        Text(_profile?.displayName ?? email, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                        if (email.isNotEmpty)
                          Text(email, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                        if (_profile?.kasb?.isNotEmpty == true) ...[
                          const SizedBox(height: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                            decoration: BoxDecoration(color: AppColors.accent.withOpacity(0.1), borderRadius: BorderRadius.circular(20)),
                            child: Text(_profile!.kasb!, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.accent)),
                          ),
                        ],
                        if (_profile?.phone.isNotEmpty == true) ...[
                          const SizedBox(height: 6),
                          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                            const Icon(Icons.phone_outlined, size: 14, color: AppColors.muted),
                            const SizedBox(width: 4),
                            Text(_profile!.phone, style: const TextStyle(fontSize: 13, color: AppColors.text2)),
                          ]),
                        ],
                        const SizedBox(height: 16),
                        // Stats row
                        Row(children: [
                          _StatCol(label: tr('projects_count'), value: '${_stats?.obsCount ?? 0}'),
                          _Divider(),
                          _StatCol(label: tr('workers'), value: '${_stats?.peopleCount ?? 0}'),
                          _Divider(),
                          _StatCol(label: tr('experience'), value: '${_profile?.staj ?? 0} yil'),
                        ]),
                      ]),
                    ),
                    const SizedBox(height: 16),

                    // Balance summary
                    if (_stats != null)
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
                        child: Row(children: [
                          const Icon(Icons.account_balance_wallet_outlined, size: 20, color: AppColors.accent),
                          const SizedBox(width: 10),
                          Expanded(child: Text(tr('balance'), style: const TextStyle(fontSize: 14, color: AppColors.text2))),
                          Text(
                            formatUzsToDisplay(_stats!.totalBalance),
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: _stats!.totalBalance >= 0 ? AppColors.green : AppColors.red),
                          ),
                        ]),
                      ),
                    const SizedBox(height: 16),

                    // Portfolio section
                    Row(children: [
                      Text(tr('portfolio'), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.text)),
                      const Spacer(),
                      TextButton.icon(
                        onPressed: _pickPortfolioPhoto,
                        icon: const Icon(Icons.add_photo_alternate_outlined, size: 16),
                        label: Text(tr('portfolio_add'), style: const TextStyle(fontSize: 12)),
                        style: TextButton.styleFrom(foregroundColor: AppColors.accent),
                      ),
                    ]),
                    const SizedBox(height: 8),
                    if (_portfolio.isEmpty)
                      Container(
                        padding: const EdgeInsets.all(28),
                        decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
                        child: Column(children: [
                          const Icon(Icons.photo_library_outlined, size: 32, color: AppColors.muted),
                          const SizedBox(height: 8),
                          Text(tr('portfolio_empty'), style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                        ]),
                      )
                    else
                      GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 3, crossAxisSpacing: 8, mainAxisSpacing: 8,
                        ),
                        itemCount: _portfolio.length + (_portfolioUploading ? 1 : 0),
                        itemBuilder: (_, i) {
                          if (_portfolioUploading && i == 0) {
                            return Container(
                              decoration: BoxDecoration(
                                color: AppColors.border.withOpacity(0.3),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: const Center(
                                child: SizedBox(
                                  width: 24,
                                  height: 24,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                ),
                              ),
                            );
                          }
                          final idx = _portfolioUploading ? i - 1 : i;
                          final url = _portfolio[idx];
                          return GestureDetector(
                            onLongPress: () async {
                              final confirm = await showDialog<bool>(
                                context: context,
                                builder: (ctx) => AlertDialog(
                                  title: Text(tr('confirm_delete')),
                                  actions: [
                                    TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(tr('cancel'))),
                                    ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: AppColors.red), onPressed: () => Navigator.of(ctx).pop(true), child: Text(tr('delete'))),
                                  ],
                                ),
                              );
                              if (confirm == true) {
                                final userId = Supabase.instance.client.auth.currentUser?.id ?? '';
                                await _repo.deletePortfolioImage(userId, url);
                                _load();
                              }
                            },
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: Image.network(url, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(color: AppColors.border, child: const Icon(Icons.broken_image_outlined, color: AppColors.muted))),
                            ),
                          );
                        },
                      ),
                    const SizedBox(height: 20),

                    // Language switcher
                    Container(
                      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(tr('language'), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.text)),
                          const SizedBox(height: 12),
                          Row(children: [
                            _LangBtn(code: 'uz', label: "O'zbek"),
                            const SizedBox(width: 8),
                            _LangBtn(code: 'ru', label: 'Русский'),
                            const SizedBox(width: 8),
                            _LangBtn(code: 'en', label: 'English'),
                          ]),
                        ]),
                      ),
                    ),
                    const SizedBox(height: 24),
                    // Currency switcher
                    Container(
                      decoration: BoxDecoration(
                        color: AppColors.card,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Valyuta',
                              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.text),
                            ),
                            const SizedBox(height: 12),
                            ValueListenableBuilder<String>(
                              valueListenable: CurrencyService().displayCurrencyNotifier,
                              builder: (ctx, activeCurrency, _) => Row(
                                children: [
                                  Expanded(
                                    child: _CurrencyBtn(
                                      code: 'UZS',
                                      label: "So'm (UZS)",
                                      isSelected: activeCurrency == 'UZS',
                                      onTap: () => CurrencyService().setDisplayCurrency('UZS'),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: _CurrencyBtn(
                                      code: 'USD',
                                      label: "Dollar (USD)",
                                      isSelected: activeCurrency == 'USD',
                                      onTap: () => CurrencyService().setDisplayCurrency('USD'),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    if (_profile?.isAdmin == true) ...[
                      Container(
                        decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
                        child: ListTile(
                          leading: const Icon(Icons.admin_panel_settings_rounded, color: AppColors.orange),
                          title: const Text("Admin Panel", style: TextStyle(fontWeight: FontWeight.w700)),
                          subtitle: const Text("Tizim ma'lumotlarini boshqarish", style: TextStyle(fontSize: 11)),
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(builder: (_) => const AdminPanelScreen()),
                            );
                          },
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],

                    // FCM Token (For testing)
                    Container(
                      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
                      child: ListTile(
                        leading: const Icon(Icons.key_rounded, color: AppColors.accent),
                        title: const Text("FCM Token", style: TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: const Text("Sinash / nusxalash uchun bosing", style: TextStyle(fontSize: 11)),
                        onTap: _showFcmToken,
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Logout
                    Container(
                      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
                      child: ListTile(
                        leading: const Icon(Icons.logout_rounded, color: AppColors.red),
                        title: Text(tr('logout'), style: const TextStyle(color: AppColors.red, fontWeight: FontWeight.w700)),
                        onTap: () async {
                          await Supabase.instance.client.auth.signOut();
                          if (context.mounted) {
                            Navigator.of(context).pushAndRemoveUntil(
                              MaterialPageRoute(builder: (_) => const SplashScreen()),
                              (_) => false,
                            );
                          }
                        },
                      ),
                    ),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
      ),
    );
  }
}

class _StatCol extends StatelessWidget {
  final String label;
  final String value;
  const _StatCol({required this.label, required this.value});
  @override
  Widget build(BuildContext context) {
    return Expanded(child: Column(children: [
      Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: AppColors.text)),
      const SizedBox(height: 2),
      Text(label, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
    ]));
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(width: 1, height: 32, color: AppColors.border);
  }
}

class _LangBtn extends StatelessWidget {
  final String code;
  final String label;
  const _LangBtn({required this.code, required this.label});
  @override
  Widget build(BuildContext context) {
    final selected = appLocaleNotifier.value == code;
    return GestureDetector(
      onTap: () => setLocale(code),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? AppColors.accent : AppColors.bg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: selected ? AppColors.accent : AppColors.border),
        ),
        child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: selected ? Colors.white : AppColors.text2)),
      ),
    );
  }
}

class _CurrencyBtn extends StatelessWidget {
  final String code;
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _CurrencyBtn({
    required this.code,
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        height: 38,
        decoration: BoxDecoration(
          color: isSelected ? AppColors.accent : AppColors.bg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: isSelected ? AppColors.accent : AppColors.border),
        ),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: isSelected ? Colors.white : AppColors.text2,
            ),
          ),
        ),
      ),
    );
  }
}
