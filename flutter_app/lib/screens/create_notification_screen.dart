import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';

class CreateNotificationScreen extends StatefulWidget {
  final Map<String, dynamic>? targetUser;
  final List<Map<String, dynamic>>? allUsers;

  const CreateNotificationScreen({
    super.key,
    this.targetUser,
    this.allUsers,
  });

  @override
  State<CreateNotificationScreen> createState() => _CreateNotificationScreenState();
}

class _CreateNotificationScreenState extends State<CreateNotificationScreen> {
  final _supabase = Supabase.instance.client;
  final _formKey = GlobalKey<FormState>();

  final _titleUzCtrl = TextEditingController(text: 'Risq tizimi');
  final _bodyUzCtrl = TextEditingController();
  final _titleRuCtrl = TextEditingController(text: 'Система Risq');
  final _bodyRuCtrl = TextEditingController();

  String _cfUrl = 'https://us-central1-risq-91c54.cloudfunctions.net/sendPushNotification';
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  @override
  void dispose() {
    _titleUzCtrl.dispose();
    _bodyUzCtrl.dispose();
    _titleRuCtrl.dispose();
    _bodyRuCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    final url = prefs.getString('admin_cf_url');
    if (url != null && url.isNotEmpty) {
      if (mounted) {
        setState(() => _cfUrl = url);
      }
    }
  }

  Future<void> _send() async {
    if (!_formKey.currentState!.validate()) return;

    final titleUz = _titleUzCtrl.text.trim();
    final bodyUz = _bodyUzCtrl.text.trim();
    final titleRu = _titleRuCtrl.text.trim();
    final bodyRu = _bodyRuCtrl.text.trim();

    setState(() => _sending = true);

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );

    int dbSavedCount = 0;
    int pushSuccessCount = 0;
    String? lastError;

    // Build the list of target users
    final List<Map<String, dynamic>> targets = [];
    if (widget.targetUser != null) {
      targets.add(widget.targetUser!);
    } else if (widget.allUsers != null) {
      targets.addAll(widget.allUsers!);
    }

    final isSendAll = widget.targetUser == null;

    try {
      // 1. Insert into notifications table with both language fields
      for (final u in targets) {
        final userId = u['id'] as String;
        try {
          await _supabase.from('notifications').insert({
            'user_id': userId,
            'title': titleUz, // Legacy UZ title fallback
            'body': bodyUz,   // Legacy UZ body fallback
            'title_uz': titleUz,
            'body_uz': bodyUz,
            'title_ru': titleRu,
            'body_ru': bodyRu,
          });
          dbSavedCount++;
        } catch (e) {
          lastError = e.toString();
          debugPrint('Database insert error: $e');
        }
      }

      // 2. Try to send FCM push notification via Cloud Function
      if (isSendAll) {
        // Send to topics 'all_uz' and 'all_ru'
        try {
          final resUz = await http.post(
            Uri.parse(_cfUrl),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'topic': 'all_uz',
              'title': titleUz,
              'body': bodyUz,
            }),
          );
          final resRu = await http.post(
            Uri.parse(_cfUrl),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'topic': 'all_ru',
              'title': titleRu,
              'body': bodyRu,
            }),
          );
          if (resUz.statusCode == 200 || resRu.statusCode == 200) {
            pushSuccessCount = targets.length;
          }
        } catch (e) {
          debugPrint('Topic FCM sending error: $e');
        }
      } else {
        // Send to single user using their language topics
        final singleUser = targets.first;
        final userId = singleUser['id'] as String;
        try {
          final resUz = await http.post(
            Uri.parse(_cfUrl),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'topic': 'user_${userId}_uz',
              'title': titleUz,
              'body': bodyUz,
            }),
          );
          final resRu = await http.post(
            Uri.parse(_cfUrl),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'topic': 'user_${userId}_ru',
              'title': titleRu,
              'body': bodyRu,
            }),
          );
          if (resUz.statusCode == 200 || resRu.statusCode == 200) {
            pushSuccessCount = 1;
          }
        } catch (e) {
          debugPrint('Single user topic FCM sending error: $e');
        }
      }
    } finally {
      if (mounted) {
        Navigator.of(context).pop(); // Close loading dialog
        setState(() => _sending = false);

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Bildirishnomalar saqlandi: $dbSavedCount / ${targets.length} ta.${lastError != null ? '\nXato: $lastError' : ''}\n'
              'Push yuborildi: $pushSuccessCount / ${targets.length} ta.',
            ),
            duration: const Duration(seconds: 8),
          ),
        );

        if (dbSavedCount > 0) {
          Navigator.of(context).pop(true); // Return success to reload admin panel
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    String recipientText = '';
    if (widget.targetUser != null) {
      recipientText = widget.targetUser!['full_name'] ?? (widget.targetUser!['phone'] ?? '');
    } else {
      recipientText = tr('all_users');
    }

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Text(tr('create_notification'), style: const TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            // Recipient info card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  const Icon(Icons.people_outline_rounded, color: AppColors.accent, size: 24),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tr('recipient'),
                          style: const TextStyle(fontSize: 12, color: AppColors.text2, fontWeight: FontWeight.w500),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          recipientText,
                          style: const TextStyle(fontSize: 15, color: AppColors.text, fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Uzbek Version section title
            const Text(
              'O\'zbekcha versiyasi (Uzbek version)',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.accent),
            ),
            const SizedBox(height: 10),

            // title UZ
            TextFormField(
              controller: _titleUzCtrl,
              decoration: InputDecoration(
                labelText: tr('title_uz_label'),
                fillColor: AppColors.card,
                filled: true,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.border)),
              ),
              validator: (v) => v?.trim().isEmpty == true ? tr('fields_required_error') : null,
            ),
            const SizedBox(height: 12),

            // body UZ
            TextFormField(
              controller: _bodyUzCtrl,
              maxLines: 3,
              decoration: InputDecoration(
                labelText: tr('body_uz_label'),
                fillColor: AppColors.card,
                filled: true,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.border)),
              ),
              validator: (v) => v?.trim().isEmpty == true ? tr('fields_required_error') : null,
            ),
            const SizedBox(height: 24),

            // Russian Version section title
            const Text(
              'Русская версия (Russian version)',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppColors.accent),
            ),
            const SizedBox(height: 10),

            // title RU
            TextFormField(
              controller: _titleRuCtrl,
              decoration: InputDecoration(
                labelText: tr('title_ru_label'),
                fillColor: AppColors.card,
                filled: true,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.border)),
              ),
              validator: (v) => v?.trim().isEmpty == true ? tr('fields_required_error') : null,
            ),
            const SizedBox(height: 12),

            // body RU
            TextFormField(
              controller: _bodyRuCtrl,
              maxLines: 3,
              decoration: InputDecoration(
                labelText: tr('body_ru_label'),
                fillColor: AppColors.card,
                filled: true,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.border)),
              ),
              validator: (v) => v?.trim().isEmpty == true ? tr('fields_required_error') : null,
            ),
            const SizedBox(height: 32),

            // Send button
            ElevatedButton(
              onPressed: _sending ? null : _send,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.accent,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              child: Text(
                tr('send'),
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
