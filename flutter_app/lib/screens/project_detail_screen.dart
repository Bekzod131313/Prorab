import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../l10n/strings.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show FileOptions;
import 'package:url_launcher/url_launcher.dart';

import '../data/member_repository.dart';
import '../data/project_files_repository.dart';
import '../data/project_repository.dart';
import '../data/transaction_repository.dart';
import '../main.dart';
import '../models/worker.dart';
import '../models/member.dart';
import '../models/project.dart';
import '../models/transaction.dart';
import '../theme/app_theme.dart';
import '../widgets/add_member_sheet.dart';
import '../widgets/member_row.dart' show colorForName;
import '../widgets/project_card.dart' show formatUzsToDisplay, formatTransactionAmount;
import '../services/currency_service.dart';
import '../widgets/shimmer.dart';
import '../utils/price_formatter.dart';
import '../utils/phone_formatter.dart';
import '../utils/haptics.dart';


class _ExpenseCategory {
  final String name;
  final IconData icon;
  final bool isWorker;
  const _ExpenseCategory(
      {required this.name, this.icon = Icons.category_rounded, this.isWorker = false});
}

Future<List<_ExpenseCategory>> _loadCustomCategories() async {
  try {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return [];
    final data = await supabase
        .from('categories')
        .select('name')
        .eq('user_id', userId);
    return (data as List)
        .map((row) => _ExpenseCategory(
              name: row['name'] as String,
              icon: Icons.category_rounded,
            ))
        .toList();
  } catch (_) {
    return [];
  }
}

Future<void> _saveCustomCategories(List<_ExpenseCategory> categories) async {
  try {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return;
    final customCats = categories.where((c) => !c.isWorker && c.name != "O'zim").toList();
    if (customCats.isEmpty) return;
    final last = customCats.last;
    final existing = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', userId)
        .eq('name', last.name)
        .maybeSingle();
    if (existing == null) {
      await supabase.from('categories').insert({
        'user_id': userId,
        'name': last.name,
      });
    }
  } catch (_) {}
}

class ProjectDetailScreen extends StatefulWidget {
  final Project project;
  final bool? quickAddIncome;

  const ProjectDetailScreen(
      {super.key, required this.project, this.quickAddIncome});

  @override
  State<ProjectDetailScreen> createState() => _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends State<ProjectDetailScreen>
    with SingleTickerProviderStateMixin {
  final _txRepo = TransactionRepository();
  final _memberRepo = MemberRepository();
  final _projectRepo = ProjectRepository();
  final _filesRepo = ProjectFilesRepository();
  final _dateFmt = DateFormat('dd MMM yyyy');
  String _formatDate(DateTime date) => DateFormat('dd MMM yyyy', appLocaleNotifier.value).format(date);

  late Project _project;
  List<ProjectTransaction> _txs = [];
  List<ObMember> _members = [];
  List<ProjectFile> _files = [];
  bool _loading = true;
  bool _filesLoading = false;
  String _txFilter = 'all';
  String _sortBy = 'date';
  DateTimeRange? _dateRange;

  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _project = widget.project;
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(() {
      if (_tabController.index == 2 && _files.isEmpty && !_filesLoading) {
        _loadFiles();
      }
    });
    _loadAndQuickAdd();
  }

