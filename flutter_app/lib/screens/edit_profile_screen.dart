import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/profile_repository.dart';
import '../l10n/strings.dart';
import '../models/profile.dart';
import '../theme/app_theme.dart';
import '../utils/haptics.dart';
import '../widgets/app_cached_image.dart';

class EditProfileScreen extends StatefulWidget {
  final Profile? profile;

  const EditProfileScreen({super.key, this.profile});

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _repo = ProfileRepository();
  late TextEditingController _nameCtrl;
  late TextEditingController _phoneCtrl;
  late TextEditingController _stajCtrl;
  late TextEditingController _kasbCtrl;

  bool _saving = false;
  bool _avatarUploading = false;
  String? _avatarUrl;

  @override
  void initState() {
    super.initState();
    _avatarUrl = widget.profile?.avatarUrl;
    _nameCtrl = TextEditingController(text: widget.profile?.fullName ?? '');
    _phoneCtrl = TextEditingController(text: widget.profile?.phone ?? '');
    _stajCtrl = TextEditingController(text: (widget.profile?.staj ?? 0).toString());
    _kasbCtrl = TextEditingController(text: widget.profile?.kasb ?? '');
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _stajCtrl.dispose();
    _kasbCtrl.dispose();
    super.dispose();
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
      setState(() {
        _avatarUrl = url;
        _avatarUploading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() => _avatarUploading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('error_short').replaceFirst('{}', e.toString()))),
        );
      }
    }
  }

  Future<void> _save() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr('enter_name_and_phone'))),
      );
      return;
    }

    AppHaptics.light();
    setState(() => _saving = true);

    try {
      await _repo.updateProfile(
        fullName: name,
        phone: _phoneCtrl.text.trim(),
        staj: int.tryParse(_stajCtrl.text.trim()) ?? 0,
        kasb: _kasbCtrl.text.trim(),
        avatarUrl: _avatarUrl,
      );
      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('error_short').replaceFirst('{}', e.toString()))),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: appLocaleNotifier,
      builder: (_, __, ___) => Scaffold(
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
            tr('edit_profile'),
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.text),
          ),
          centerTitle: true,
        ),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Avatar Picker Section
                Center(
                  child: Stack(
                    children: [
                      Container(
                        width: 100,
                        height: 100,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.card,
                          border: Border.all(color: AppColors.border, width: 2),
                        ),
                        child: ClipOval(
                          child: _avatarUploading
                              ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
                              : (_avatarUrl != null && _avatarUrl!.isNotEmpty
                                  ? AppCachedImage(imageUrl: _avatarUrl!, fit: BoxFit.cover)
                                  : const Icon(Icons.person_rounded, size: 52, color: AppColors.muted)),
                        ),
                      ),
                      Positioned(
                        right: 0,
                        bottom: 0,
                        child: GestureDetector(
                          onTap: _pickAvatar,
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: AppColors.accent,
                              shape: BoxShape.circle,
                              border: Border.all(color: AppColors.bg, width: 2),
                            ),
                            child: const Icon(Icons.camera_alt_rounded, size: 16, color: Colors.white),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 28),

                // Form Fields
                TextField(
                  controller: _nameCtrl,
                  decoration: InputDecoration(
                    labelText: tr('full_name'),
                    prefixIcon: const Icon(Icons.person_outline_rounded, size: 20),
                  ),
                ),
                const SizedBox(height: 14),

                TextField(
                  controller: _phoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: InputDecoration(
                    labelText: tr('phone'),
                    prefixIcon: const Icon(Icons.phone_outlined, size: 20),
                  ),
                ),
                const SizedBox(height: 14),

                TextField(
                  controller: _kasbCtrl,
                  decoration: InputDecoration(
                    labelText: tr('profession'),
                    prefixIcon: const Icon(Icons.work_outline_rounded, size: 20),
                  ),
                ),
                const SizedBox(height: 14),

                TextField(
                  controller: _stajCtrl,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: tr('experience'),
                    prefixIcon: const Icon(Icons.timeline_rounded, size: 20),
                  ),
                ),
                const SizedBox(height: 32),

                // Save Button
                SizedBox(
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _saving ? null : _save,
                    child: _saving
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                          )
                        : Text(
                            tr('save'),
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
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
