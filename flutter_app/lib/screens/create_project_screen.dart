import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../data/project_repository.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../utils/haptics.dart';

class CreateProjectScreen extends StatefulWidget {
  const CreateProjectScreen({super.key});

  @override
  State<CreateProjectScreen> createState() => _CreateProjectScreenState();
}

class _CreateProjectScreenState extends State<CreateProjectScreen> {
  final _repo = ProjectRepository();
  final _nameCtrl = TextEditingController();
  final _daysCtrl = TextEditingController(text: '30');
  final _manzilCtrl = TextEditingController();
  final _mijozCtrl = TextEditingController();

  DateTime _startDate = DateTime.now();
  bool _loading = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _daysCtrl.dispose();
    _manzilCtrl.dispose();
    _mijozCtrl.dispose();
    super.dispose();
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
      await _repo.createProject(
        nomi: nomi,
        boshlanish: _startDate,
        muddat: int.tryParse(_daysCtrl.text.trim()) ?? 30,
        manzil: _manzilCtrl.text.trim(),
        mijoz: _mijozCtrl.text.trim(),
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
              tr('new_project'),
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.text,
              ),
            ),
            centerTitle: true,
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
                        autofocus: true,
                        decoration: InputDecoration(
                          hintText: '${tr("project_name")} *',
                          labelText: tr("project_name"),
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
                          hintText: tr('duration_days'),
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
                          hintText: '${tr("location")} ${tr("optional")}',
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
                          hintText: '${tr("client")} ${tr("optional")}',
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
                          tr('create'),
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
