import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show FileOptions;

import '../data/project_repository.dart';
import '../l10n/strings.dart';
import '../main.dart';
import '../models/project.dart';
import '../theme/app_theme.dart';
import '../utils/haptics.dart';

class EditProjectScreen extends StatefulWidget {
  final Project project;

  const EditProjectScreen({super.key, required this.project});

  @override
  State<EditProjectScreen> createState() => _EditProjectScreenState();
}

class _EditProjectScreenState extends State<EditProjectScreen> {
  final _projectRepo = ProjectRepository();

  late TextEditingController _nameCtrl;
  late TextEditingController _daysCtrl;
  late TextEditingController _manzilCtrl;
  late TextEditingController _mijozCtrl;
  late DateTime _startDate;

  bool _loading = false;
  bool _uploadingImage = false;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.project.nomi);
    _daysCtrl = TextEditingController(text: widget.project.muddat.toString());
    _manzilCtrl = TextEditingController(text: widget.project.manzil ?? '');
    _mijozCtrl = TextEditingController(text: widget.project.mijoz ?? '');
    _startDate = widget.project.boshlanish ?? DateTime.now();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _daysCtrl.dispose();
    _manzilCtrl.dispose();
    _mijozCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickAndUploadImage() async {
    setState(() => _uploadingImage = true);
    try {
      final picker = ImagePicker();
      final file =
          await picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
      if (file == null) return;
      final bytes = await file.readAsBytes();
      final path = '${widget.project.id}/cover.jpg';
      await supabase.storage.from('project-images').uploadBinary(
            path,
            bytes,
            fileOptions: const FileOptions(contentType: 'image/jpeg', upsert: true),
          );
      final ts = DateTime.now().millisecondsSinceEpoch;
      final publicUrl =
          '${supabase.storage.from('project-images').getPublicUrl(path)}?t=$ts';
      await _projectRepo.updateImage(widget.project.id, publicUrl);
      if (mounted) {
        AppHaptics.medium();
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(tr('image_uploaded'))));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('${tr('error')}: $e')));
      }
    } finally {
      if (mounted) {
        setState(() => _uploadingImage = false);
      }
    }
  }

  Future<void> _submit() async {
    final nomi = _nameCtrl.text.trim();
    if (nomi.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${tr("project_name")} ${tr("optional")}')),
      );
      return;
    }

    setState(() => _loading = true);
    try {
      await _projectRepo.updateProject(
        id: widget.project.id,
        nomi: nomi,
        boshlanish: _startDate,
        muddat: int.tryParse(_daysCtrl.text.trim()) ?? widget.project.muddat,
        manzil: _manzilCtrl.text.trim(),
        mijoz: _mijozCtrl.text.trim(),
        bosqich: widget.project.bosqich,
      );
      if (mounted) {
        AppHaptics.medium();
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${tr("error")}: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: appLocaleNotifier,
      builder: (context, locale, _) {
        return Scaffold(
          backgroundColor: AppColors.bg,
          appBar: AppBar(
            backgroundColor: AppColors.bg,
            elevation: 0,
            surfaceTintColor: Colors.transparent,
            leading: IconButton(
              icon: const Icon(Icons.arrow_back, color: AppColors.text),
              onPressed: () => Navigator.of(context).pop(),
            ),
            title: Text(
              tr('edit_project_title'),
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.text,
              ),
            ),
            centerTitle: true,
            actions: [
              IconButton(
                icon: _uploadingImage
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.camera_alt_outlined, color: AppColors.accent),
                tooltip: tr('upload_photo'),
                onPressed: _uploadingImage ? null : _pickAndUploadImage,
              ),
              const SizedBox(width: 8),
            ],
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      TextField(
                        controller: _nameCtrl,
                        decoration: InputDecoration(
                          hintText: '${tr('project_name')} *',
                          labelText: tr('project_name'),
                        ),
                      ),
                      const SizedBox(height: 16),
                      InkWell(
                        onTap: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate: _startDate,
                            firstDate: DateTime(2020),
                            lastDate: DateTime(2100),
                          );
                          if (picked != null) {
                            setState(() => _startDate = picked);
                          }
                        },
                        borderRadius: BorderRadius.circular(12),
                        child: InputDecorator(
                          decoration: InputDecoration(
                            labelText: tr('start_date'),
                            prefixIcon: const Icon(
                              Icons.calendar_today_rounded,
                              size: 18,
                            ),
                          ),
                          child: Text(
                            DateFormat('dd.MM.yyyy', appLocaleNotifier.value)
                                .format(_startDate),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: _daysCtrl,
                        keyboardType: TextInputType.number,
                        decoration: InputDecoration(
                          labelText: tr('duration_days'),
                          prefixIcon: const Icon(
                            Icons.timer_outlined,
                            size: 18,
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: _manzilCtrl,
                        decoration: InputDecoration(
                          labelText: tr('location'),
                          prefixIcon: const Icon(
                            Icons.location_on_outlined,
                            size: 18,
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: _mijozCtrl,
                        decoration: InputDecoration(
                          labelText: tr('client'),
                          prefixIcon: const Icon(
                            Icons.person_outline_rounded,
                            size: 18,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 28),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.accent,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    elevation: 0,
                  ),
                  onPressed: _loading ? null : _submit,
                  child: _loading
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(
                          tr('save'),
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
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
