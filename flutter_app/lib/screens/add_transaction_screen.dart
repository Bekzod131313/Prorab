import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../data/project_files_repository.dart';
import '../l10n/strings.dart';
import '../main.dart';
import '../models/member.dart';
import '../models/transaction.dart';
import '../services/currency_service.dart';
import '../theme/app_theme.dart';
import '../utils/price_formatter.dart';
import '../utils/haptics.dart';

class ExpenseCategoryItem {
  final String name;
  final IconData icon;
  final bool isWorker;

  const ExpenseCategoryItem({
    required this.name,
    this.icon = Icons.category_rounded,
    this.isWorker = false,
  });
}

class AddTransactionResult {
  final num amount;
  final String currencyCode;
  final String categoryName;
  final bool isWorkerCategory;
  final String? toUserId;
  final String noteText;
  final List<ProjectFile> attachedFiles;

  AddTransactionResult({
    required this.amount,
    required this.currencyCode,
    required this.categoryName,
    required this.isWorkerCategory,
    this.toUserId,
    required this.noteText,
    this.attachedFiles = const [],
  });
}

class AddTransactionScreen extends StatefulWidget {
  final bool isIncome;
  final String projectId;
  final List<ObMember> workers;
  final String? preSelectedWorkerId;
  final ProjectTransaction? initialTransaction;

  const AddTransactionScreen({
    super.key,
    required this.isIncome,
    required this.projectId,
    required this.workers,
    this.preSelectedWorkerId,
    this.initialTransaction,
  });

  @override
  State<AddTransactionScreen> createState() => _AddTransactionScreenState();
}

class _AddTransactionScreenState extends State<AddTransactionScreen> {
  final _amountCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();

  String _selectedCurrencyCode = CurrencyService().displayCurrency;
  ExpenseCategoryItem? _selectedCategory;
  String? _selectedToUserId;
  List<ExpenseCategoryItem> _categories = [];
  bool _loadingCategories = true;
  List<ProjectFile> _selectedFiles = [];