  Future<void> _loadAndQuickAdd() async {
    await _load();
    if (widget.quickAddIncome != null && mounted) {
      _openAddTransaction(isIncome: widget.quickAddIncome!);
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _pickAndUploadImage() async {
    try {
      final picker = ImagePicker();
      final file =
          await picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
      if (file == null) return;
      final bytes = await file.readAsBytes();
      final path = '${_project.id}/cover.jpg';
      await supabase.storage.from('project-images').uploadBinary(
            path,
            bytes,
            fileOptions: FileOptions(contentType: 'image/jpeg', upsert: true),
          );
      final ts = DateTime.now().millisecondsSinceEpoch;
      final publicUrl =
          '${supabase.storage.from('project-images').getPublicUrl(path)}?t=$ts';
      await _projectRepo.updateImage(_project.id, publicUrl);
      if (!mounted) return;
      setState(() {
        _project = _project.copyWith(imageUrl: publicUrl);
      });
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(tr('image_uploaded'))));
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('${tr('error')}: $e')));
    }
  }

  Future<void> _loadSilent() async {
    final userId = supabase.auth.currentUser?.id;
    try {
      final results = await Future.wait([
        _txRepo.loadForProject(_project.id, createdBy: userId),
        _memberRepo.loadForProject(_project.id),
        _projectRepo.loadProjectById(_project.id),
      ]);
      if (!mounted) return;
      setState(() {
        _txs = results[0] as List<ProjectTransaction>;
        _members = results[1] as List<ObMember>;
        final refreshed = results[2] as Project?;
        if (refreshed != null) _project = refreshed;
      });
    } catch (_) {}
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    await _loadSilent();
    if (mounted) {
      setState(() => _loading = false);
    }
  }

  Future<void> _loadFiles() async {
    setState(() => _filesLoading = true);
    try {
      final files = await _filesRepo.listFiles(_project.id);
      if (!mounted) return;
      setState(() {
        _files = files;
        _filesLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _filesLoading = false);
    }
  }

  List<ObMember> get _visibleMembers {
    final userId = supabase.auth.currentUser?.id;
    return _members.where((m) => m.addedBy == userId).toList();
  }

  List<ProjectTransaction> get _filteredTxs {
    var base = _txs;
    switch (_txFilter) {
      case 'income':
        base = base.where((tx) => tx.tur == 'income').toList();
        break;
      case 'expense':
        base = base.where((tx) => tx.tur != 'income').toList();
        break;
    }

    if (_dateRange != null) {
      final startOfDay = DateTime(_dateRange!.start.year, _dateRange!.start.month, _dateRange!.start.day);
      final endOfDay = DateTime(_dateRange!.end.year, _dateRange!.end.month, _dateRange!.end.day, 23, 59, 59);
      base = base.where((tx) => tx.date.isAfter(startOfDay.subtract(const Duration(seconds: 1))) && tx.date.isBefore(endOfDay.add(const Duration(seconds: 1)))).toList();
    }

    if (_sortBy == 'price') {
      base.sort((a, b) => b.summaUzs.compareTo(a.summaUzs));
    } else {
      base.sort((a, b) => b.date.compareTo(a.date));
    }

    return base;
  }

  Future<_ExpenseCategory?> _openAddCategoryDialog(BuildContext ctx) async {
    final nameCtrl = TextEditingController();
    final result = await showDialog<_ExpenseCategory>(
      context: ctx,
      builder: (dctx) => AlertDialog(
        title: Text(tr('new_category')),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: nameCtrl,
              autofocus: true,
              decoration: InputDecoration(
                hintText: tr('category_name'),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dctx).pop(),
            child: Text(tr('cancel')),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            ),
            onPressed: () {
              final name = nameCtrl.text.trim();
              if (name.isEmpty) return;
              Navigator.of(dctx).pop(
                _ExpenseCategory(name: name, icon: Icons.category_rounded),
              );
            },
            child: Text(tr('save')),
          ),
        ],
      ),
    );
    Future.delayed(const Duration(milliseconds: 350), () {
      nameCtrl.dispose();
    });
    return result;
  }

  Future<void> _selectDateRange() async {
    final picked = await showDateRangePicker(
      context: context,
      initialDateRange: _dateRange,
      firstDate: DateTime(2020),
      lastDate: DateTime(2030),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: Theme.of(context).colorScheme.copyWith(
                  primary: AppColors.accent,
                  onPrimary: Colors.white,
                  surface: AppColors.card,
                  onSurface: AppColors.text,
                ),
          ),
          child: child!,
        );
      },
    );
    if (picked != null) {
      setState(() => _dateRange = picked);
    }
  }

  Future<void> _openAddTransaction(
      {required bool isIncome, String? preSelectedWorkerId}) async {
    final amountCtrl = TextEditingController();
    final noteCtrl = TextEditingController();
    final workers = _visibleMembers;
    final isMember = _project.role == 'member';

    final customCategories =
        isIncome ? <_ExpenseCategory>[] : await _loadCustomCategories();
    final categories = isIncome
        ? <_ExpenseCategory>[]
        : [
            _ExpenseCategory(
                name: 'Xodim', icon: Icons.engineering_rounded, isWorker: true),
            ...customCategories,
          ];

    _ExpenseCategory? selectedCategory =
        categories.isNotEmpty ? categories.first : null;
    String? selectedToUserId = preSelectedWorkerId;

     if (preSelectedWorkerId != null && !isIncome) {
      selectedCategory = categories.firstWhere((c) => c.isWorker,
          orElse: () => categories.first);
    }

    String selectedCurrencyCode = CurrencyService().displayCurrency;

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
          builder: (ctx, setSt) => Padding(
                padding: EdgeInsets.only(
                    left: 20,
                    right: 20,
                    top: 24,
                    bottom: 24 + MediaQuery.of(ctx).viewInsets.bottom),
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                    Row(children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                            color: (isIncome ? AppColors.green : AppColors.red)
                                .withOpacity(0.1),
                            borderRadius: BorderRadius.circular(10)),
                        child: Icon(
                            isIncome
                                ? Icons.arrow_downward_rounded
                                : Icons.arrow_upward_rounded,
                            color: isIncome ? AppColors.green : AppColors.red,
                            size: 18),
                      ),
                      const SizedBox(width: 10),
                      Text(isIncome ? tr('add_income') : tr('add_expense'),
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 17)),
                    ]),
                    const SizedBox(height: 16),
                     Row(
                      children: [
                        Expanded(
                          child: ChoiceChip(
                            label: Text(tr('currency_uzs')),
                            selected: selectedCurrencyCode == 'UZS',
                            onSelected: (val) {
                              if (val) setSt(() => selectedCurrencyCode = 'UZS');
                            },
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: ChoiceChip(
                            label: Text(tr('currency_usd')),
                            selected: selectedCurrencyCode == 'USD',
                            onSelected: (val) {
                              if (val) setSt(() => selectedCurrencyCode = 'USD');
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                        controller: amountCtrl,
                        keyboardType: TextInputType.number,
                        inputFormatters: [PriceInputFormatter()],
                        autofocus: true,
                        decoration: InputDecoration(
                            hintText: selectedCurrencyCode == 'UZS' ? "${tr('amount')} (${tr('currency_uzs')})" : "${tr('amount')} (\$)",
                            prefixIcon: const Icon(Icons.payments_outlined,
                                size: 18))),
                    const SizedBox(height: 12),
                    if (!isIncome) ...[
                      Text(tr('category'),
                          style:
                              const TextStyle(fontSize: 12, color: AppColors.muted)),
                      const SizedBox(height: 8),
                      Wrap(spacing: 10, runSpacing: 10, children: [
                        ...categories.map((c) {
                          final selected = selectedCategory?.name == c.name;
                          return GestureDetector(
                            onTap: () => setSt(() {
                              selectedCategory = c;
                              if (!c.isWorker) selectedToUserId = null;
                            }),
                            onLongPress: (!c.isWorker && c.name != tr('worker'))
                                ? () async {
                                    final confirm = await showDialog<bool>(
                                      context: context,
                                      builder: (dctx) => AlertDialog(
                                        title: Text(tr('delete_category')),
                                        content: Text(tr('delete_category_q').replaceFirst('{}', c.name)),
                                        actions: [
                                          TextButton(
                                            onPressed: () => Navigator.of(dctx).pop(false),
                                            child: Text(tr('no')),
                                          ),
                                          ElevatedButton(
                                            style: ElevatedButton.styleFrom(
                                              backgroundColor: AppColors.red,
                                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                                            ),
                                            onPressed: () => Navigator.of(dctx).pop(true),
                                            child: Text(tr('delete')),
                                          ),
                                        ],
                                      ),
                                    );
                                    if (confirm == true) {
                                      try {
                                        final userId = supabase.auth.currentUser?.id;
                                        if (userId != null) {
                                          await supabase
                                              .from('categories')
                                              .delete()
                                              .eq('user_id', userId)
                                              .eq('name', c.name);
                                        }
                                        setSt(() {
                                          customCategories.removeWhere((item) => item.name == c.name);
                                          categories.removeWhere((item) => item.name == c.name);
                                          if (selectedCategory?.name == c.name) {
                                            selectedCategory = categories.isNotEmpty ? categories.first : null;
                                            selectedToUserId = null;
                                          }
                                        });
                                      } catch (_) {}
                                    }
                                  }
                                : null,
                            child: Container(
                              width: 72,
                              height: 64,
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 4),
                              decoration: BoxDecoration(
                                color: selected
                                    ? AppColors.red.withOpacity(0.12)
                                    : AppColors.bg,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                    color: selected
                                        ? AppColors.red
                                        : AppColors.border),
                              ),
                              child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(c.icon,
                                        size: 20,
                                        color: selected
                                            ? AppColors.red
                                            : AppColors.text2),
                                    const SizedBox(height: 4),
                                    Text(c.name == 'Xodim' ? tr('xodim_category') : c.name,
                                        textAlign: TextAlign.center,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w700,
                                            color: selected
                                                ? AppColors.red
                                                : AppColors.text2)),
                                  ]),
                            ),
                          );
                        }),
                        GestureDetector(
                          onTap: () async {
                            final added = await _openAddCategoryDialog(context);
                            if (added != null) {
                              categories.add(added);
                              await _saveCustomCategories(categories
                                  .where((c) => !c.isWorker)
                                  .toList());
                              setSt(() => selectedCategory = added);
                            }
                          },
                          child: Container(
                            width: 72,
                            height: 64,
                            decoration: BoxDecoration(
                              color: AppColors.bg,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AppColors.border),
                            ),
                            child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const Icon(Icons.add_rounded,
                                      size: 20, color: AppColors.accent),
                                  const SizedBox(height: 4),
                                  Text(tr('other'),
                                      style: const TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w700,
                                          color: AppColors.accent)),
                                ]),
                          ),
                        ),
                      ]),
                      const SizedBox(height: 12),
                      if (selectedCategory?.isWorker == true) ...[
                        if (workers.isEmpty)
                          Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: Text(tr('no_workers_in_project'),
                                  style: const TextStyle(
                                      fontSize: 12, color: AppColors.muted)))
                        else ...[
                           GestureDetector(
                            onTap: () async {
                              final selected = await showModalBottomSheet<String>(
                                context: context,
                                backgroundColor: AppColors.card,
                                shape: const RoundedRectangleBorder(
                                  borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                                ),
                                builder: (bctx) => SafeArea(
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Padding(
                                        padding: const EdgeInsets.symmetric(vertical: 16),
                                        child: Text(
                                          tr('select_worker'),
                                          style: const TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.w800,
                                            color: AppColors.text,
                                          ),
                                        ),
                                      ),
                                      const Divider(height: 1),
                                      Flexible(
                                        child: ListView.builder(
                                          shrinkWrap: true,
                                          itemCount: workers.length,
                                          itemBuilder: (lctx, index) {
                                            final w = workers[index];
                                            return ListTile(
                                              title: Text(w.displayName, style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.text)),
                                              trailing: selectedToUserId == w.userId
                                                  ? const Icon(Icons.check_circle_rounded, color: AppColors.accent)
                                                  : null,
                                              onTap: () => Navigator.of(lctx).pop(w.userId),
                                            );
                                          },
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                              if (selected != null) {
                                setSt(() => selectedToUserId = selected);
                              }
                            },
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                              decoration: BoxDecoration(
                                color: AppColors.bg,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: AppColors.border),
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          tr('worker'),
                                          style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w500),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          selectedToUserId != null
                                              ? workers.firstWhere((w) => w.userId == selectedToUserId, orElse: () => workers.first).displayName
                                              : tr('select_worker'),
                                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.text),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const Icon(Icons.keyboard_arrow_down_rounded, color: AppColors.muted),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                        ],
                      ],
                    ],
                    TextField(
                        controller: noteCtrl,
                        decoration: InputDecoration(
                            hintText: tr('comment_hint'))),
                    const SizedBox(height: 20),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                          backgroundColor:
                              isIncome ? AppColors.green : AppColors.red),
                      onPressed: () {
                        if (amountCtrl.text.trim().isEmpty) return;
                        if (!isIncome &&
                            selectedCategory?.isWorker == true &&
                            selectedToUserId == null) {
                          ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
                              content: Text(tr('select_worker'))));
                          return;
                        }
                        Navigator.of(ctx).pop(true);
                      },
                      child:
                          Text(isIncome ? tr('add_income') : tr('add_expense')),
                    ),
                  ],
                ),
              ))),
    );

    final amountText = amountCtrl.text.trim();
    final noteText = noteCtrl.text.trim();
    Future.delayed(const Duration(milliseconds: 350), () {
      amountCtrl.dispose();
      noteCtrl.dispose();
    });

    if (confirmed != true) return;
    final amount = num.tryParse(amountText.replaceAll(' ', '')) ?? 0;
    if (amount <= 0) return;

    // Save originals for rollback
    final originalTxs = List<ProjectTransaction>.from(_txs);
    final originalProject = _project;
    final originalMembers = List<ObMember>.from(_members);

    // Prepare optimistic updates
    final rate = CurrencyService().usdToUzsRate;
    final converted = CurrencyService().convert(amount.toDouble(), selectedCurrencyCode);
    final amountUzs = converted['UZS']!;
    final amountUsd = converted['USD']!;

    final tempTx = ProjectTransaction(
      id: 'temp_${DateTime.now().millisecondsSinceEpoch}',
      obId: _project.id,
      tur: isIncome ? 'income' : 'spend',
      summa: amount,
      izoh: noteText.isNotEmpty ? noteText : null,
      kategoriya: isIncome ? 'Kirim' : (selectedCategory?.name ?? 'Boshqa'),
      toUser: isIncome ? null : selectedToUserId,
      fromUser: isIncome ? supabase.auth.currentUser?.id : null,
      createdBy: supabase.auth.currentUser?.id,
      date: DateTime.now(),
      currency: selectedCurrencyCode,
      exchangeRate: rate,
      summaUsd: amountUsd,
      summaUzs: amountUzs,
    );

    final updatedProject = Project(
      id: _project.id,
      nomi: _project.nomi,
      kirim: _project.kirim + (isIncome ? amount : 0),
      chiqim: _project.chiqim + (isIncome ? 0 : amount),
      boshlanish: _project.boshlanish,
      tugash: _project.tugash,
      createdAt: _project.createdAt,
      muddat: _project.muddat,
      role: _project.role,
      myBalance: _project.myBalance + (isIncome ? amount : -amount),
      ishaqi: _project.ishaqi,
      olingan: _project.olingan + ((!isIncome && selectedCategory?.isWorker == true) ? amount : 0),
      status: _project.status,
      manzil: _project.manzil,
      mijoz: _project.mijoz,
      bosqich: _project.bosqich,
      imageUrl: _project.imageUrl,
    );

    List<ObMember> updatedMembers = _members;
    if (!isIncome && selectedCategory?.isWorker == true && selectedToUserId != null) {
      updatedMembers = _members.map((m) {
        if (m.userId == selectedToUserId) {
          return ObMember(
            obId: m.obId,
            userId: m.userId,
            role: m.role,
            ishaqi: m.ishaqi,
            olingan: m.olingan + amount,
            kasb: m.kasb,
            addedBy: m.addedBy,
            profile: m.profile,
            boshlanish: m.boshlanish,
            tugash: m.tugash,
            kirim: m.kirim,
            chiqim: m.chiqim,
          );
        }
        return m;
      }).toList();
    }

    // Apply optimistic updates instantly
    AppHaptics.medium();
    setState(() {
      _txs = [tempTx, ..._txs];
      _project = updatedProject;
      _members = updatedMembers;
    });

    try {
      if (!isIncome && isMember) {
        if (selectedCategory?.isWorker == true && selectedToUserId != null) {
          await _txRepo.distributeToSubWorker(
            obId: _project.id,
            toUserId: selectedToUserId!,
            amount: amount,
            izoh: noteText.isNotEmpty ? noteText : null,
            currency: selectedCurrencyCode,
          );
        } else {
          await _txRepo.logSelfWithdrawal(
            obId: _project.id,
            amount: amount,
            kategoriya: selectedCategory?.name ?? "O'zim",
            izoh: noteText.isNotEmpty ? noteText : null,
            currency: selectedCurrencyCode,
          );
        }
      } else {
        await _txRepo.addTransaction(
          obId: _project.id,
          isIncome: isIncome,
          amount: amount,
          kategoriya: isIncome ? 'Kirim' : (selectedCategory?.name ?? 'Boshqa'),
          izoh: noteText.isNotEmpty ? noteText : null,
          toUserId: isIncome ? null : selectedToUserId,
          currency: selectedCurrencyCode,
        );
      }
      // Re-load silently to keep UI clean and replace temp data
      await _loadSilent();
    } catch (e) {
      // Rollback on error
      if (mounted) {
        setState(() {
          _txs = originalTxs;
          _project = originalProject;
          _members = originalMembers;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Xato: $e')),
        );
      }
    }
  }

  Future<void> _openEditProject() async {
    final nameCtrl = TextEditingController(text: _project.nomi);
    final daysCtrl = TextEditingController(text: _project.muddat.toString());
    final manzilCtrl = TextEditingController(text: _project.manzil ?? '');
    final mijozCtrl = TextEditingController(text: _project.mijoz ?? '');
    DateTime startDate = _project.boshlanish ?? DateTime.now();

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
          builder: (ctx, setSt) => Padding(
                padding: EdgeInsets.only(
                    left: 20,
                    right: 20,
                    top: 24,
                    bottom: 24 + MediaQuery.of(ctx).viewInsets.bottom),
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                    Row(children: [
                      Expanded(
                          child: Text(tr('edit_project_title'),
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800, fontSize: 17))),
                      IconButton(
                        icon: const Icon(Icons.camera_alt_outlined,
                            color: AppColors.accent),
                        tooltip: tr('upload_photo'),
                        onPressed: () async {
                          Navigator.of(ctx).pop();
                          await _pickAndUploadImage();
                        },
                      ),
                    ]),
                    const SizedBox(height: 12),
                    TextField(
                        controller: nameCtrl,
                        autofocus: true,
                        decoration: InputDecoration(
                            hintText: '${tr('project_name')} *', labelText: tr('project_name'))),
                    const SizedBox(height: 12),
                    InkWell(
                      onTap: () async {
                        final picked = await showDatePicker(
                            context: ctx,
                            initialDate: startDate,
                            firstDate: DateTime(2020),
                            lastDate: DateTime(2100));
                        if (picked != null) setSt(() => startDate = picked);
                      },
                      child: InputDecorator(
                        decoration: InputDecoration(
                            labelText: tr('start_date'),
                            prefixIcon:
                                const Icon(Icons.calendar_today_rounded, size: 18)),
                        child: Text(DateFormat('dd.MM.yyyy').format(startDate)),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                        controller: daysCtrl,
                        keyboardType: TextInputType.number,
                        decoration: InputDecoration(
                            labelText: tr('duration_days'),
                            prefixIcon: const Icon(Icons.timer_outlined, size: 18))),
                    const SizedBox(height: 12),
                    TextField(
                        controller: manzilCtrl,
                        decoration: InputDecoration(
                            labelText: tr('location'),
                            prefixIcon:
                                const Icon(Icons.location_on_outlined, size: 18))),
                    const SizedBox(height: 12),
                    TextField(
                        controller: mijozCtrl,
                        decoration: InputDecoration(
                            labelText: tr('client'),
                            prefixIcon:
                                const Icon(Icons.person_outline_rounded, size: 18))),
                    const SizedBox(height: 20),
                    ElevatedButton(
                      onPressed: () {
                        if (nameCtrl.text.trim().isEmpty) return;
                        Navigator.of(ctx).pop(true);
                      },
                      child: Text(tr('save')),
                    ),
                  ],
                ),
              ))),
    );

    if (saved == true) {
      await _projectRepo.updateProject(
        id: _project.id,
        nomi: nameCtrl.text.trim(),
        boshlanish: startDate,
        muddat: int.tryParse(daysCtrl.text.trim()) ?? _project.muddat,
        manzil: manzilCtrl.text.trim(),
        mijoz: mijozCtrl.text.trim(),
        bosqich: _project.bosqich,
      );
      _loadSilent();
    }
    Future.delayed(const Duration(milliseconds: 350), () {
      nameCtrl.dispose();
      daysCtrl.dispose();
      manzilCtrl.dispose();
      mijozCtrl.dispose();
    });
  }

  void _openWorkerProfile(ObMember m) {
    final color = colorForName(m.displayName);
    final initials = m.displayName.trim().isEmpty
        ? '?'
        : m.displayName.trim()[0].toUpperCase();
    final balance = m.ishaqi - m.olingan;

    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Avatar
              CircleAvatar(
                radius: 32,
                backgroundColor: color.withOpacity(0.15),
                child: Text(initials,
                    style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        color: color)),
              ),
              const SizedBox(height: 12),
              Text(m.displayName,
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w800)),
              if (m.kasb != null && m.kasb!.isNotEmpty)
                Text(m.kasb!,
                    style:
                        const TextStyle(fontSize: 13, color: AppColors.muted)),
              if (m.profile?.phone.isNotEmpty == true) ...[
                const SizedBox(height: 4),
                Text(PhoneFormatter.format(m.profile!.phone),
                    style:
                        const TextStyle(fontSize: 13, color: AppColors.accent)),
              ],
              const SizedBox(height: 20),
              Container(
                decoration: BoxDecoration(
                    color: AppColors.bg,
                    borderRadius: BorderRadius.circular(14)),
                child: Column(children: [
                  _WorkerInfoRow(
                      label: tr('salary'),
                      value: formatUzsToDisplay(m.ishaqi),
                      color: AppColors.text),
                  const Divider(color: AppColors.border, height: 1, indent: 14),
                  _WorkerInfoRow(
                      label: tr('received'),
                      value: formatUzsToDisplay(m.olingan),
                      color: AppColors.green),
                  const Divider(color: AppColors.border, height: 1, indent: 14),
                  _WorkerInfoRow(
                    label: tr('balance'),
                    value: formatUzsToDisplay(balance),
                    color: balance > 0 ? AppColors.orange : AppColors.muted,
                  ),
                  if (m.boshlanish != null && m.tugash != null) ...[
                    const Divider(color: AppColors.border, height: 1, indent: 14),
                    _WorkerInfoRow(
                      label: tr('duration_days').replaceAll(' (kun)', ''), // Muddat/Muddati fallback
                      value: "${_formatDate(m.boshlanish!)} - ${_formatDate(m.tugash!)}",
                      color: AppColors.text,
                    ),
                  ],
                ]),
              ),
              const SizedBox(height: 16),
              Row(children: [
                Expanded(
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.red,
                        side: const BorderSide(color: AppColors.red)),
                    icon: const Icon(Icons.person_remove_outlined, size: 16),
                    label: Text(tr('delete')),
                    onPressed: () async {
                      Navigator.of(ctx).pop();
                      final confirm = await showDialog<bool>(
                        context: context,
                        builder: (d) => AlertDialog(
                          title: Text(tr('delete_worker_title')),
                          content: Text(tr('delete_worker_q').replaceFirst('{}', m.displayName)),
                          actions: [
                            TextButton(
                                onPressed: () => Navigator.of(d).pop(false),
                                child: Text(tr('cancel'))),
                            ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                    backgroundColor: AppColors.red,
                                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10)),
                                onPressed: () => Navigator.of(d).pop(true),
                                child: Text(tr('delete'))),
                          ],
                        ),
                      );
                      if (confirm == true) {
                        await _memberRepo.removeMember(
                            obId: _project.id, userId: m.userId);
                        _loadSilent();
                      }
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.accent),
                    icon: const Icon(Icons.payments_outlined, size: 16),
                    label: Text(tr('pay')),
                    onPressed: () {
                      Navigator.of(ctx).pop();
                      _openAddTransaction(
                          isIncome: false, preSelectedWorkerId: m.userId);
                    },
                  ),
                ),
              ]),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openAddMember() async {
    final phoneCtrl = TextEditingController();
    final kasbCtrl = TextEditingController();
    final ishaqiCtrl = TextEditingController();

    final result = await showModalBottomSheet<dynamic>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 24,
            bottom: 24 + MediaQuery.of(ctx).viewInsets.bottom),
        child: AddMemberSheet(
          phoneCtrl: phoneCtrl,
          kasbCtrl: kasbCtrl,
          ishaqiCtrl: ishaqiCtrl,
          currentMemberIds: _members.map((m) => m.userId).toSet(),
          defaultBoshlanish: _project.boshlanish,
          defaultTugash: _project.tugash ?? (_project.boshlanish != null ? _project.boshlanish!.add(Duration(days: _project.muddat)) : null),
        ),
      ),
    );

    if (result is Map) {
      final boshlanish = result['boshlanish'] as DateTime?;
      final tugash = result['tugash'] as DateTime?;
      final isNew = result['isNew'] as bool;
      final currency = (result['currency'] as String?) ?? 'UZS';
      if (isNew) {
        try {
          var ishaqi = num.tryParse(ishaqiCtrl.text.replaceAll(' ', '')) ?? 0;
          if (currency == 'USD') {
            final converted = CurrencyService().convert(ishaqi.toDouble(), 'USD');
            ishaqi = converted['UZS'] ?? (ishaqi * CurrencyService().usdToUzsRate);
          }
          await _memberRepo.addMember(
              obId: _project.id,
              phone: phoneCtrl.text.trim(),
              kasb: kasbCtrl.text.trim(),
              ishaqi: ishaqi,
              boshlanish: boshlanish,
              tugash: tugash);
          _loadSilent();
        } catch (e) {
          if (mounted)
            ScaffoldMessenger.of(context)
                .showSnackBar(SnackBar(content: Text(e.toString())));
        }
      } else {
        final workers = result['workers'] as List<Worker>;
        int successCount = 0;
        final errors = <String>[];
        for (final w in workers) {
          try {
            if (w.profile?.phone != null) {
              await _memberRepo.addMember(
                  obId: _project.id,
                  phone: w.profile!.phone,
                  kasb: w.kasb,
                  boshlanish: boshlanish,
                  tugash: tugash);
              successCount++;
            }
          } catch (e) {
            errors.add("${w.displayName}: $e");
          }
        }
        _loadSilent();
        if (mounted) {
          if (errors.isEmpty) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                content: Text("$successCount ta ishchi jamoaga qo'shildi")));
          } else {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                content: Text(
                    "$successCount ta qo'shildi. Xatoliklar: ${errors.join(', ')}")));
          }
        }
      }
    }

    Future.delayed(const Duration(milliseconds: 350), () {
      phoneCtrl.dispose();
      kasbCtrl.dispose();
      ishaqiCtrl.dispose();
    });
  }

  Future<void> _deleteTransaction(ProjectTransaction tx) async {
    final originalTxs = List<ProjectTransaction>.from(_txs);
    final originalProject = _project;
    final originalMembers = List<ObMember>.from(_members);

    final isIncome = tx.tur == 'income';
    final amount = tx.summa;
    final updatedProject = Project(
      id: _project.id,
      nomi: _project.nomi,
      kirim: _project.kirim - (isIncome ? amount : 0),
      chiqim: _project.chiqim - (isIncome ? 0 : amount),
      boshlanish: _project.boshlanish,
      tugash: _project.tugash,
      createdAt: _project.createdAt,
      muddat: _project.muddat,
      role: _project.role,
      myBalance: _project.myBalance - (isIncome ? amount : -amount),
      ishaqi: _project.ishaqi,
      olingan: _project.olingan - ((!isIncome && tx.toUser != null) ? amount : 0),
      status: _project.status,
      manzil: _project.manzil,
      mijoz: _project.mijoz,
      bosqich: _project.bosqich,
      imageUrl: _project.imageUrl,
    );

    List<ObMember> updatedMembers = _members;
    if (!isIncome && tx.toUser != null) {
      updatedMembers = _members.map((m) {
        if (m.userId == tx.toUser) {
          return ObMember(
            obId: m.obId,
            userId: m.userId,
            role: m.role,
            ishaqi: m.ishaqi,
            olingan: m.olingan - amount,
            kasb: m.kasb,
            addedBy: m.addedBy,
            profile: m.profile,
            boshlanish: m.boshlanish,
            tugash: m.tugash,
            kirim: m.kirim,
            chiqim: m.chiqim,
          );
        }
        return m;
      }).toList();
    }

    AppHaptics.heavy();
    setState(() {
      _txs = _txs.where((t) => t.id != tx.id).toList();
      _project = updatedProject;
      _members = updatedMembers;
    });

    try {
      await _txRepo.deleteTransaction(tx.id);
      _loadSilent();
    } catch (e) {
      if (mounted) {
        setState(() {
          _txs = originalTxs;
          _project = originalProject;
          _members = originalMembers;
        });
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Xato: $e')));
      }
    }
  }

  Future<void> _showTransactionDetails(ProjectTransaction tx) async {
    final isIncome = tx.tur == 'income';
    final color = isIncome ? AppColors.green : AppColors.red;
    
    String displayCategory = tx.kategoriya ?? (isIncome ? tr('income') : tr('expense'));
    if (displayCategory == 'usta' || displayCategory == 'Xodim') {
      displayCategory = tr('worker_default_role');
    } else if (displayCategory == 'income' || displayCategory == 'Kirim') {
      displayCategory = tr('income');
    } else if (displayCategory == 'spend' || displayCategory == 'Chiqim') {
      displayCategory = tr('expense');
    }

    if (tx.toUser != null) {
      final matchingMember = _members.cast<ObMember?>().firstWhere(
        (m) => m?.userId == tx.toUser,
        orElse: () => null,
      );
      if (matchingMember != null && matchingMember.displayName.isNotEmpty) {
        displayCategory = '$displayCategory: ${matchingMember.displayName}';
      }
    }

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 24,
          bottom: 24 + MediaQuery.of(ctx).viewInsets.bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    appLocaleNotifier.value == 'ru' ? 'Детали транзакции' : 'Tranzaksiya tafsilotlari',
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded),
                    onPressed: () => Navigator.of(ctx).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Big amount display card
              Container(
                padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: color.withOpacity(0.15)),
                ),
                child: Column(
                  children: [
                    Text(
                      '${isIncome ? '+' : '-'}${formatTransactionAmount(tx)}',
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w900,
                        color: color,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      tx.currency,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // Info rows
              _buildDetailRow(appLocaleNotifier.value == 'ru' ? 'Тип' : 'Turi', isIncome ? tr('income') : tr('expense')),
              _buildDetailRow(appLocaleNotifier.value == 'ru' ? 'Категория' : 'Kategoriya', displayCategory),
              _buildDetailRow(appLocaleNotifier.value == 'ru' ? 'Дата' : 'Sana', _formatDate(tx.date)),
              if (tx.izoh != null && tx.izoh!.isNotEmpty)
                _buildDetailRow(appLocaleNotifier.value == 'ru' ? 'Комментарий' : 'Izoh', tx.izoh!),

              const SizedBox(height: 28),

              // Actions
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        side: const BorderSide(color: AppColors.border),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      ),
                      onPressed: () {
                        Navigator.of(ctx).pop();
                        _openEditTransaction(tx);
                      },
                      icon: const Icon(Icons.edit_outlined, size: 18),
                      label: Text(tr('edit'), style: const TextStyle(fontWeight: FontWeight.w800)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.red,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        elevation: 0,
                      ),
                      onPressed: () async {
                        final confirm = await showDialog<bool>(
                          context: context,
                          builder: (c) => AlertDialog(
                            title: Text(tr('tx_delete_title')),
                            content: Text(tr('tx_delete_body')),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.of(c).pop(false),
                                child: Text(tr('cancel_btn')),
                              ),
                              ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.red,
                                ),
                                onPressed: () => Navigator.of(c).pop(true),
                                child: Text(tr('delete')),
                              ),
                            ],
                          ),
                        );
                        if (confirm == true) {
                          Navigator.of(ctx).pop();
                          _deleteTransaction(tx);
                        }
                      },
                      icon: const Icon(Icons.delete_outline_rounded, size: 18, color: Colors.white),
                      label: Text(tr('delete'), style: const TextStyle(fontWeight: FontWeight.w800, color: Colors.white)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: const TextStyle(fontSize: 13, color: AppColors.muted, fontWeight: FontWeight.w500),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.text),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _openEditTransaction(ProjectTransaction tx) async {
    final isIncome = tx.tur == 'income';
    final amountCtrl = TextEditingController(text: tx.summa.toString());
    final noteCtrl = TextEditingController(text: tx.izoh ?? '');
    DateTime txDate = tx.date;
    String selectedCurrencyCode = tx.currency;
    
    // Setup categories
    final List<_ExpenseCategory> customCategories = await _loadCustomCategories();
    
    final categories = isIncome
        ? <_ExpenseCategory>[]
        : <_ExpenseCategory>[
            const _ExpenseCategory(name: 'Xodim', icon: Icons.construction_rounded, isWorker: true),
            ...customCategories,
          ];
          
    _ExpenseCategory? selectedCategory;
    try {
      selectedCategory = categories.firstWhere(
        (c) => c.name == tx.kategoriya || (c.isWorker && tx.toUser != null),
      );
    } catch (_) {
      selectedCategory = categories.isNotEmpty ? categories.first : null;
    }
    String? selectedToUserId = tx.toUser;

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 24,
            bottom: 24 + MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      isIncome ? "Kirimni tahrirlash" : "Chiqimni tahrirlash",
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () => Navigator.of(ctx).pop(),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Currency selector
                Row(
                  children: [
                    Expanded(
                      child: ChoiceChip(
                        label: const Text('so\'m (UZS)'),
                        selected: selectedCurrencyCode == 'UZS',
                        onSelected: (val) {
                          if (val) setSt(() => selectedCurrencyCode = 'UZS');
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ChoiceChip(
                        label: const Text('Dollar (USD)'),
                        selected: selectedCurrencyCode == 'USD',
                        onSelected: (val) {
                          if (val) setSt(() => selectedCurrencyCode = 'USD');
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Amount
                TextField(
                  controller: amountCtrl,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    labelText: 'Summa',
                    prefixIcon: Icon(Icons.money_rounded, size: 18),
                  ),
                ),
                const SizedBox(height: 12),

                // Categories (for expenses)
                if (!isIncome && categories.isNotEmpty) ...[
                  const Text('Kategoriya', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppColors.muted)),
                  const SizedBox(height: 6),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: categories.map((c) {
                        final sel = selectedCategory?.name == c.name;
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: InkWell(
                            onTap: () => setSt(() {
                              selectedCategory = c;
                              if (!c.isWorker) selectedToUserId = null;
                            }),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                              decoration: BoxDecoration(
                                color: sel ? AppColors.accent.withOpacity(0.1) : AppColors.card,
                                border: Border.all(color: sel ? AppColors.accent : AppColors.border),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Row(
                                children: [
                                  Icon(c.icon, size: 16, color: sel ? AppColors.accent : AppColors.muted),
                                  const SizedBox(width: 6),
                                  Text(c.name == 'Xodim' ? tr('xodim_category') : c.name, style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: sel ? AppColors.accent : AppColors.text)),
                                ],
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Sub-worker dropdown
                  if (selectedCategory?.isWorker == true) ...[
                    InkWell(
                      onTap: () async {
                        final selected = await showModalBottomSheet<String>(
                          context: context,
                          backgroundColor: AppColors.card,
                          shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
                          builder: (lctx) => Padding(
                            padding: const EdgeInsets.all(20),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                const Text('Ishchini tanlang', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                                const SizedBox(height: 12),
                                Expanded(
                                  child: ListView.builder(
                                    shrinkWrap: true,
                                    itemCount: _members.length,
                                    itemBuilder: (lctx, index) {
                                      final w = _members[index];
                                      return ListTile(
                                        title: Text(w.displayName, style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.text)),
                                        trailing: selectedToUserId == w.userId
                                            ? const Icon(Icons.check_circle_rounded, color: AppColors.accent)
                                            : null,
                                        onTap: () => Navigator.of(lctx).pop(w.userId),
                                      );
                                    },
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                        if (selected != null) {
                          setSt(() => selectedToUserId = selected);
                        }
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        decoration: BoxDecoration(
                          color: AppColors.bg,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              selectedToUserId != null
                                  ? _members.firstWhere((m) => m.userId == selectedToUserId, orElse: () => _members.first).displayName
                                  : 'Ishchini tanlang',
                              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                            ),
                            const Icon(Icons.keyboard_arrow_down_rounded, color: AppColors.muted),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                ],

                // Date Picker
                InkWell(
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: ctx,
                      initialDate: txDate,
                      firstDate: DateTime(2020),
                      lastDate: DateTime(2100),
                    );
                    if (picked != null) setSt(() => txDate = picked);
                  },
                  child: InputDecorator(
                    decoration: const InputDecoration(labelText: 'Sana', prefixIcon: Icon(Icons.calendar_today_rounded, size: 18)),
                    child: Text('${txDate.year}-${txDate.month.toString().padLeft(2, '0')}-${txDate.day.toString().padLeft(2, '0')}'),
                  ),
                ),
                const SizedBox(height: 12),

                // Note/Comment
                TextField(
                  controller: noteCtrl,
                  decoration: const InputDecoration(hintText: 'Izoh (ixtiyoriy)'),
                ),
                const SizedBox(height: 20),

                // Save button
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: isIncome ? AppColors.green : AppColors.red,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                  onPressed: () async {
                    final amountText = amountCtrl.text.trim();
                    final amount = num.tryParse(amountText.replaceAll(' ', '')) ?? 0;
                    if (amount <= 0) return;
                    
                    AppHaptics.medium();
                    Navigator.of(ctx).pop();
                    
                    try {
                      await _txRepo.updateTransaction(
                        id: tx.id,
                        newAmount: amount,
                        newKategoriya: isIncome ? 'Kirim' : (selectedCategory?.name ?? 'Boshqa'),
                        newIzoh: noteCtrl.text.trim(),
                        newTxDate: txDate,
                        newCurrency: selectedCurrencyCode,
                      );
                      _loadSilent();
                    } catch (e) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Xato: $e')));
                    }
                  },
                  child: const Text('Saqlash'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _uploadFile() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: [
          'jpg',
          'jpeg',
          'png',
          'pdf',
          'xls',
          'xlsx',
          'csv',
          'doc',
          'docx'
        ],
        withData: true,
      );
      if (result == null || result.files.isEmpty) return;
      final pf = result.files.first;
      if (pf.bytes == null) return;

      final ext = pf.extension?.toLowerCase() ?? '';
      final mimeMap = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'pdf': 'application/pdf',
        'xls': 'application/vnd.ms-excel',
        'xlsx':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'csv': 'text/csv',
        'doc': 'application/msword',
        'docx':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
      final mime = mimeMap[ext] ?? 'application/octet-stream';
      final name = pf.name;

      setState(() => _filesLoading = true);
      await _filesRepo.uploadFile(_project.id, name, pf.bytes!, mime);
      await _loadFiles();
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Fayl yuklandi')));
    } catch (e) {
      if (mounted) {
        setState(() => _filesLoading = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Xato: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: appLocaleNotifier,
      builder: (context, locale, _) {
        final project = _project;
        final (_, left, progress) = project.schedule;
        final isDone = project.status == 'done';
        final startFmt =
            project.boshlanish != null ? _formatDate(project.boshlanish!) : '—';
        final endDate = project.tugash ?? (project.boshlanish != null
            ? project.boshlanish!.add(Duration(days: project.muddat))
            : null);
        final endFmt = endDate != null ? _formatDate(endDate) : '—';

        return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Text(project.nomi,
            style: const TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          if (_loading)
            const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                child: Center(
                    child: SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2)))),
          if (_project.role == 'owner') ...[
            IconButton(
              icon: const Icon(Icons.edit_outlined, size: 20),
              tooltip: appLocaleNotifier.value == 'ru' ? 'Редактировать' : 'Tahrirlash',
              onPressed: _openEditProject,
            ),
          ],
          PopupMenuButton<String>(
            onSelected: (action) async {
              if (action == 'toggleDone') {
                await _projectRepo.setStatus(
                    project.id, isDone ? 'active' : 'done');
                _loadSilent();
              } else if (action == 'duplicate') {
                await _projectRepo.createProject(
                  nomi: '${project.nomi} (nusxa)',
                  muddat: project.muddat,
                  manzil: project.manzil,
                  mijoz: project.mijoz,
                  boshlanish: DateTime.now(),
                );
                if (mounted)
                  ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(appLocaleNotifier.value == 'ru' ? 'Копия создана' : 'Nusxa yaratildi')));
              } else if (action == 'delete') {
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: Text(tr('tx_delete_title')),
                    content: Text(appLocaleNotifier.value == 'ru' ? 'Объект ${project.nomi} будет удален.' : "${project.nomi} o'chiriladi."),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.of(ctx).pop(false),
                          child: Text(tr('cancel'))),
                      ElevatedButton(
                          style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.red,
                              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10)),
                          onPressed: () => Navigator.of(ctx).pop(true),
                          child: Text(tr('delete'))),
                    ],
                  ),
                );
                if (confirm == true && mounted) {
                  await _projectRepo.deleteProject(project.id);
                  Navigator.of(context).pop();
                }
              }
            },
            itemBuilder: (_) => [
              PopupMenuItem(
                  value: 'toggleDone',
                  child: Text(isDone ? (appLocaleNotifier.value == 'ru' ? 'Вернуть в активные' : 'Faolga qaytarish') : (appLocaleNotifier.value == 'ru' ? 'Завершить' : 'Yakunlash'))),
              PopupMenuItem(
                  value: 'duplicate', child: Text(appLocaleNotifier.value == 'ru' ? 'Дублировать' : "Nusxa ko'chirish")),
              PopupMenuItem(
                  value: 'delete',
                  child: Text(tr('delete'),
                      style: const TextStyle(color: AppColors.red))),
            ],
          ),
        ],
      ),
      body: _loading
          ? _buildShimmerLoading()
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                children: [
                  // ── Hero card (image + overlay info) ──
                  _buildHeroCard(project, isDone, progress, left),
                  const SizedBox(height: 16),

                  // ── Statistics cards row ──
                  Row(
                    children: [
                      // Kirim card
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                          decoration: BoxDecoration(
                            color: AppColors.card,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: AppColors.border),
                          ),
                          child: Column(
                            children: [
                              Text(
                                tr('income'),
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.muted,
                                  letterSpacing: 0.5,
                                ),
                              ),
                              const SizedBox(height: 4),
                              FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Text(
                                  formatUzsToDisplay(project.kirim),
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.green,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      // Chiqim card
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                          decoration: BoxDecoration(
                            color: AppColors.card,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: AppColors.border),
                          ),
                          child: Column(
                            children: [
                              Text(
                                tr('expense'),
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.muted,
                                  letterSpacing: 0.5,
                                ),
                              ),
                              const SizedBox(height: 4),
                              FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Text(
                                  formatUzsToDisplay(project.chiqim),
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.red,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      // Balans card
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                          decoration: BoxDecoration(
                            color: AppColors.card,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: AppColors.border),
                          ),
                          child: Column(
                            children: [
                              Text(
                                tr('balance'),
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.muted,
                                  letterSpacing: 0.5,
                                ),
                              ),
                              const SizedBox(height: 4),
                              FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Text(
                                  formatUzsToDisplay(project.balance),
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w800,
                                    color: project.balance >= 0 ? AppColors.accent : AppColors.red,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // ── Action buttons ──
                  if (_project.role == 'owner') ...[
                    Row(children: [
                      Expanded(
                        child: ElevatedButton(
                          style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.accent,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                              elevation: 0),
                          onPressed: () => _openAddTransaction(isIncome: true),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Container(
                                width: 28, height: 28,
                                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), shape: BoxShape.circle),
                                child: const Icon(Icons.arrow_downward_rounded, size: 16, color: Colors.white),
                              ),
                              const SizedBox(width: 8),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(tr('income'), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Colors.white)),
                                  Text(appLocaleNotifier.value == 'ru' ? 'Добавить' : "Qo'shish", style: const TextStyle(fontSize: 10, color: Colors.white70)),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: ElevatedButton(
                          style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.green,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                              elevation: 0),
                          onPressed: () => _openAddTransaction(isIncome: false),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Container(
                                width: 28, height: 28,
                                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), shape: BoxShape.circle),
                                child: const Icon(Icons.arrow_upward_rounded, size: 16, color: Colors.white),
                              ),
                              const SizedBox(width: 8),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(tr('expense'), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Colors.white)),
                                  Text(appLocaleNotifier.value == 'ru' ? 'Добавить' : "Qo'shish", style: const TextStyle(fontSize: 10, color: Colors.white70)),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ]),
                    const SizedBox(height: 20),
                  ] else if (_project.role == 'member') ...[
                    Row(children: [
                      Expanded(
                        child: ElevatedButton(
                          style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.accent,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                              elevation: 0),
                          onPressed: () => _openAddTransaction(isIncome: true),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Container(
                                width: 28, height: 28,
                                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), shape: BoxShape.circle),
                                child: const Icon(Icons.arrow_downward_rounded, size: 16, color: Colors.white),
                              ),
                              const SizedBox(width: 8),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(tr('income'), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Colors.white)),
                                  Text(appLocaleNotifier.value == 'ru' ? 'Добавить' : "Qo'shish", style: const TextStyle(fontSize: 10, color: Colors.white70)),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: ElevatedButton(
                          style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.red,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                              elevation: 0),
                          onPressed: () => _openAddTransaction(isIncome: false),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Container(
                                width: 28, height: 28,
                                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), shape: BoxShape.circle),
                                child: const Icon(Icons.arrow_upward_rounded, size: 16, color: Colors.white),
                              ),
                              const SizedBox(width: 8),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(tr('expense'), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Colors.white)),
                                  Text(appLocaleNotifier.value == 'ru' ? 'Добавить' : "Qo'shish", style: const TextStyle(fontSize: 10, color: Colors.white70)),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ]),
                    const SizedBox(height: 20),
                  ],

                  // ── Loyiha ma'lumotlari ──
                  _buildInfoSection(project, isDone, progress, left, startFmt, endFmt),
                  const SizedBox(height: 20),

                  // ── Tabs: Tranzaksiyalar | Ishchilar | Fayllar ──
                  Container(
                    decoration: BoxDecoration(
                        color: AppColors.card,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: AppColors.border)),
                    child: Column(children: [
                      TabBar(
                        controller: _tabController,
                        labelColor: AppColors.accent,
                        unselectedLabelColor: AppColors.text2,
                        indicatorColor: AppColors.accent,
                        indicatorSize: TabBarIndicatorSize.tab,
                        dividerColor: AppColors.border,
                        labelStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
                        unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                        tabs: [
                          Tab(text: tr('transactions')),
                          Tab(text: tr('workers')),
                          Tab(text: tr('files')),
                        ],
                      ),
                      SizedBox(
                        height: 400,
                        child: TabBarView(
                          controller: _tabController,
                          children: [
                            _buildTransactionsTab(),
                            _buildWorkersTab(),
                            _buildFilesTab(),
                          ],
                        ),
                      ),
                    ]),
                  ),
                ],
              ),
            ),
    );
      },
    );
  }


  // ── Hero card: image overlay with project name, progress, members, days ──
  Widget _buildHeroCard(Project project, bool isDone, int progress, int left) {
    final hasImage = project.imageUrl != null && project.imageUrl!.isNotEmpty;
    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: SizedBox(
        height: 200,
        width: double.infinity,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Background
            if (hasImage)
              Image.network(project.imageUrl!, fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                        decoration: const BoxDecoration(
                          gradient: LinearGradient(
                            colors: [Color(0xFF1A237E), Color(0xFF283593)],
                            begin: Alignment.topLeft, end: Alignment.bottomRight,
                          ),
                        ),
                      ))
            else
              GestureDetector(
                onTap: _pickAndUploadImage,
                child: Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Color(0xFF1A237E), Color(0xFF283593)],
                      begin: Alignment.topLeft, end: Alignment.bottomRight,
                    ),
                  ),
                  child: const Center(
                    child: Icon(Icons.add_photo_alternate_outlined,
                        color: Colors.white38, size: 48),
                  ),
                ),
              ),
            // Gradient overlay for text readability
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Colors.transparent, Color(0xCC000000)],
                  begin: Alignment.topCenter, end: Alignment.bottomCenter,
                ),
              ),
            ),
            // Status badge (top-right)
            Positioned(
              top: 12, right: 12,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: isDone ? Colors.white.withOpacity(0.15) : const Color(0xFF10B981),
                  borderRadius: BorderRadius.circular(20),
                  border: isDone ? Border.all(color: Colors.white.withOpacity(0.2), width: 1) : null,
                ),
                child: Text(isDone ? tr('done') : tr('active'),
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white)),
              ),
            ),
            // Bottom info overlay
            Positioned(
              left: 14, right: 14, bottom: 12,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(project.nomi,
                      style: const TextStyle(
                          color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18, shadows: [Shadow(blurRadius: 4)])),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: (progress / 100).clamp(0.0, 1.0),
                      minHeight: 5,
                      backgroundColor: Colors.white24,
                      color: isDone ? AppColors.green : AppColors.accent,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      // Member avatars
                      ...(_members.take(4).map((m) {
                        final color = colorForName(m.displayName);
                        final initials = m.displayName.trim().isEmpty ? '?' : m.displayName.trim()[0].toUpperCase();
                        return Container(
                          width: 24, height: 24,
                          margin: const EdgeInsets.only(right: 4),
                          decoration: BoxDecoration(shape: BoxShape.circle, color: color, border: Border.all(color: Colors.white, width: 1.5)),
                          child: Center(child: Text(initials, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white))),
                        );
                      })),
                      if (_members.length > 4)
                        Text('+${_members.length - 4}', style: const TextStyle(fontSize: 11, color: Colors.white70)),
                      if (_members.isNotEmpty)
                        Text(' ${_members.length} ${tr('workers_count')}', style: const TextStyle(fontSize: 11, color: Colors.white70)),
                      const Spacer(),
                      const Icon(Icons.access_time_rounded, size: 12, color: Colors.white70),
                      const SizedBox(width: 4),
                      Text(left == 0 ? (appLocaleNotifier.value == 'ru' ? 'Срок истек' : "Muddati o'tgan") : tr('days_remaining').replaceFirst('{}', '$left'),
                          style: const TextStyle(fontSize: 11, color: Colors.white70)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Loyiha ma'lumotlari: icon-row info section ──
  Widget _buildInfoSection(Project project, bool isDone, int progress, int left,
      String startFmt, String endFmt) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(tr('project_info'),
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.text)),
        const SizedBox(height: 10),
        Container(
          decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border)),
          child: Column(children: [
            _InfoRow(icon: Icons.calendar_today_rounded, label: tr('start_date'), trailing: Text(startFmt, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700))),
            const Divider(color: AppColors.border, height: 1, indent: 48),
            _InfoRow(icon: Icons.event_rounded, label: tr('completed'), trailing: Text(endFmt, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700))),
            const Divider(color: AppColors.border, height: 1, indent: 48),
            _InfoRow(
              icon: Icons.speed_rounded,
              label: tr('progress'),
              trailing: SizedBox(
                width: 120,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text('$progress%', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 60,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: (progress / 100).clamp(0.0, 1.0),
                          minHeight: 5,
                          backgroundColor: AppColors.border,
                          color: isDone ? AppColors.green : AppColors.accent,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const Divider(color: AppColors.border, height: 1, indent: 48),
            _InfoRow(icon: Icons.people_outline_rounded, label: tr('total_workers'), trailing: Text('${_members.length}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700))),
          ]),
        ),
      ],
    );
  }

  // ── So'nggi faoliyat: last 4 transactions with 'Barchasi' link ──

  Widget _buildTransactionsTab() {

    return Column(children: [
      // Filter chips
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
        child: Row(children: [
          _FilterChip(
              label: tr('all'),
              selected: _txFilter == 'all',
              onTap: () => setState(() => _txFilter = 'all')),
          const SizedBox(width: 6),
          _FilterChip(
              label: tr('income'),
              selected: _txFilter == 'income',
              onTap: () => setState(() => _txFilter = 'income')),
          const SizedBox(width: 6),
          _FilterChip(
              label: tr('expense'),
              selected: _txFilter == 'expense',
              onTap: () => setState(() => _txFilter = 'expense')),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
        child: Row(
          children: [
            // Date range selector
            Expanded(
              child: InkWell(
                onTap: _selectDateRange,
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: _dateRange != null
                        ? AppColors.accent.withOpacity(0.08)
                        : AppColors.border.withOpacity(0.3),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: _dateRange != null
                          ? AppColors.accent.withOpacity(0.2)
                          : AppColors.border,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.calendar_month_outlined,
                        size: 14,
                        color: _dateRange != null ? AppColors.accent : AppColors.text2,
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          _dateRange == null
                              ? (appLocaleNotifier.value == 'ru' ? "Диапазон дат" : "Sana oralig'i")
                              : "${_formatDate(_dateRange!.start)} - ${_formatDate(_dateRange!.end)}",
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: _dateRange != null
                                ? FontWeight.w700
                                : FontWeight.normal,
                            color: _dateRange != null
                                ? AppColors.accent
                                : AppColors.text2,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (_dateRange != null)
                        GestureDetector(
                          onTap: () {
                            setState(() => _dateRange = null);
                          },
                          child: const Icon(
                            Icons.close_rounded,
                            size: 14,
                            color: AppColors.accent,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            // Sort selection
            InkWell(
              onTap: () {
                setState(() {
                  _sortBy = _sortBy == 'date' ? 'price' : 'date';
                });
              },
              borderRadius: BorderRadius.circular(10),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: _sortBy == 'price'
                      ? AppColors.accent.withOpacity(0.08)
                      : AppColors.border.withOpacity(0.3),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: _sortBy == 'price'
                        ? AppColors.accent.withOpacity(0.2)
                        : AppColors.border,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      _sortBy == 'price'
                          ? Icons.sort_by_alpha_rounded
                          : Icons.sort_rounded,
                      size: 14,
                      color: _sortBy == 'price' ? AppColors.accent : AppColors.text2,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      _sortBy == 'price' ? (appLocaleNotifier.value == 'ru' ? "По сумме" : "Summa bo'yicha") : (appLocaleNotifier.value == 'ru' ? "По дате" : "Sana bo'yicha"),
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: _sortBy == 'price'
                            ? FontWeight.w700
                            : FontWeight.normal,
                        color: _sortBy == 'price'
                            ? AppColors.accent
                            : AppColors.text2,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
      Expanded(
        child: _filteredTxs.isEmpty
            ? Center(
                child: Text(tr('no_transactions'),
                    style: const TextStyle(color: AppColors.muted, fontSize: 13)))
            : ListView.separated(
                padding: const EdgeInsets.only(bottom: 12),
                itemCount: _filteredTxs.length,
                separatorBuilder: (_, __) => const Divider(
                    color: AppColors.border, height: 1, indent: 60),
                itemBuilder: (ctx, i) {
                  final tx = _filteredTxs[i];
                  final isIncome = tx.tur == 'income';
                  final color = isIncome ? AppColors.green : AppColors.red;

                  String displayCategory = tx.kategoriya ?? (isIncome ? tr('income') : tr('expense'));
                  if (displayCategory == 'usta' || displayCategory == 'Xodim') {
                    displayCategory = tr('xodim_category');
                  } else if (displayCategory == 'income' || displayCategory == 'Kirim') {
                    displayCategory = tr('income');
                  } else if (displayCategory == 'spend' || displayCategory == 'Chiqim') {
                    displayCategory = tr('expense');
                  }

                  if (tx.toUser != null && !isIncome) {
                    final matchingMember = _members.cast<ObMember?>().firstWhere(
                      (m) => m?.userId == tx.toUser,
                      orElse: () => null,
                    );
                    if (matchingMember != null && matchingMember.displayName.isNotEmpty) {
                      displayCategory = '$displayCategory: ${matchingMember.displayName}';
                    }
                  }

                  return Dismissible(
                    key: ValueKey(tx.id),
                    direction: DismissDirection.endToStart,
                    background: Container(
                      alignment: Alignment.centerRight,
                      padding: const EdgeInsets.only(right: 16),
                      color: AppColors.red,
                      child: const Icon(Icons.delete_outline_rounded,
                          color: Colors.white),
                    ),
                    confirmDismiss: (_) => showDialog<bool>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: Text(tr('tx_delete_title')),
                        content: Text(tr('tx_delete_body')),
                        actions: [
                          TextButton(
                              onPressed: () => Navigator.of(ctx).pop(false),
                              child: Text(tr('cancel'))),
                          ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.red,
                                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10)),
                              onPressed: () => Navigator.of(ctx).pop(true),
                              child: Text(tr('delete'))),
                        ],
                      ),
                    ),
                    onDismissed: (_) => _deleteTransaction(tx),
                    child: InkWell(
                      onTap: () {
                        AppHaptics.selection();
                        _showTransactionDetails(tx);
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 12),
                        child: Row(children: [
                          Container(
                            width: 36,
                            height: 36,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                                color: color.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(10)),
                            child: Icon(
                                isIncome
                                    ? Icons.arrow_downward_rounded
                                    : Icons.arrow_upward_rounded,
                                size: 18,
                                color: color),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                Text(
                                    displayCategory,
                                    style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600)),
                                if (tx.izoh != null && tx.izoh!.isNotEmpty) ...[
                                  const SizedBox(height: 2),
                                  Text(tx.izoh!,
                                      style: const TextStyle(
                                          fontSize: 12, color: AppColors.text2)),
                                ],
                                const SizedBox(height: 2),
                                Text(_formatDate(tx.date),
                                    style: const TextStyle(
                                        fontSize: 11, color: AppColors.muted)),
                              ])),
                          Text(
                              '${isIncome ? '+' : '-'}${formatTransactionAmount(tx)}',
                              style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: color)),
                        ]),
                      ),
                    ),
                  );
                },
              ),
      ),
    ]);
  }

  Widget _buildWorkersTab() {
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
        child: Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            onPressed: _openAddMember,
            icon: const Icon(Icons.person_add_outlined, size: 16),
            label:
                Text(tr('add_worker'), style: const TextStyle(fontSize: 12)),
            style: TextButton.styleFrom(foregroundColor: AppColors.accent),
          ),
        ),
      ),
      Expanded(
        child: _visibleMembers.isEmpty
            ? Center(
                child: Text(tr('no_workers'),
                    style: const TextStyle(color: AppColors.muted, fontSize: 13)))
            : ListView.separated(
                padding: const EdgeInsets.only(bottom: 12),
                itemCount: _visibleMembers.length,
                separatorBuilder: (_, __) => const Divider(
                    color: AppColors.border, height: 1, indent: 56),
                itemBuilder: (_, i) {
                  final m = _visibleMembers[i];
                  final color = colorForName(m.displayName);
                  final initials = m.displayName.trim().isEmpty
                      ? '?'
                      : m.displayName.trim()[0].toUpperCase();
                  final balance = m.ishaqi - m.olingan;
                  return InkWell(
                    onTap: () => _openWorkerProfile(m),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      child: Row(children: [
                        CircleAvatar(
                          radius: 20,
                          backgroundColor: color.withOpacity(0.15),
                          child: Text(initials,
                              style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                  color: color)),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                              Text(m.displayName,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 14)),
                              if (m.kasb != null && m.kasb!.isNotEmpty)
                                Text(m.kasb!,
                                    style: const TextStyle(
                                        fontSize: 11, color: AppColors.muted)),
                              if (m.boshlanish != null && m.tugash != null)
                                Padding(
                                  padding: const EdgeInsets.only(top: 2),
                                  child: Text(
                                    "${_dateFmt.format(m.boshlanish!)} - ${_dateFmt.format(m.tugash!)}",
                                    style: const TextStyle(
                                        fontSize: 10, color: AppColors.muted),
                                  ),
                                ),
                            ])),
                        Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(formatUzsToDisplay(m.ishaqi),
                                  style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700)),
                              Text(
                                balance > 0
                                    ? '${appLocaleNotifier.value == 'ru' ? 'Долг' : 'Qarzdor'}: ${formatUzsToDisplay(balance)}'
                                    : (appLocaleNotifier.value == 'ru' ? 'Расчёт' : 'Hisob-kitob'),
                                style: TextStyle(
                                    fontSize: 11,
                                    color: balance > 0
                                        ? AppColors.orange
                                        : AppColors.muted),
                              ),
                            ]),
                        const SizedBox(width: 6),
                        const Icon(Icons.chevron_right_rounded,
                            size: 18, color: AppColors.muted),
                      ]),
                    ),
                  );
                },
              ),
      ),
    ]);
  }

  Widget _buildFilesTab() {
    return Column(children: [
      if (_project.role == 'owner')
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
          child: Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: _uploadFile,
              icon: const Icon(Icons.upload_file_outlined, size: 16),
              label: Text(tr('upload_file'), style: const TextStyle(fontSize: 12)),
              style: TextButton.styleFrom(foregroundColor: AppColors.accent),
            ),
          ),
        ),
      Expanded(
        child: _filesLoading
            ? _buildFilesShimmerLoading()
            : _files.isEmpty
                ? Center(
                    child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                        const Icon(Icons.folder_open_rounded,
                            size: 36, color: AppColors.muted),
                        const SizedBox(height: 8),
                        Text(tr('no_files'),
                            style: const TextStyle(
                                color: AppColors.muted, fontSize: 13)),
                      ]))
                : ListView.separated(
                    padding: const EdgeInsets.only(bottom: 12),
                    itemCount: _files.length,
                    separatorBuilder: (_, __) => const Divider(
                        color: AppColors.border, height: 1, indent: 56),
                    itemBuilder: (_, i) {
                      final f = _files[i];
                      return Dismissible(
                        key: ValueKey(f.path),
                        direction: _project.role == 'owner'
                            ? DismissDirection.endToStart
                            : DismissDirection.none,
                        background: Container(
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.only(right: 16),
                          color: AppColors.red,
                          child: const Icon(Icons.delete_outline_rounded,
                              color: Colors.white),
                        ),
                        confirmDismiss: (_) => showDialog<bool>(
                          context: context,
                          builder: (ctx) => AlertDialog(
                            title: Text(tr('tx_delete_title')),
                            content: Text(appLocaleNotifier.value == 'ru' ? 'Файл ${f.name} будет удален.' : '${f.name} o\'chiriladi.'),
                            actions: [
                              TextButton(
                                  onPressed: () => Navigator.of(ctx).pop(false),
                                  child: Text(tr('cancel'))),
                              ElevatedButton(
                                  style: ElevatedButton.styleFrom(
                                      backgroundColor: AppColors.red,
                                      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10)),
                                  onPressed: () => Navigator.of(ctx).pop(true),
                                  child: Text(tr('delete'))),
                            ],
                          ),
                        ),
                        onDismissed: (_) async {
                          await _filesRepo.deleteFile(f.path);
                          setState(() =>
                              _files.removeWhere((x) => x.path == f.path));
                        },
                        child: InkWell(
                          onTap: () async {
                            final uri = Uri.parse(f.publicUrl);
                            if (await canLaunchUrl(uri))
                              launchUrl(uri,
                                  mode: LaunchMode.externalApplication);
                          },
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 12),
                            child: Row(children: [
                              Container(
                                width: 36,
                                height: 36,
                                decoration: BoxDecoration(
                                  color: _fileColor(f).withOpacity(0.12),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Icon(_fileIcon(f),
                                    size: 20, color: _fileColor(f)),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                    Text(f.name,
                                        style: const TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600),
                                        overflow: TextOverflow.ellipsis),
                                    if (f.sizeBytes != null)
                                      Text(_formatSize(f.sizeBytes!),
                                          style: const TextStyle(
                                              fontSize: 11,
                                              color: AppColors.muted)),
                                  ])),
                              const Icon(Icons.open_in_new_rounded,
                                  size: 16, color: AppColors.muted),
                            ]),
                          ),
                        ),
                      );
                    },
                  ),
      ),
    ]);
  }

  IconData _fileIcon(ProjectFile f) {
    if (f.isImage) return Icons.image_outlined;
    if (f.isPdf) return Icons.picture_as_pdf_outlined;
    if (f.isExcel) return Icons.table_chart_outlined;
    return Icons.insert_drive_file_outlined;
  }

  Color _fileColor(ProjectFile f) {
    if (f.isImage) return AppColors.accent;
    if (f.isPdf) return AppColors.red;
    if (f.isExcel) return AppColors.green;
    return AppColors.muted;
  }

  String _formatSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  Widget _buildShimmerLoading() {
    return Shimmer(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          ShimmerBox(height: 180, borderRadius: 24),
          SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: ShimmerBox(height: 54, borderRadius: 16)),
              SizedBox(width: 12),
              Expanded(child: ShimmerBox(height: 54, borderRadius: 16)),
            ],
          ),
          SizedBox(height: 24),
          ShimmerBox(height: 44, borderRadius: 12),
          SizedBox(height: 16),
          ShimmerBox(height: 70, borderRadius: 16),
          SizedBox(height: 12),
          ShimmerBox(height: 70, borderRadius: 16),
          SizedBox(height: 12),
          ShimmerBox(height: 70, borderRadius: 16),
        ],
      ),
    );
  }

  Widget _buildFilesShimmerLoading() {
    return Shimmer(
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        children: const [
          ShimmerBox(height: 56, borderRadius: 12),
          SizedBox(height: 10),
          ShimmerBox(height: 56, borderRadius: 12),
          SizedBox(height: 10),
          ShimmerBox(height: 56, borderRadius: 12),
        ],
      ),
    );
  }
}

class _WorkerInfoRow extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _WorkerInfoRow(
      {required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(children: [
        Expanded(
            child: Text(label,
                style: const TextStyle(fontSize: 13, color: AppColors.text2))),
        Text(value,
            style: TextStyle(
                fontSize: 13, fontWeight: FontWeight.w700, color: color)),
      ]),
    );
  }
}



class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final Widget trailing;
  const _InfoRow({required this.icon, required this.label, required this.trailing});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      child: Row(children: [
        Icon(icon, size: 18, color: AppColors.muted),
        const SizedBox(width: 12),
        Expanded(child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.text2))),
        trailing,
      ]),
    );
  }
}

class _FilterChip extends StatelessWidget {

  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _FilterChip(
      {required this.label, required this.selected, required this.onTap});
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? AppColors.accent : AppColors.bg,
          borderRadius: BorderRadius.circular(20),
          border:
              Border.all(color: selected ? AppColors.accent : AppColors.border),
        ),
        child: Text(label,
            style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: selected ? Colors.white : AppColors.text2)),
      ),
    );
  }
}
