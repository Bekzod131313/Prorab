import 'package:flutter/material.dart';

import '../main.dart';
import '../theme/app_theme.dart';
import '../widgets/moliya_logo.dart';
import 'root_shell.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool _isLogin = true;
  bool _loading = false;
  bool _obscurePass = true;
  String? _error;

  final _phoneCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _passCtrl = TextEditingController();

  @override
  void dispose() {
    _phoneCtrl.dispose();
    _nameCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final phoneDigits = _phoneCtrl.text.replaceAll(RegExp(r'\D'), '');
    final pass = _passCtrl.text;

    if (phoneDigits.isEmpty) {
      setState(() => _error = 'Telefon raqamini kiriting');
      return;
    }
    if (pass.length < 4) {
      setState(() => _error = 'Parol kamida 4 ta belgi');
      return;
    }
    if (!_isLogin && _nameCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Ismingizni kiriting');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    final email = '$phoneDigits@prorab.app';

    try {
      if (_isLogin) {
        await supabase.auth.signInWithPassword(email: email, password: pass);
      } else {
        await supabase.auth.signUp(
          email: email,
          password: pass,
          data: {'phone': phoneDigits, 'full_name': _nameCtrl.text.trim()},
        );
      }
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
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(child: const MoliyaLogo(size: 64)),
                const SizedBox(height: 12),
                Center(
                  child: Text(
                    'Moliya',
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                ),
                const SizedBox(height: 4),
                Center(
                  child: Text(
                    'Loyiha. Jarayon. Natija.',
                    style: TextStyle(color: AppColors.text2, fontSize: 14),
                  ),
                ),
                const SizedBox(height: 36),
                if (!_isLogin) ...[
                  TextField(
                    controller: _nameCtrl,
                    decoration: const InputDecoration(hintText: 'Ismingiz'),
                  ),
                  const SizedBox(height: 12),
                ],
                TextField(
                  controller: _phoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(hintText: 'Telefon raqam'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _passCtrl,
                  obscureText: _obscurePass,
                  decoration: InputDecoration(
                    hintText: 'Parol',
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscurePass ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                        color: AppColors.muted,
                      ),
                      onPressed: () => setState(() => _obscurePass = !_obscurePass),
                    ),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: const TextStyle(color: Colors.redAccent)),
                ],
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: _loading ? null : _submit,
                  child: _loading
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : Text(_isLogin ? 'Kirish →' : "Ro'yxatdan o'tish →"),
                ),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: () => setState(() {
                    _isLogin = !_isLogin;
                    _error = null;
                  }),
                  child: Text(
                    _isLogin ? "Hisobingiz yo'qmi? Ro'yxatdan o'tish" : 'Hisobingiz bormi? Kirish',
                    style: TextStyle(color: AppColors.accent),
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