  @override
  void initState() {
    super.initState();
    final initTx = widget.initialTransaction;
    if (initTx != null) {
      _amountCtrl.text = PriceInputFormatter.formatNumber(initTx.summa);
      _noteCtrl.text = initTx.izoh ?? '';
      _selectedCurrencyCode = initTx.currency;
      _selectedToUserId = initTx.toUser ?? widget.preSelectedWorkerId;
      _selectedFiles = initTx.files.map((p) => ProjectFile.fromPath(p)).toList();
    } else {
      _selectedToUserId = widget.preSelectedWorkerId;
    }
    _initCategories();
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _initCategories() async {
    final customCats = await _loadCustomCategories(widget.isIncome);
    final initTx = widget.initialTransaction;

    if (widget.isIncome) {
      final defaultMijoz = ExpenseCategoryItem(
        name: tr('cat_customer'),
        icon: Icons.person_rounded,
      );
      final cats = [
        defaultMijoz,
        ...customCats.where((c) => c.name != defaultMijoz.name && c.name != 'Mijoz'),
      ];

      ExpenseCategoryItem? initialCat;
      if (initTx != null && initTx.kategoriya != null) {
        initialCat = cats.cast<ExpenseCategoryItem?>().firstWhere(
          (c) => c?.name == initTx.kategoriya,
          orElse: () => null,
        );
        if (initialCat == null) {
          initialCat = ExpenseCategoryItem(
            name: initTx.kategoriya!,
            icon: Icons.category_rounded,
          );
          cats.add(initialCat);
        }
      } else {
        initialCat = defaultMijoz;
      }

      if (mounted) {
        setState(() {
          _categories = cats;
          _selectedCategory = initialCat;
          _loadingCategories = false;
        });
      }
      return;
    }

    final cats = [
      ExpenseCategoryItem(
        name: tr('cat_worker'),
        icon: Icons.engineering_rounded,
        isWorker: true,
      ),
      ...customCats,
    ];

    ExpenseCategoryItem? initialCat;
    if (initTx != null && initTx.kategoriya != null) {
      initialCat = cats.cast<ExpenseCategoryItem?>().firstWhere(
        (c) =>
            c?.name == initTx.kategoriya ||
            (c!.isWorker && initTx.toUser != null),
        orElse: () => null,
      );
      if (initialCat == null) {
        initialCat = ExpenseCategoryItem(
            name: initTx.kategoriya!, icon: Icons.category_rounded);
        cats.add(initialCat);
      }
    } else if (widget.preSelectedWorkerId != null) {
      initialCat = cats.firstWhere((c) => c.isWorker, orElse: () => cats.first);
    } else {
      initialCat = cats.isNotEmpty ? cats.first : null;
    }

    if (mounted) {
      setState(() {
        _categories = cats;
        _selectedCategory = initialCat;
        _loadingCategories = false;
      });
    }
  }

  Future<List<ExpenseCategoryItem>> _loadCustomCategories(bool isIncome) async {
    try {
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) return [];

      final projPrefix = 'proj:${widget.projectId}:${isIncome ? "inc:" : "exp:"}';
      final legacyPrefix = isIncome ? 'inc:' : 'exp:';

      List<dynamic> data = [];
      try {
        data = await supabase
            .from('categories')
            .select('name, ob_id')
            .eq('user_id', userId)
            .eq('ob_id', widget.projectId);
      } catch (_) {
        data = await supabase
            .from('categories')
            .select('name')
            .eq('user_id', userId);
      }

      final List<ExpenseCategoryItem> result = [];
      for (final row in data) {
        final rawName = row['name'] as String;
        String? target;

        if (rawName.startsWith(projPrefix)) {
          target = rawName.substring(projPrefix.length);
        } else if (row is Map && row.containsKey('ob_id') && row['ob_id'] == widget.projectId) {
          if (rawName.startsWith(legacyPrefix)) {
            target = rawName.substring(legacyPrefix.length);
          } else if (!isIncome && !rawName.startsWith('inc:') && !rawName.startsWith('exp:')) {
            target = rawName;
          }
        }

        if (target != null) {
          IconData icon = Icons.category_rounded;
          String cleanName = target;
          if (target.contains(':')) {
            final idx = target.indexOf(':');
            final codeStr = target.substring(0, idx);
            final cp = int.tryParse(codeStr);
            if (cp != null) {
              icon = IconData(cp, fontFamily: 'MaterialIcons');
              cleanName = target.substring(idx + 1);
            }
          }
          if (!result.any((item) => item.name == cleanName)) {
            result.add(ExpenseCategoryItem(
              name: cleanName,
              icon: icon,
            ));
          }
        }
      }
      return result;
    } catch (_) {
      return [];
    }
  }

