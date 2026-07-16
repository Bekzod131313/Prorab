import 'package:flutter/material.dart';

import '../l10n/strings.dart';
import '../main.dart';
import '../theme/app_theme.dart';
import 'root_shell.dart';

class ProfileSetupScreen extends StatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  State<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends State<ProfileSetupScreen> {
  final _nameCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _nameCtrl.addListener(_onNameChanged);
  }

  void _onNameChanged() {
    setState(() {});
  }

  @override
  void dispose() {
    _nameCtrl.removeListener(_onNameChanged);
    _nameCtrl.dispose();
    super.dispose();
  }

  bool get _isActive => _nameCtrl.text.trim().isNotEmpty;

  Future<void> _submit() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      setState(() => _error = tr('setup_name_error'));
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final currentUser = supabase.auth.currentUser;
      final userId = currentUser?.id;
      if (userId == null) throw Exception(tr('session_not_found'));

      final phone = currentUser?.phone ?? '';

      await supabase.from('profiles').upsert({
        'id': userId,
        'full_name': name,
        'phone': phone,
      });

      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const RootShell()),
      );
    } catch (e) {
      setState(() => _error = "Xatolik: ${e.toString()}");
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const Text(
                  '👤',
                  style: TextStyle(fontSize: 72),
                ),
                const SizedBox(height: 20),
                  Text(
                  tr('setup_title'),
                  style: const TextStyle(
                    color: AppColors.text,
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                  Text(
                  tr('setup_subtitle'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: AppColors.text2,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 36),
                TextField(
                  controller: _nameCtrl,
                  style: const TextStyle(
                    color: AppColors.text,
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                  ),
                  cursorColor: AppColors.accent,
                  textCapitalization: TextCapitalization.words,
                  textAlign: TextAlign.center,
                  onSubmitted: (_) => _isActive ? _submit() : null,
                  decoration: InputDecoration(
                    filled: false,
                    hintText: tr('setup_hint'),
                    hintStyle: TextStyle(
                      color: AppColors.muted.withOpacity(0.4),
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    isDense: true,
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  width: 240,
                  height: 1,
                  color: AppColors.border,
                ),
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    _error!,
                    style: const TextStyle(color: AppColors.red),
                    textAlign: TextAlign.center,
                  ),
                ],
                const SizedBox(height: 40),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _isActive ? AppColors.accent : AppColors.border,
                    foregroundColor: _isActive ? Colors.white : AppColors.muted,
                    disabledBackgroundColor: AppColors.border,
                    disabledForegroundColor: AppColors.muted,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    minimumSize: const Size.fromHeight(52),
                    elevation: 0,
                  ),
                  onPressed: _loading ? null : (_isActive ? _submit : null),
                  child: _loading
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                        )
                      : Text(
                          tr('setup_save_continue'),
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                          ),
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
