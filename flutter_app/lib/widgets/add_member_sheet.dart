import 'package:flutter/material.dart';

import '../models/worker.dart';
import '../theme/app_theme.dart';
import '../utils/phone_formatter.dart';
import 'member_row.dart' show colorForName;

class AddMemberSheet extends StatefulWidget {
  final TextEditingController phoneCtrl;
  final TextEditingController kasbCtrl;
  final TextEditingController ishaqiCtrl;
  final List<Worker> existingWorkers;

  const AddMemberSheet({
    super.key,
    required this.phoneCtrl,
    required this.kasbCtrl,
    required this.ishaqiCtrl,
    required this.existingWorkers,
  });

  @override
  State<AddMemberSheet> createState() => _AddMemberSheetState();
}

class _AddMemberSheetState extends State<AddMemberSheet> {
  late bool _showNewWorkerFields;
  final Set<Worker> _selectedWorkers = {};

  @override
  void initState() {
    super.initState();
    _showNewWorkerFields = widget.existingWorkers.isEmpty;
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
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
            "Jamoaga qo'shish",
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w900, fontSize: 18),
          ),
          const SizedBox(height: 16),
          
          if (_showNewWorkerFields) ...[
            TextField(
              controller: widget.phoneCtrl,
              keyboardType: TextInputType.phone,
              inputFormatters: [PhoneFormatter()],
              decoration: const InputDecoration(
                hintText: 'Telefon raqam',
                prefixIcon: Icon(Icons.phone_outlined, size: 18),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: widget.kasbCtrl,
              decoration: const InputDecoration(
                hintText: "Kasbi (Masalan: Santexnik, Elektrik)",
                prefixIcon: Icon(Icons.work_outline_rounded, size: 18),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: widget.ishaqiCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                hintText: "Ish haqi (so'm) (ixtiyoriy)",
                prefixIcon: Icon(Icons.monetization_on_outlined, size: 18),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                if (widget.existingWorkers.isNotEmpty) ...[
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => setState(() => _showNewWorkerFields = false),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      child: const Text("Orqaga", style: TextStyle(fontWeight: FontWeight.w800)),
                    ),
                  ),
                  const SizedBox(width: 12),
                ],
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => Navigator.of(context).pop(true),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: const Text("Qo'shish", style: TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ),
              ],
            ),
          ] else ...[
            ElevatedButton.icon(
              icon: const Icon(Icons.person_add_alt_1_rounded, size: 18),
              label: const Text("Yangi ishchi qo'shish", style: TextStyle(fontWeight: FontWeight.w800)),
              onPressed: () => setState(() => _showNewWorkerFields = true),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                backgroundColor: AppColors.accent.withOpacity(0.08),
                foregroundColor: AppColors.accent,
                elevation: 0,
              ),
            ),
          ],
          
          if (widget.existingWorkers.isNotEmpty && !_showNewWorkerFields) ...[
            const SizedBox(height: 24),
            Row(
              children: [
                Container(
                  width: 4,
                  height: 14,
                  decoration: BoxDecoration(
                    color: AppColors.accent,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(width: 8),
                const Text(
                  "Mavjud ishchilardan tanlash",
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.text2),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height * 0.35,
              ),
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: widget.existingWorkers.length,
                separatorBuilder: (_, __) => const Divider(color: AppColors.border, height: 1),
                itemBuilder: (ctx, idx) {
                  final worker = widget.existingWorkers[idx];
                  final color = colorForName(worker.displayName);
                  final initials = worker.displayName.trim().isEmpty
                      ? '?'
                      : worker.displayName.trim()[0].toUpperCase();
                  final isSelected = _selectedWorkers.contains(worker);
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    onTap: () {
                      setState(() {
                        if (isSelected) {
                          _selectedWorkers.remove(worker);
                        } else {
                          _selectedWorkers.add(worker);
                        }
                      });
                    },
                    leading: CircleAvatar(
                      radius: 18,
                      backgroundColor: color.withOpacity(0.12),
                      child: Text(
                        initials,
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: color),
                      ),
                    ),
                    title: Text(
                      worker.displayName,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                    ),
                    subtitle: worker.kasb != null && worker.kasb!.isNotEmpty
                        ? Text(
                            worker.kasb!,
                            style: const TextStyle(fontSize: 11, color: AppColors.muted),
                          )
                        : null,
                    trailing: Icon(
                      isSelected
                          ? Icons.check_circle_rounded
                          : Icons.radio_button_unchecked_rounded,
                      color: isSelected ? AppColors.accent : AppColors.border,
                      size: 22,
                    ),
                  );
                },
              ),
            ),
            if (_selectedWorkers.isNotEmpty) ...[
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: () => Navigator.of(context).pop(_selectedWorkers.toList()),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  backgroundColor: AppColors.accent,
                  foregroundColor: Colors.white,
                ),
                child: Text(
                  "Tanlanganlarni qo'shish (${_selectedWorkers.length} ta)",
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}
