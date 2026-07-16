import 'package:flutter/material.dart';

import '../main.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../services/security_service.dart';
import 'auth_screen.dart';
import 'root_shell.dart';

enum PinLockMode {
  setup,
  validation,
  confirmDisable,
}

class PinLockScreen extends StatefulWidget {
  final PinLockMode mode;
  final ValueChanged<bool>? onResult;

  const PinLockScreen({
    super.key,
    required this.mode,
    this.onResult,
  });

  @override
  State<PinLockScreen> createState() => _PinLockScreenState();
}

class _PinLockScreenState extends State<PinLockScreen> {
  String _enteredPin = '';
  String _firstPin = ''; // Used for setup confirmation
  String _userName = '';
  bool _isConfirming = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadUserName();
    if (widget.mode == PinLockMode.validation) {
      _checkBiometricsAuto();
    }
  }

  Future<void> _loadUserName() async {
    final user = supabase.auth.currentUser;
    if (user != null) {
      try {
        final profileData = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
        final name = profileData?['full_name'] as String?;
        if (name != null && mounted) {
          setState(() {
            _userName = name.split(' ').first;
          });
        }
      } catch (_) {}
    }
  }

  Future<void> _checkBiometricsAuto() async {
    final bioEnabled = await SecurityService.isBiometricsEnabled();
    if (bioEnabled) {
      // Small delay to let the screen mount
      await Future.delayed(const Duration(milliseconds: 300));
      _triggerBiometrics();
    }
  }

  Future<void> _triggerBiometrics() async {
    final success = await SecurityService.authenticateBiometrics();
    if (success) {
      if (widget.onResult != null) {
        widget.onResult!(true);
      } else {
        if (!mounted) return;
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const RootShell()),
        );
      }
    } else {
      if (mounted) {
        _showBiometricFailedDialog();
      }
    }
  }

  void _showBiometricFailedDialog() {
    showGeneralDialog(
      context: context,
      barrierDismissible: false,
      barrierLabel: 'FaceIDFailed',
      barrierColor: Colors.black.withOpacity(0.4),
      transitionDuration: const Duration(milliseconds: 200),
      pageBuilder: (ctx, anim1, anim2) {
        return Center(
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 40),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.1),
                  blurRadius: 20,
                  offset: const Offset(0, 10),
                )
              ],
            ),
            child: Material(
              color: Colors.transparent,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.face_retouching_natural_rounded,
                    size: 64,
                    color: AppColors.muted,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    tr('biometrics_failed'),
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: AppColors.text,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    tr('try_again'),
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.text2,
                    ),
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.accent,
                      foregroundColor: Colors.white,
                      minimumSize: const Size.fromHeight(48),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    onPressed: () {
                      Navigator.of(ctx).pop();
                      _triggerBiometrics();
                    },
                    child: Text(tr('repeat_biometrics')),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.text2,
                      minimumSize: const Size.fromHeight(48),
                    ),
                    onPressed: () => Navigator.of(ctx).pop(),
                    child: Text(tr('cancel_btn')),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  void _onKeyPressed(String key) {
    if (_enteredPin.length >= 4) return;
    setState(() {
      _error = null;
      _enteredPin += key;
    });

    if (_enteredPin.length == 4) {
      // Delay slightly for visual effect
      Future.delayed(const Duration(milliseconds: 150), () {
        _processPin();
      });
    }
  }

  void _onBackspace() {
    if (_enteredPin.isEmpty) return;
    setState(() {
      _error = null;
      _enteredPin = _enteredPin.substring(0, _enteredPin.length - 1);
    });
  }

  Future<void> _processPin() async {
    if (!mounted) return;

    if (widget.mode == PinLockMode.setup) {
      if (!_isConfirming) {
        // Storing first PIN
        _firstPin = _enteredPin;
        setState(() {
          _enteredPin = '';
          _isConfirming = true;
        });
      } else {
        // Confirming PIN
        if (_enteredPin == _firstPin) {
          await SecurityService.setPinCode(_enteredPin);
          if (widget.onResult != null) {
            widget.onResult!(true);
          } else {
            if (!mounted) return;
            Navigator.of(context).pop(true);
          }
        } else {
          setState(() {
            _enteredPin = '';
            _isConfirming = false;
            _error = tr('pin_no_match');
          });
        }
      }
    } else if (widget.mode == PinLockMode.validation) {
      final savedPin = await SecurityService.getPinCode();
      if (_enteredPin == savedPin) {
        if (widget.onResult != null) {
          widget.onResult!(true);
        } else {
          if (!mounted) return;
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => const RootShell()),
          );
        }
      } else {
        setState(() {
          _enteredPin = '';
          _error = tr('wrong_pin');
        });
      }
    } else if (widget.mode == PinLockMode.confirmDisable) {
      final savedPin = await SecurityService.getPinCode();
      if (_enteredPin == savedPin) {
        await SecurityService.disablePin();
        if (widget.onResult != null) {
          widget.onResult!(true);
        } else {
          if (!mounted) return;
          Navigator.of(context).pop(true);
        }
      } else {
        setState(() {
          _enteredPin = '';
          _error = tr('wrong_pin');
        });
      }
    }
  }

  Future<void> _handleForgotPin() async {
    // Standard secure logout for forgotten PIN
    await supabase.auth.signOut();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const AuthScreen()),
      (_) => false,
    );
  }

  Widget _buildKeypadButton(String content, {VoidCallback? onTap}) {
    final isSpecial = content == 'bio' || content == 'backspace';

    return Expanded(
      child: AspectRatio(
        aspectRatio: 1.5,
        child: Container(
          margin: const EdgeInsets.all(8),
          child: ClipOval(
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: onTap ?? () => _onKeyPressed(content),
                child: Center(
                  child: isSpecial
                      ? (content == 'bio'
                          ? const Icon(
                              Icons.face_retouching_natural_rounded,
                              size: 32,
                              color: AppColors.text,
                            )
                          : const Icon(
                              Icons.arrow_back_rounded,
                              size: 28,
                              color: AppColors.text,
                            ))
                      : Text(
                          content,
                          style: const TextStyle(
                            fontSize: 30,
                            fontWeight: FontWeight.w500,
                            color: AppColors.text,
                          ),
                        ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Determine screen subtitle
    String subtitle = '';
    if (widget.mode == PinLockMode.setup) {
      subtitle = _isConfirming ? tr('confirm_pin') : tr('create_pin');
    } else {
      subtitle = tr('enter_pin');
    }

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Column(
          children: [
            // Top Action Row
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (widget.mode == PinLockMode.validation)
                    GestureDetector(
                      onTap: _handleForgotPin,
                      child: Text(
                        tr('forgot_pin'),
                        style: const TextStyle(
                          color: AppColors.accent,
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    )
                  else
                    GestureDetector(
                      onTap: () => Navigator.of(context).pop(false),
                      child: Text(
                        tr('cancel'),
                        style: const TextStyle(
                          color: AppColors.text2,
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const Spacer(),

            // Greeting & Instruction
            Text(
              _userName.isNotEmpty ? tr('hello_user').replaceAll('{}', _userName) : 'Moliya',
              style: const TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w800,
                color: AppColors.text,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              subtitle,
              style: const TextStyle(
                fontSize: 14,
                color: AppColors.text2,
              ),
            ),
            const SizedBox(height: 36),

            // Pin Dots
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(4, (index) {
                final isFilled = index < _enteredPin.length;
                return Container(
                  margin: const EdgeInsets.symmetric(horizontal: 8),
                  width: 14,
                  height: 14,
                  decoration: BoxDecoration(
                    color: isFilled ? AppColors.accent : AppColors.border,
                    shape: BoxShape.circle,
                  ),
                );
              }),
            ),
            const SizedBox(height: 12),

            // Error display
            if (_error != null)
              Text(
                _error!,
                style: const TextStyle(
                  color: AppColors.red,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),

            const Spacer(),

            // Keypad Grid
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 40),
              child: Column(
                children: [
                  Row(
                    children: [
                      _buildKeypadButton('1'),
                      _buildKeypadButton('2'),
                      _buildKeypadButton('3'),
                    ],
                  ),
                  Row(
                    children: [
                      _buildKeypadButton('4'),
                      _buildKeypadButton('5'),
                      _buildKeypadButton('6'),
                    ],
                  ),
                  Row(
                    children: [
                      _buildKeypadButton('7'),
                      _buildKeypadButton('8'),
                      _buildKeypadButton('9'),
                    ],
                  ),
                  Row(
                    children: [
                      // Bottom Left Button: Biometric Trigger
                      widget.mode == PinLockMode.validation
                          ? _buildKeypadButton('bio', onTap: _triggerBiometrics)
                          : const Expanded(child: SizedBox()),
                      _buildKeypadButton('0'),
                      _buildKeypadButton('backspace', onTap: _onBackspace),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
