import 'package:flutter/material.dart';

import '../utils/phone_formatter.dart';

class AddMemberSheet extends StatelessWidget {
  final TextEditingController phoneCtrl;
  final TextEditingController kasbCtrl;

  const AddMemberSheet({super.key, required this.phoneCtrl, required this.kasbCtrl});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          "Jamoaga qo'shish",
          style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: phoneCtrl,
          keyboardType: TextInputType.phone,
          inputFormatters: [PhoneFormatter()],
          decoration: const InputDecoration(hintText: 'Telefon raqam'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: kasbCtrl,
          decoration: const InputDecoration(hintText: "Kasbi (Masalan: Santexnik, Elektrik)"),
        ),
        const SizedBox(height: 20),
        ElevatedButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: const Text("Qo'shish"),
        ),
      ],
    );
  }
}
