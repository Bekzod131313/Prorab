import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

import '../data/backup_repository.dart';
import '../data/profile_repository.dart';
import '../data/settings_repository.dart';
import '../main.dart';
import '../models/profile.dart';
import '../theme/app_theme.dart';
import '../utils/phone_formatter.dart';
import '../widgets/moliya_logo.dart';
import '../widgets/project_card.dart' show formatMoney;
import 'auth_screen.dart';
import 'debt_screen.dart';
import 'supplier_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _repo = ProfileRepository();
  final _settingsRepo = SettingsRepository();
  Profile? _profile;
  ProfileStats? _stats;
  AppSettings _settings = const AppSettings(currency: 'UZS', compactNumbers: false, notifications: true);
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final results = await Future.wait([
      _repo.loadCurrent(),
      _repo.loadStats(),
      _settingsRepo.load(),
    ]);
    if (!mounted) return;
    setState(() {
      _profile = results[0] as Profile?;
      _stats = results[1] as ProfileStats?;
      _settings = results[2] as AppSettings;
      _loading = false;
    });
  }

  Future<void> _saveSettings(AppSettings s) async {
    await _settingsRepo.save(s);
    setState(() => _settings = s);
  }

  Future<void> _editProfile() async {
    final nameCtrl = TextEditingController(text: _profile?.fullName ?? '');
    final phoneCtrl = TextEditingController(text: _profile?.phone.isNotEmpty == true ? _profile!.phone : '+998');
    final stajCtrl = TextEditingController(text: _profile?.staj.toString() ?? '');
    final passCtrl = TextEditingController();
    final pass2Ctrl = TextEditingController();
    String? error;

    final saved = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Profilni tahrirlash',
                style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(hintText: 'Ismingiz'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: phoneCtrl,
                keyboardType: TextInputType.phone,
                inputFormatters: [PhoneFormatter()],
                decoration: const InputDecoration(hintText: 'Telefon raqam'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: stajCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(hintText: 'Staj (yil)'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: passCtrl,
                obscureText: true,
                decoration: const InputDecoration(hintText: 'Yangi parol (ixtiyoriy)'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: pass2Ctrl,
                obscureText: true,
                decoration: const InputDecoration(hintText: 'Parolni takrorlang'),
              ),
              if (error != null) ...[
                const SizedBox(height: 10),
                Text(error!, style: const TextStyle(color: Colors.redAccent, fontSize: 13)),
              ],
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: () {
                  final name = nameCtrl.text.trim();
                  final phone = phoneCtrl.text.trim();
                  final pass = passCtrl.text;
                  final pass2 = pass2Ctrl.text;

                  if (name.isEmpty) {
                    setSheetState(() => error = 'Ism kiritish shart');
                    return;
                  }
                  if (phone.length < 10) {
                    setSheetState(() => error = "To'g'ri telefon kiriting");
                    return;
                  }
                  if (pass.isNotEmpty) {
                    if (pass.length < 6) {
                      setSheetState(() => error = "Parol kamida 6 ta belgi bo'lishi kerak");
                      return;
                    }
                    if (pass != pass2) {
                      setSheetState(() => error = 'Parollar mos kelmadi');
                      return;
                    }
                  }
                  Navigator.of(ctx).pop(true);
                },
                child: const Text('Saqlash'),
              ),
            ],
          ),
        ),
      ),
    );

    if (saved == true) {
      final name = nameCtrl.text.trim();
      final phone = phoneCtrl.text.trim();
      final staj = int.tryParse(stajCtrl.text.trim()) ?? 0;
      final pass = passCtrl.text;

      await _repo.updateProfile(fullName: name, phone: phone, staj: staj);
      if (pass.isNotEmpty) {
        await _repo.updatePassword(pass);
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saqlandi')));
      _load();
    }
  }

  Future<void> _openCurrencyPicker() async {
    const currencies = ['UZS', 'USD', 'RUB', 'EUR'];
    final picked = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Valyutani tanlang', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 16),
            for (final c in currencies) ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(c),
              trailing: _settings.currency == c ? const Icon(Icons.check_rounded, color: AppColors.accent) : null,
              onTap: () => Navigator.pop(context, c),
            ),
          ],
        ),
      ),
    );
    if (picked != null) await _saveSettings(_settings.copyWith(currency: picked));
  }

  Future<void> _showAbout() async {
    showAboutDialog(
      context: context,
      applicationName: 'Moliya',
      applicationVersion: '1.0.0',
      applicationIcon: const MoliyaLogo(size: 40),
      applicationLegalese: 'Qurilish loyihalari uchun moliya boshqaruvi',
    );
  }

  Future<void> _doBackup() async {
    try {
      final json = await BackupRepository().buildBackupJson();
      final date = DateTime.now().toIso8601String().substring(0, 10);
      await Share.share(json, subject: 'moliya-backup-$date.json');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Xatolik: $e')),
      );
    }
  }

  Future<void> _signOut() async {
    await supabase.auth.signOut();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const AuthScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        backgroundColor: AppColors.bg,
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final profile = _profile;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(backgroundColor: AppColors.bg, title: const Text('Profil')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Center(
            child: Container(
              width: 84,
              height: 84,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                gradient: AppColors.gradient,
                shape: BoxShape.circle,
              ),
              child: Text(
                profile?.initial ?? 'U',
                style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Center(
            child: InkWell(
              onTap: _editProfile,
              borderRadius: BorderRadius.circular(8),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    profile?.displayName ?? '',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(width: 6),
                  const Icon(Icons.edit_rounded, size: 16, color: AppColors.muted),
                ],
              ),
            ),
          ),
          if (profile?.phone.isNotEmpty == true) ...[
            const SizedBox(height: 4),
            Center(
              child: Text(
                profile!.phone + (profile.staj > 0 ? ' • Staj: ${profile.staj} yil' : ''),
                style: const TextStyle(color: AppColors.text2),
              ),
            ),
          ],
          const SizedBox(height: 24),
          if (_stats != null)
            Row(
              children: [
                Expanded(child: _ProfileStat(label: 'Balans', value: formatMoney(_stats!.totalBalance))),
                const SizedBox(width: 10),
                Expanded(child: _ProfileStat(label: 'Obyektlar', value: '${_stats!.obsCount}')),
                const SizedBox(width: 10),
                Expanded(child: _ProfileStat(label: 'Odamlar', value: '${_stats!.peopleCount}')),
              ],
            ),
          const SizedBox(height: 24),
          const Padding(
            padding: EdgeInsets.only(left: 4, bottom: 10),
            child: Text('Sozlamalar', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.muted, letterSpacing: 0.5)),
          ),
          _MenuTile(
            icon: Icons.compress_rounded,
            label: "Qisqa son formati",
            trailingSwitch: true,
            switchValue: _settings.compactNumbers,
            onSwitchChanged: (v) => _saveSettings(_settings.copyWith(compactNumbers: v)),
          ),
          _MenuTile(
            icon: Icons.currency_exchange_rounded,
            label: 'Valyuta: ${_settings.currency}',
            onTap: _openCurrencyPicker,
          ),
          const SizedBox(height: 20),
          const Padding(
            padding: EdgeInsets.only(left: 4, bottom: 10),
            child: Text('Ilova', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.muted, letterSpacing: 0.5)),
          ),
          _MenuTile(
            icon: Icons.book_outlined,
            label: 'Qarz daftari',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const DebtScreen())),
          ),
          _MenuTile(
            icon: Icons.store_outlined,
            label: 'Yetkazib beruvchilar',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SupplierScreen())),
          ),
          _MenuTile(icon: Icons.backup_outlined, label: 'Zaxira nusxa', onTap: _doBackup),
          _MenuTile(icon: Icons.info_outline_rounded, label: 'Ilova haqida', onTap: _showAbout),
          const SizedBox(height: 20),
          OutlinedButton(
            onPressed: _signOut,
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.redAccent,
              side: const BorderSide(color: Colors.redAccent),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            child: const Text('Chiqish'),
          ),
        ],
      ),
    );
  }
}

class _ProfileStat extends StatelessWidget {
  final String label;
  final String value;

  const _ProfileStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: AppColors.accent),
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool trailingSwitch;
  final bool switchValue;
  final ValueChanged<bool>? onSwitchChanged;
  final VoidCallback? onTap;

  const _MenuTile({
    required this.icon,
    required this.label,
    this.trailingSwitch = false,
    this.switchValue = false,
    this.onSwitchChanged,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: trailingSwitch ? () => onSwitchChanged?.call(!switchValue) : onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            Icon(icon, color: AppColors.accent, size: 20),
            const SizedBox(width: 12),
            Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600))),
            if (trailingSwitch)
              Switch(value: switchValue, onChanged: onSwitchChanged, activeColor: AppColors.accent)
            else
              const Icon(Icons.chevron_right_rounded, color: AppColors.muted),
          ],
        ),
      ),
    );
  }
}
