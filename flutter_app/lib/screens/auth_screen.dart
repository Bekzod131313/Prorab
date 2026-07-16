import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../l10n/strings.dart';
import '../main.dart';
import '../theme/app_theme.dart';
import '../utils/phone_formatter.dart';
import 'root_shell.dart';
import 'profile_setup_screen.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool _loading = false;
  bool _otpSent = false;
  String? _error;

  final _phoneCtrl = TextEditingController();
  final _codeCtrl = TextEditingController();

  Timer? _cooldownTimer;
  int _secondsRemaining = 0;

  @override
  void initState() {
    super.initState();
    _phoneCtrl.addListener(_onPhoneChanged);
    _codeCtrl.addListener(_onCodeChanged);
  }

  void _onPhoneChanged() {
    setState(() {});
  }

  void _onCodeChanged() {
    setState(() {});
  }

  void _startCooldown() {
    setState(() {
      _secondsRemaining = 60;
    });
    _cooldownTimer?.cancel();
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      if (_secondsRemaining == 0) {
        timer.cancel();
      } else {
        setState(() {
          _secondsRemaining--;
        });
      }
    });
  }

  @override
  void dispose() {
    _phoneCtrl.removeListener(_onPhoneChanged);
    _codeCtrl.removeListener(_onCodeChanged);
    _phoneCtrl.dispose();
    _codeCtrl.dispose();
    _cooldownTimer?.cancel();
    super.dispose();
  }

  bool get _isActive => _phoneCtrl.text.replaceAll(RegExp(r'\D'), '').length == 9;
  bool get _isCodeActive => _codeCtrl.text.replaceAll(RegExp(r'\D'), '').length == 6;

  Future<void> _sendOtp() async {
    final phoneDigits = _phoneCtrl.text.replaceAll(RegExp(r'\D'), '');

    if (phoneDigits.length < 9) {
      setState(() => _error = tr('auth_phone_error'));
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final formattedPhone = '+998$phoneDigits';

      await supabase.auth.signInWithOtp(
        phone: formattedPhone,
      );

      setState(() {
        _otpSent = true;
      });
      _startCooldown();
    } catch (e) {
      setState(() => _error = "Xatolik: ${e.toString()}");
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _verifyOtp() async {
    final phoneDigits = _phoneCtrl.text.replaceAll(RegExp(r'\D'), '');
    final code = _codeCtrl.text.trim();

    if (code.length < 6) {
      setState(() => _error = tr('auth_code_error'));
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final formattedPhone = '+998$phoneDigits';
      final response = await supabase.auth.verifyOTP(
        phone: formattedPhone,
        token: code,
        type: OtpType.sms,
      );

      if (response.user != null) {
        String? fullName;
        try {
          final profileData = await supabase.from('profiles').select('full_name').eq('id', response.user!.id).maybeSingle();
          fullName = profileData?['full_name'] as String?;
        } catch (e) {
          debugPrint('Profile check error: $e');
        }

        if (!mounted) return;
        if (fullName == null || fullName.trim().isEmpty) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => const ProfileSetupScreen()),
          );
        } else {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => const RootShell()),
          );
        }
      } else {
        setState(() => _error = tr('auth_code_wrong'));
      }
    } catch (e) {
      setState(() => _error = "Xatolik: ${e.toString()}");
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    if (_otpSent) {
      await _verifyOtp();
    } else {
      await _sendOtp();
    }
  }

  @override
  Widget build(BuildContext context) {
    final canPop = Navigator.of(context).canPop();

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Top Nav Row
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  canPop || _otpSent
                      ? GestureDetector(
                          onTap: () {
                            if (_otpSent) {
                              setState(() {
                                _otpSent = false;
                                _codeCtrl.clear();
                              });
                            } else {
                              Navigator.of(context).pop();
                            }
                          },
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                              border: Border.all(color: AppColors.border),
                            ),
                            child: Icon(
                              _otpSent ? Icons.arrow_back_rounded : Icons.close,
                              color: AppColors.text,
                              size: 20,
                            ),
                          ),
                        )
                      : const SizedBox(width: 36, height: 36),
                  const Spacer(),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 28),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    const SizedBox(height: 24),
                    // Retro Phone Emoji / Message bubble Icon
                    Text(
                      _otpSent ? '💬' : '☎️',
                      style: const TextStyle(fontSize: 72),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      _otpSent ? tr('auth_verify_title') : tr('auth_phone_title'),
                      style: const TextStyle(
                        color: AppColors.text,
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        _otpSent
                            ? tr('auth_code_sent').replaceFirst('{}', _phoneCtrl.text)
                            : tr('auth_phone_hint'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: AppColors.text2,
                          fontSize: 14,
                        ),
                      ),
                    ),
                    const SizedBox(height: 36),

                    // Ternary for phone input vs code input
                    _otpSent
                        ? Column(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              TextField(
                                controller: _codeCtrl,
                                keyboardType: TextInputType.number,
                                maxLength: 6,
                                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                                style: const TextStyle(
                                  color: AppColors.text,
                                  fontSize: 28,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 12,
                                ),
                                textAlign: TextAlign.center,
                                cursorColor: AppColors.accent,
                                decoration: InputDecoration(
                                  filled: false,
                                  hintText: '000000',
                                  hintStyle: TextStyle(
                                    color: AppColors.muted.withOpacity(0.4),
                                    fontSize: 28,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 12,
                                  ),
                                  border: InputBorder.none,
                                  enabledBorder: InputBorder.none,
                                  focusedBorder: InputBorder.none,
                                  isDense: true,
                                  counterText: '',
                                ),
                              ),
                              const SizedBox(height: 8),
                              Container(
                                width: 180,
                                height: 1,
                                color: AppColors.border,
                              ),
                              const SizedBox(height: 24),
                              // Resend countdown
                               _secondsRemaining > 0
                                   ? Text(
                                       tr('auth_resend_timer').replaceFirst('{}', '$_secondsRemaining'),
                                       style: const TextStyle(color: AppColors.text2, fontSize: 13),
                                     )
                                   : TextButton(
                                       onPressed: _sendOtp,
                                       child: Text(
                                         tr('auth_resend'),
                                         style: const TextStyle(
                                           color: AppColors.accent,
                                           fontWeight: FontWeight.bold,
                                         ),
                                      ),
                                    ),
                            ],
                          )
                        : Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              // Country Dropdown
                              Row(
                                children: const [
                                  Text(
                                    '🇺🇿 O\'zbekiston',
                                    style: TextStyle(
                                      color: AppColors.accent,
                                      fontSize: 16,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Container(
                                height: 1,
                                color: AppColors.border,
                              ),
                              const SizedBox(height: 20),
                              // Phone Number Input Row
                              Row(
                                children: [
                                  const Text(
                                    '+998',
                                    style: TextStyle(
                                      color: AppColors.text,
                                      fontSize: 22,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  Container(
                                    width: 1,
                                    height: 24,
                                    color: AppColors.border,
                                    margin: const EdgeInsets.symmetric(horizontal: 16),
                                  ),
                                  Expanded(
                                    child: TextField(
                                      controller: _phoneCtrl,
                                      keyboardType: TextInputType.phone,
                                      inputFormatters: [LocalPhoneFormatter()],
                                      style: const TextStyle(
                                        color: AppColors.text,
                                        fontSize: 22,
                                        fontWeight: FontWeight.w700,
                                      ),
                                      cursorColor: AppColors.accent,
                                      decoration: InputDecoration(
                                        filled: false,
                                        hintText: '00 000 00 00',
                                        hintStyle: TextStyle(
                                          color: AppColors.muted.withOpacity(0.4),
                                          fontSize: 22,
                                          fontWeight: FontWeight.w700,
                                        ),
                                        border: InputBorder.none,
                                        enabledBorder: InputBorder.none,
                                        focusedBorder: InputBorder.none,
                                        isDense: true,
                                        contentPadding: EdgeInsets.zero,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Container(
                                height: 1,
                                color: AppColors.border,
                              ),
                            ],
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
                    // Action button
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: (_otpSent ? _isCodeActive : _isActive)
                            ? AppColors.accent
                            : AppColors.border,
                        foregroundColor: (_otpSent ? _isCodeActive : _isActive)
                            ? Colors.white
                            : AppColors.muted,
                        disabledBackgroundColor: AppColors.border,
                        disabledForegroundColor: AppColors.muted,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        minimumSize: const Size.fromHeight(52),
                        elevation: 0,
                      ),
                      onPressed: _loading
                          ? null
                          : ((_otpSent ? _isCodeActive : _isActive)
                              ? _submit
                              : null),
                      child: _loading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                            )
                           : Text(
                              _otpSent ? tr('auth_verify_btn') : tr('auth_continue'),
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
          ],
        ),
      ),
    );
  }
}