  Future<void> _saveCustomCategories(
      List<ExpenseCategoryItem> categories, bool isIncome) async {
    try {
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) return;
      final projPrefix = 'proj:${widget.projectId}:${isIncome ? "inc:" : "exp:"}';

      // 1. Delete old categories for this project
      try {
        await supabase
            .from('categories')
            .delete()
            .eq('user_id', userId)
            .eq('ob_id', widget.projectId);
      } catch (_) {}

      try {
        final data = await supabase
            .from('categories')
            .select('name')
            .eq('user_id', userId);

        for (final row in (data as List)) {
          final rawName = row['name'] as String;
          if (rawName.startsWith(projPrefix)) {
            await supabase
                .from('categories')
                .delete()
                .eq('user_id', userId)
                .eq('name', rawName);
          }
        }
      } catch (_) {}

      // 2. Save categories scoped to widget.projectId
      if (categories.isNotEmpty) {
        final insertRows = categories.map((c) => {
          'user_id': userId,
          'ob_id': widget.projectId,
          'name': '$projPrefix${c.icon.codePoint}:${c.name}',
        }).toList();

        try {
          await supabase.from('categories').insert(insertRows);
        } catch (_) {
          final fallbackRows = categories.map((c) => {
            'user_id': userId,
            'name': '$projPrefix${c.icon.codePoint}:${c.name}',
          }).toList();
          await supabase.from('categories').insert(fallbackRows);
        }
      }
    } catch (_) {}
  }

  Future<ExpenseCategoryItem?> _openAddCategoryDialog() async {
    final nameCtrl = TextEditingController();

    final icons = <IconData>[
      Icons.local_offer_outlined,
      Icons.work_outline_rounded,
      Icons.shopping_cart_outlined,
      Icons.local_gas_station_outlined,
      Icons.local_shipping_outlined,
      Icons.home_outlined,
      Icons.build_outlined,
      Icons.bolt_outlined,
      Icons.card_giftcard_outlined,
    ];

    IconData selectedIcon = icons[0];
    const iconColor = AppColors.accent;

    final result = await showModalBottomSheet<ExpenseCategoryItem>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (bctx) {
        return StatefulBuilder(
          builder: (ctx, setSt) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 12,
                bottom: 24 + MediaQuery.of(ctx).viewInsets.bottom,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.border,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Center(
                    child: Column(
                      children: [
                        Text(
                          tr('new_category'),
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                            color: AppColors.text,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          tr('new_category_sub'),
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: AppColors.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  ValueListenableBuilder<TextEditingValue>(
                    valueListenable: nameCtrl,
                    builder: (context, value, _) {
                      final count = value.text.length;
                      return Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: AppColors.bg,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 42,
                              height: 42,
                              decoration: BoxDecoration(
                                color: iconColor.withValues(alpha: 0.15),
                                shape: BoxShape.circle,
                              ),
                              child: Icon(selectedIcon, color: iconColor, size: 22),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    tr('category_name'),
                                    style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.muted,
                                    ),
                                  ),
                                  TextField(
                                    controller: nameCtrl,
                                    maxLength: 30,
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.text,
                                    ),
                                    decoration: InputDecoration(
                                      isDense: true,
                                      contentPadding: const EdgeInsets.symmetric(vertical: 2),
                                      hintText: tr('category_name_hint'),
                                      hintStyle: const TextStyle(
                                        fontSize: 12.5,
                                        fontWeight: FontWeight.w400,
                                        color: AppColors.muted,
                                      ),
                                      border: InputBorder.none,
                                      enabledBorder: InputBorder.none,
                                      focusedBorder: InputBorder.none,
                                      counterText: '',
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Text(
                              '$count/30',
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w500,
                                color: AppColors.muted,
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 20),
                  Text(
                    tr('select_icon'),
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: AppColors.text,
                    ),
                  ),
                  const SizedBox(height: 12),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: icons.length,
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 5,
                      mainAxisSpacing: 10,
                      crossAxisSpacing: 10,
                      childAspectRatio: 1.1,
                    ),
                    itemBuilder: (context, idx) {
                      final ic = icons[idx];
                      final isSelected = selectedIcon == ic;
                      return GestureDetector(
                        onTap: () {
                          AppHaptics.selection();
                          setSt(() => selectedIcon = ic);
                        },
                        child: Container(
                          decoration: BoxDecoration(
                            color: isSelected
                                ? iconColor.withValues(alpha: 0.12)
                                : AppColors.bg,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: isSelected ? iconColor : AppColors.border.withValues(alpha: 0.6),
                              width: isSelected ? 2 : 1,
                            ),
                          ),
                          child: Icon(
                            ic,
                            color: isSelected ? iconColor : AppColors.text2,
                            size: 22,
                          ),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: () {
                        final name = nameCtrl.text.trim();
                        if (name.isEmpty) return;
                        AppHaptics.heavy();
                        Navigator.of(bctx).pop(
                          ExpenseCategoryItem(
                            name: name,
                            icon: selectedIcon,
                          ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.accent,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      child: Text(
                        tr('save_category'),
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: TextButton(
                      onPressed: () {
                        AppHaptics.light();
                        Navigator.of(bctx).pop(null);
                      },
                      style: TextButton.styleFrom(
                        backgroundColor: AppColors.bg,
                        foregroundColor: AppColors.text,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      child: Text(
                        tr('cancel'),
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
    return result;
  }

  Future<void> _openFileSelectionSheet() async {
    final repo = ProjectFilesRepository();
    final result = await showModalBottomSheet<List<ProjectFile>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (bctx) => _FileSelectionBottomSheet(
        projectId: widget.projectId,
        repo: repo,
        initialSelected: _selectedFiles,
      ),
    );

    if (result != null) {
      setState(() {
        _selectedFiles = result;
      });
    }
  }

  void _submit() {
    AppHaptics.medium();
    final amountText = _amountCtrl.text.trim();
    final noteText = _noteCtrl.text.trim();
    if (amountText.isEmpty) return;

    final amount = num.tryParse(amountText.replaceAll(' ', '')) ?? 0;
    if (amount <= 0) return;

    if (!widget.isIncome &&
        _selectedCategory?.isWorker == true &&
        _selectedToUserId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr('select_worker'))),
      );
      return;
    }

    final result = AddTransactionResult(
      amount: amount,
      currencyCode: _selectedCurrencyCode,
      categoryName: _selectedCategory?.name ?? (widget.isIncome ? 'Mijoz' : 'Boshqa'),
      isWorkerCategory: _selectedCategory?.isWorker == true,
      toUserId: widget.isIncome ? null : _selectedToUserId,
      noteText: noteText,
      attachedFiles: _selectedFiles,
    );

    Navigator.of(context).pop(result);
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

  @override
  Widget build(BuildContext context) {
    final color = widget.isIncome ? AppColors.green : AppColors.red;
    final isEditing = widget.initialTransaction != null;
    final title = isEditing
        ? (widget.isIncome ? "Kirimni tahrirlash" : "Chiqimni tahrirlash")
        : (widget.isIncome ? tr('add_income') : tr('add_expense'));
    final buttonLabel = isEditing ? tr('save') : title;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.of(context).pop(null),
        ),
        title: Text(
          title,
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Currency Selector
                    Row(
                      children: [
                        Expanded(
                          child: ChoiceChip(
                            label: Container(
                              alignment: Alignment.center,
                              child: Text(
                                tr('currency_uzs'),
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: _selectedCurrencyCode == 'UZS'
                                      ? Colors.white
                                      : AppColors.text,
                                ),
                              ),
                            ),
                            selected: _selectedCurrencyCode == 'UZS',
                            selectedColor: AppColors.accent,
                            onSelected: (val) {
                              if (val) {
                                AppHaptics.selection();
                                setState(() => _selectedCurrencyCode = 'UZS');
                              }
                            },
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ChoiceChip(
                            label: Container(
                              alignment: Alignment.center,
                              child: Text(
                                tr('currency_usd'),
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: _selectedCurrencyCode == 'USD'
                                      ? Colors.white
                                      : AppColors.text,
                                ),
                              ),
                            ),
                            selected: _selectedCurrencyCode == 'USD',
                            selectedColor: AppColors.accent,
                            onSelected: (val) {
                              if (val) {
                                AppHaptics.selection();
                                setState(() => _selectedCurrencyCode = 'USD');
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Amount Field
                    TextField(
                      controller: _amountCtrl,
                      keyboardType: TextInputType.number,
                      inputFormatters: [PriceInputFormatter()],
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        color: AppColors.text,
                      ),
                      decoration: InputDecoration(
                        hintText: _selectedCurrencyCode == 'UZS'
                            ? "${tr('amount')} (${tr('currency_uzs')})"
                            : "${tr('amount')} (\$)",
                        prefixIcon: const Icon(Icons.payments_outlined, size: 22),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 18,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Category Selector
                    if (!_loadingCategories) ...[
                      Text(
                        tr('category'),
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppColors.muted,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: [
                          ..._categories.map((c) {
                            final selected = _selectedCategory?.name == c.name;
                            return GestureDetector(
                              onTap: () {
                                AppHaptics.selection();
                                setState(() {
                                  _selectedCategory = c;
                                  if (!c.isWorker) _selectedToUserId = null;
                                });
                              },
                              onLongPress: (!c.isWorker && c.name != tr('worker') && c.name != tr('cat_customer') && c.name != 'Mijoz')
                                  ? () async {
                                      AppHaptics.longPress();
                                      final confirm = await showDialog<bool>(
                                        context: context,
                                        builder: (dctx) => AlertDialog(
                                          title: Text(tr('delete_category')),
                                          content: Text(tr('delete_category_q')
                                              .replaceFirst('{}', c.name)),
                                          actions: [
                                            TextButton(
                                              onPressed: () =>
                                                  Navigator.of(dctx).pop(false),
                                              child: Text(tr('no')),
                                            ),
                                            ElevatedButton(
                                              style: ElevatedButton.styleFrom(
                                                backgroundColor: AppColors.red,
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                        horizontal: 16,
                                                        vertical: 8),
                                              ),
                                              onPressed: () {
                                                AppHaptics.delete();
                                                Navigator.of(dctx).pop(true);
                                              },
                                              child: Text(tr('yes')),
                                            ),
                                          ],
                                        ),
                                      );
                                      if (confirm == true) {
                                        try {
                                          final userId =
                                              supabase.auth.currentUser?.id;
                                           if (userId != null) {
                                             final projPrefix =
                                                 'proj:${widget.projectId}:${widget.isIncome ? "inc:" : "exp:"}';
                                             final legacyPrefix =
                                                 widget.isIncome ? 'inc:' : 'exp:';
                                             await supabase
                                                 .from('categories')
                                                 .delete()
                                                 .eq('user_id', userId)
                                                 .eq('name', '$projPrefix${c.icon.codePoint}:${c.name}');
                                             await supabase
                                                 .from('categories')
                                                 .delete()
                                                 .eq('user_id', userId)
                                                 .eq('name', '$legacyPrefix${c.icon.codePoint}:${c.name}');
                                           }
                                          setState(() {
                                            _categories.removeWhere(
                                                (item) => item.name == c.name);
                                            if (_selectedCategory?.name ==
                                                c.name) {
                                              _selectedCategory =
                                                  _categories.isNotEmpty
                                                      ? _categories.first
                                                      : null;
                                              _selectedToUserId = null;
                                            }
                                          });
                                        } catch (_) {}
                                      }
                                    }
                                  : null,
                              child: Container(
                                constraints: const BoxConstraints(
                                  minWidth: 76,
                                  minHeight: 68,
                                ),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 10, vertical: 8),
                                decoration: BoxDecoration(
                                  color: selected
                                      ? color.withValues(alpha: 0.12)
                                      : AppColors.card,
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(
                                    color: selected
                                        ? color
                                        : AppColors.border,
                                    width: selected ? 1.5 : 1,
                                  ),
                                ),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      c.icon,
                                      size: 22,
                                      color: selected ? color : AppColors.text2,
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      c.name == 'Xodim'
                                          ? tr('xodim_category')
                                          : c.name,
                                      textAlign: TextAlign.center,
                                      maxLines: 2,
                                      style: TextStyle(
                                        fontSize: 10,
                                        height: 1.15,
                                        fontWeight: FontWeight.w700,
                                        color:
                                            selected ? color : AppColors.text2,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          }),
                          GestureDetector(
                            onTap: () async {
                              final added = await _openAddCategoryDialog();
                              if (added != null) {
                                _categories.add(added);
                                await _saveCustomCategories(
                                    _categories
                                        .where((c) =>
                                            !c.isWorker &&
                                            c.name != tr('cat_customer') &&
                                            c.name != 'Mijoz')
                                        .toList(),
                                    widget.isIncome);
                                setState(() => _selectedCategory = added);
                              }
                            },
                            child: Container(
                              width: 76,
                              height: 68,
                              decoration: BoxDecoration(
                                color: AppColors.card,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: AppColors.border),
                              ),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const Icon(Icons.add_rounded,
                                      size: 22, color: AppColors.accent),
                                  const SizedBox(height: 4),
                                  Text(
                                    tr('other'),
                                    style: const TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.accent,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),

                      // Worker Selection Card
                      if (_selectedCategory?.isWorker == true) ...[
                        if (widget.workers.isEmpty)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 16),
                            child: Text(
                              tr('no_workers_in_project'),
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.muted,
                              ),
                            ),
                          )
                        else ...[
                          GestureDetector(
                            onTap: () async {
                              final selected =
                                  await showModalBottomSheet<String>(
                                context: context,
                                backgroundColor: AppColors.card,
                                shape: const RoundedRectangleBorder(
                                  borderRadius: BorderRadius.vertical(
                                    top: Radius.circular(24),
                                  ),
                                ),
                                builder: (bctx) => SafeArea(
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Padding(
                                        padding: const EdgeInsets.symmetric(
                                          vertical: 16,
                                        ),
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
                                          itemCount: widget.workers.length,
                                          itemBuilder: (lctx, index) {
                                            final w = widget.workers[index];
                                            return ListTile(
                                              title: Text(
                                                w.displayName,
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.w700,
                                                  color: AppColors.text,
                                                ),
                                              ),
                                              trailing:
                                                  _selectedToUserId == w.userId
                                                      ? const Icon(
                                                          Icons.check_circle_rounded,
                                                          color: AppColors.accent,
                                                        )
                                                      : null,
                                              onTap: () => Navigator.of(lctx)
                                                  .pop(w.userId),
                                            );
                                          },
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                              if (selected != null) {
                                setState(() => _selectedToUserId = selected);
                              }
                            },
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 14,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.card,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: AppColors.border),
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          tr('worker'),
                                          style: const TextStyle(
                                            fontSize: 11,
                                            color: AppColors.muted,
                                            fontWeight: FontWeight.w500,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          _selectedToUserId != null
                                              ? widget.workers
                                                  .firstWhere(
                                                    (w) =>
                                                        w.userId ==
                                                        _selectedToUserId,
                                                    orElse: () =>
                                                        widget.workers.first,
                                                  )
                                                  .displayName
                                              : tr('select_worker'),
                                          style: const TextStyle(
                                            fontSize: 15,
                                            fontWeight: FontWeight.w700,
                                            color: AppColors.text,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const Icon(
                                    Icons.keyboard_arrow_down_rounded,
                                    color: AppColors.muted,
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 20),
                        ],
                      ],
                    ],

                    // Comment Field
                    TextField(
                      controller: _noteCtrl,
                      decoration: InputDecoration(
                        hintText: tr('comment_hint'),
                        prefixIcon: const Icon(Icons.note_alt_outlined, size: 20),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 16,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),

                    // File Attachment Section
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              tr('attached_files'),
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: AppColors.muted,
                              ),
                            ),
                            TextButton.icon(
                              onPressed: _openFileSelectionSheet,
                              icon: const Icon(Icons.attach_file_rounded, size: 16),
                              label: Text(
                                _selectedFiles.isEmpty
                                    ? tr('attach_files')
                                    : tr('edit'),
                                style: const TextStyle(fontSize: 12),
                              ),
                              style: TextButton.styleFrom(
                                foregroundColor: AppColors.accent,
                              ),
                            ),
                          ],
                        ),
                        if (_selectedFiles.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Column(
                            children: _selectedFiles.map((f) {
                              return Container(
                                margin: const EdgeInsets.only(bottom: 8),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 10,
                                ),
                                decoration: BoxDecoration(
                                  color: AppColors.card,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: AppColors.border),
                                ),
                                child: Row(
                                  children: [
                                    Icon(_fileIcon(f),
                                        size: 20, color: _fileColor(f)),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        f.name,
                                        style: const TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w600,
                                          color: AppColors.text,
                                        ),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.close_rounded,
                                          size: 18, color: AppColors.muted),
                                      padding: EdgeInsets.zero,
                                      constraints: const BoxConstraints(),
                                      onPressed: () {
                                        setState(() {
                                          _selectedFiles.removeWhere(
                                              (x) => x.path == f.path);
                                        });
                                      },
                                    ),
                                  ],
                                ),
                              );
                            }).toList(),
                          ),
                        ] else ...[
                          OutlinedButton.icon(
                            onPressed: _openFileSelectionSheet,
                            icon: const Icon(Icons.attach_file_rounded, size: 18),
                            label: Text(tr('attach_files')),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppColors.text2,
                              side: const BorderSide(color: AppColors.border),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 12,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),

            // Submit Button
            Padding(
              padding: const EdgeInsets.all(20),
              child: SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: color,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    elevation: 0,
                  ),
                  onPressed: _submit,
                  child: Text(
                    buttonLabel,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FileSelectionBottomSheet extends StatefulWidget {
  final String projectId;
  final ProjectFilesRepository repo;
  final List<ProjectFile> initialSelected;

  const _FileSelectionBottomSheet({
    required this.projectId,
    required this.repo,
    required this.initialSelected,
  });

  @override
  State<_FileSelectionBottomSheet> createState() =>
      __FileSelectionBottomSheetState();
}

class __FileSelectionBottomSheetState
    extends State<_FileSelectionBottomSheet> {
  List<ProjectFile> _files = [];
  bool _loading = true;
  final Set<String> _selectedPaths = {};

  @override
  void initState() {
    super.initState();
    _selectedPaths.addAll(widget.initialSelected.map((f) => f.path));
    _loadFiles();
  }

  Future<void> _loadFiles() async {
    setState(() => _loading = true);
    final list = await widget.repo.listFiles(widget.projectId);
    if (mounted) {
      setState(() {
        _files = list;
        _loading = false;
      });
    }
  }

  Future<void> _uploadImageOnTheSpot() async {
    try {
      final picker = ImagePicker();
      final image =
          await picker.pickImage(source: ImageSource.gallery, imageQuality: 90);
      if (image == null) return;
      final bytes = await image.readAsBytes();

      final originalName = image.name.isNotEmpty
          ? image.name
          : 'image_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final ext = originalName.contains('.')
          ? originalName.split('.').last.toLowerCase()
          : 'jpg';
      final mime = 'image/${ext == 'png' ? 'png' : 'jpeg'}';

      final customNameInput = await showDialog<String>(
        context: context,
        builder: (dctx) {
          final ctrl = TextEditingController(text: originalName);
          return AlertDialog(
            backgroundColor: AppColors.card,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            title: Text(tr('file_name_title'),
                style:
                    const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tr('original_file_name'),
                  style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.muted,
                      fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.bg,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.image_outlined,
                          size: 18, color: AppColors.accent),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          originalName,
                          style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppColors.text),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  tr('given_file_name'),
                  style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.muted,
                      fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: ctrl,
                  decoration: InputDecoration(
                    hintText: tr('file_name_hint'),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 10),
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dctx).pop(null),
                child: Text(tr('cancel')),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.accent,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: () {
                  final val = ctrl.text.trim();
                  if (val.isNotEmpty) {
                    Navigator.of(dctx).pop(val);
                  }
                },
                child: Text(tr('upload_image')),
              ),
            ],
          );
        },
      );

      if (customNameInput == null || customNameInput.trim().isEmpty) return;

      String finalCustomName = customNameInput.trim();
      if (ext.isNotEmpty && !finalCustomName.toLowerCase().endsWith('.$ext')) {
        finalCustomName = '$finalCustomName.$ext';
      }

      setState(() => _loading = true);
      await widget.repo.uploadFile(
        widget.projectId,
        finalCustomName,
        bytes,
        mime,
        originalName: originalName,
        isTransactionFile: true,
      );
      final updatedList = await widget.repo.listFiles(
        widget.projectId,
        includeTransactionFiles: true,
      );

      // Find uploaded file path and select it automatically
      final uploaded = updatedList.firstWhere(
        (f) => f.name == finalCustomName,
        orElse: () => updatedList.first,
      );

      if (mounted) {
        setState(() {
          _files = updatedList;
          _selectedPaths.add(uploaded.path);
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(tr('error_short').replaceFirst('{}', '$e'))));
      }
    }
  }

  Future<void> _uploadFileOnTheSpot() async {
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
      final originalName = pf.name;

      final customNameInput = await showDialog<String>(
        context: context,
        builder: (dctx) {
          final ctrl = TextEditingController(text: originalName);
          return AlertDialog(
            backgroundColor: AppColors.card,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            title: Text(tr('file_name_title'),
                style:
                    const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tr('original_file_name'),
                  style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.muted,
                      fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.bg,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.insert_drive_file_outlined,
                          size: 18, color: AppColors.accent),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          originalName,
                          style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppColors.text),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  tr('given_file_name'),
                  style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.muted,
                      fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: ctrl,
                  decoration: InputDecoration(
                    hintText: tr('file_name_hint'),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 10),
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dctx).pop(null),
                child: Text(tr('cancel')),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.accent,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: () {
                  final val = ctrl.text.trim();
                  if (val.isNotEmpty) {
                    Navigator.of(dctx).pop(val);
                  }
                },
                child: Text(tr('upload_file')),
              ),
            ],
          );
        },
      );

      if (customNameInput == null || customNameInput.trim().isEmpty) return;

      String finalCustomName = customNameInput.trim();
      if (ext.isNotEmpty && !finalCustomName.toLowerCase().endsWith('.$ext')) {
        finalCustomName = '$finalCustomName.$ext';
      }

      setState(() => _loading = true);
      await widget.repo.uploadFile(
        widget.projectId,
        finalCustomName,
        pf.bytes!,
        mime,
        originalName: originalName,
        isTransactionFile: true,
      );
      final updatedList = await widget.repo.listFiles(
        widget.projectId,
        includeTransactionFiles: true,
      );

      final uploaded = updatedList.firstWhere(
        (f) => f.name == finalCustomName,
        orElse: () => updatedList.first,
      );

      if (mounted) {
        setState(() {
          _files = updatedList;
          _selectedPaths.add(uploaded.path);
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(tr('error_short').replaceFirst('{}', '$e'))));
      }
    }
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

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  tr('select_files_title'),
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: AppColors.text,
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close_rounded, color: AppColors.muted),
                onPressed: () => Navigator.of(context).pop(null),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // On-the-spot Action Buttons
          Row(
            children: [
              Expanded(
                child: TextButton.icon(
                  onPressed: _uploadImageOnTheSpot,
                  icon: const Icon(Icons.add_a_photo_outlined, size: 16),
                  label: Text(
                    tr('upload_image'),
                    style: const TextStyle(fontSize: 12),
                  ),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.accent,
                    backgroundColor: AppColors.accent.withValues(alpha: 0.08),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextButton.icon(
                  onPressed: _uploadFileOnTheSpot,
                  icon: const Icon(Icons.upload_file_outlined, size: 16),
                  label: Text(
                    tr('upload_file'),
                    style: const TextStyle(fontSize: 12),
                  ),
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.accent,
                    backgroundColor: AppColors.accent.withValues(alpha: 0.08),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Divider(height: 1, color: AppColors.border),

          // List of Project Files
          Expanded(
            child: _loading
                ? const Center(
                    child: CircularProgressIndicator(color: AppColors.accent),
                  )
                : _files.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(
                              Icons.folder_open_rounded,
                              size: 40,
                              color: AppColors.muted,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              tr('no_files'),
                              style: const TextStyle(
                                color: AppColors.muted,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        itemCount: _files.length,
                        separatorBuilder: (_, __) => const Divider(
                          color: AppColors.border,
                          height: 1,
                          indent: 52,
                        ),
                        itemBuilder: (_, i) {
                          final f = _files[i];
                          final isSelected = _selectedPaths.contains(f.path);
                          return InkWell(
                            onTap: () {
                              setState(() {
                                if (isSelected) {
                                  _selectedPaths.remove(f.path);
                                } else {
                                  _selectedPaths.add(f.path);
                                }
                              });
                            },
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 10,
                              ),
                              child: Row(
                                children: [
                                  Checkbox(
                                    value: isSelected,
                                    activeColor: AppColors.accent,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    onChanged: (val) {
                                      setState(() {
                                        if (val == true) {
                                          _selectedPaths.add(f.path);
                                        } else {
                                          _selectedPaths.remove(f.path);
                                        }
                                      });
                                    },
                                  ),
                                  Container(
                                    width: 34,
                                    height: 34,
                                    decoration: BoxDecoration(
                                      color: _fileColor(f).withValues(alpha: 0.12),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Icon(
                                      _fileIcon(f),
                                      size: 18,
                                      color: _fileColor(f),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          f.name,
                                          style: const TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600,
                                            color: AppColors.text,
                                          ),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        if (f.originalName != f.name ||
                                            f.sizeBytes != null)
                                          Text(
                                            f.originalName != f.name
                                                ? '${f.originalName}${f.sizeBytes != null ? ' • ${_formatSize(f.sizeBytes!)}' : ''}'
                                                : _formatSize(f.sizeBytes!),
                                            style: const TextStyle(
                                              fontSize: 11,
                                              color: AppColors.muted,
                                            ),
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
          ),
          const SizedBox(height: 12),

          // Confirm Button
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.accent,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                elevation: 0,
              ),
              onPressed: () {
                final selectedList =
                    _files.where((f) => _selectedPaths.contains(f.path)).toList();
                Navigator.of(context).pop(selectedList);
              },
              child: Text(
                tr('confirm_selection')
                    .replaceFirst('{}', _selectedPaths.length.toString()),
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
