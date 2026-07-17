import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../l10n/strings.dart';
import '../models/worker.dart';
import '../data/worker_repository.dart';
import '../theme/app_theme.dart';
import '../utils/phone_formatter.dart';
import '../utils/price_formatter.dart';
import 'member_row.dart' show colorForName;

class AddMemberSheet extends StatefulWidget {
  final TextEditingController phoneCtrl;
  final TextEditingController kasbCtrl;
  final TextEditingController ishaqiCtrl;
  final Set<String> currentMemberIds;
  final DateTime? defaultBoshlanish;
  final DateTime? defaultTugash;

  const AddMemberSheet({
    super.key,
    required this.phoneCtrl,
    required this.kasbCtrl,
    required this.ishaqiCtrl,
    required this.currentMemberIds,
    this.defaultBoshlanish,
    this.defaultTugash,
  });

  @override
  State<AddMemberSheet> createState() => _AddMemberSheetState();
}

class _AddMemberSheetState extends State<AddMemberSheet> {
  late bool _showNewWorkerFields;
  final Set<Worker> _selectedWorkers = {};
  DateTime? _boshlanish;
  DateTime? _tugash;
  String _selectedCurrency = 'UZS';

  List<Worker> _existingWorkers = [];
  bool _loadingWorkers = true;

  @override
  void initState() {
    super.initState();
    _showNewWorkerFields = false;
    _boshlanish = widget.defaultBoshlanish ?? DateTime.now();
    _tugash = widget.defaultTugash ?? DateTime.now().add(const Duration(days: 30));
    _loadWorkers();
  }

  Future<void> _loadWorkers() async {
    try {
      final allWorkers = await WorkerRepository().loadAll();
      final filtered = allWorkers
          .where((w) =>
              !widget.currentMemberIds.contains(w.userId) &&
              w.profile?.phone.isNotEmpty == true)
          .toList();
      if (!mounted) return;
      setState(() {
        _existingWorkers = filtered;
        _loadingWorkers = false;
        if (filtered.isEmpty) {
          _showNewWorkerFields = true;
        }
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _loadingWorkers = false;
          _showNewWorkerFields = true;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: appLocaleNotifier,
      builder: (context, locale, _) {
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
            tr('add_to_team'),
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
              inputFormatters: [LocalPhoneFormatter()],
              decoration: const InputDecoration(
                hintText: '90 123 45 67',
                prefixText: '+998 ',
                prefixStyle: TextStyle(color: AppColors.text),
                prefixIcon: Icon(Icons.phone_outlined, size: 18),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: widget.kasbCtrl,
              decoration: InputDecoration(
                hintText: tr('profession_hint'),
                prefixIcon: const Icon(Icons.work_outline_rounded, size: 18),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: ChoiceChip(
                    label: Text(tr('currency_uzs')),
                    selected: _selectedCurrency == 'UZS',
                    onSelected: (val) {
                      if (val) setState(() => _selectedCurrency = 'UZS');
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ChoiceChip(
                    label: Text(tr('currency_usd')),
                    selected: _selectedCurrency == 'USD',
                    onSelected: (val) {
                      if (val) setState(() => _selectedCurrency = 'USD');
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: widget.ishaqiCtrl,
              keyboardType: TextInputType.number,
              inputFormatters: [PriceInputFormatter()],
              decoration: InputDecoration(
                hintText: _selectedCurrency == 'UZS'
                    ? "${tr('salary')} (${tr('currency_uzs')}) (${tr('optional')})"
                    : "${tr('salary')} (\$) (${tr('optional')})",
                prefixIcon: const Icon(Icons.payments_outlined, size: 18),
              ),
            ),
            const SizedBox(height: 16),
            _buildDatePickerRow(),
            const SizedBox(height: 16),
            Row(
              children: [
                if (_existingWorkers.isNotEmpty) ...[
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => setState(() => _showNewWorkerFields = false),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      child: Text(tr('back'), style: const TextStyle(fontWeight: FontWeight.w800)),
                    ),
                  ),
                  const SizedBox(width: 12),
                ],
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => Navigator.of(context).pop({
                      'isNew': true,
                      'boshlanish': _boshlanish,
                      'tugash': _tugash,
                      'currency': _selectedCurrency,
                    }),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: Text(tr('add'), style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ),
              ],
            ),
          ] else ...[
            ElevatedButton.icon(
              icon: const Icon(Icons.person_add_alt_1_rounded, size: 18),
              label: Text(tr('add_new_worker'), style: const TextStyle(fontWeight: FontWeight.w800)),
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
          
          if (_loadingWorkers) ...[
            const SizedBox(height: 24),
            const Center(child: CircularProgressIndicator()),
          ] else if (_existingWorkers.isNotEmpty && !_showNewWorkerFields) ...[
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
                Text(
                  tr('choose_from_existing'),
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.text2),
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
                itemCount: _existingWorkers.length,
                separatorBuilder: (_, __) => const Divider(color: AppColors.border, height: 1),
                itemBuilder: (ctx, idx) {
                  final worker = _existingWorkers[idx];
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
              _buildDatePickerRow(),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => Navigator.of(context).pop({
                  'isNew': false,
                  'workers': _selectedWorkers.toList(),
                  'boshlanish': _boshlanish,
                  'tugash': _tugash,
                }),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  backgroundColor: AppColors.accent,
                  foregroundColor: Colors.white,
                ),
                 child: Text(
                  tr('add_selected')
                      .replaceFirst('{}', '${_selectedWorkers.length}'),
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ],
        ],
      ),
    );
      },
    );
  }

  Widget _buildDatePickerRow() {
    final fmt = DateFormat('dd.MM.yyyy');
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 3,
                height: 12,
                decoration: BoxDecoration(
                  color: AppColors.accent,
                  borderRadius: BorderRadius.circular(1.5),
                ),
              ),
              const SizedBox(width: 6),
              Text(
                tr('work_duration'),
                style: const TextStyle(fontSize: 12, color: AppColors.text, fontWeight: FontWeight.w800),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _buildDatePickerButton(
                  label: tr('start_date'),
                  date: _boshlanish,
                  formatter: fmt,
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: _boshlanish ?? DateTime.now(),
                      firstDate: DateTime(2020),
                      lastDate: DateTime(2100),
                    );
                    if (picked != null) {
                      setState(() {
                        _boshlanish = picked;
                        if (_tugash != null && _tugash!.isBefore(picked)) {
                          _tugash = picked.add(const Duration(days: 30));
                        }
                      });
                    }
                  },
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildDatePickerButton(
                  label: tr('end_date'),
                  date: _tugash,
                  formatter: fmt,
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: _tugash ?? DateTime.now().add(const Duration(days: 30)),
                      firstDate: DateTime(2020),
                      lastDate: DateTime(2100),
                    );
                    if (picked != null) {
                      setState(() {
                        _tugash = picked;
                        if (_boshlanish != null && _boshlanish!.isAfter(picked)) {
                          _boshlanish = picked.subtract(const Duration(days: 30));
                        }
                      });
                    }
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDatePickerButton({
    required String label,
    required DateTime? date,
    required DateFormat formatter,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontSize: 9, color: AppColors.muted)),
                  const SizedBox(height: 2),
                  Text(
                    date != null ? formatter.format(date) : tr('select'),
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.text),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.calendar_month_outlined, size: 14, color: AppColors.accent),
          ],
        ),
      ),
    );
  }
}
