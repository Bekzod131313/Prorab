import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../utils/phone_formatter.dart';

class AddWorkerGlobalSheet extends StatelessWidget {
  final TextEditingController phoneCtrl;
  final TextEditingController kasbCtrl;

  const AddWorkerGlobalSheet({
    super.key,
    required this.phoneCtrl,
    required this.kasbCtrl,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 24,
          bottom: 24 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Drag handle
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 20),
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Text(
              "Yangi ishchi qo'shish",
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w900, fontSize: 18),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: phoneCtrl,
              keyboardType: TextInputType.phone,
              inputFormatters: [PhoneFormatter()],
              decoration: const InputDecoration(
                hintText: 'Telefon raqam',
                prefixIcon: Icon(Icons.phone_outlined, size: 18),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: kasbCtrl,
              decoration: const InputDecoration(
                hintText: "Kasbi (Masalan: Santexnik, Elektrik)",
                prefixIcon: Icon(Icons.work_outline_rounded, size: 18),
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () {
                if (phoneCtrl.text.trim().isEmpty) return;
                Navigator.of(context).pop(true);
              },
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              child: const Text("Qo'shish", style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ],
        ),
      ),
    );
  }
}
