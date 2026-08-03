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
import '../widgets/project_hero_card.dart';
import '../services/currency_service.dart';
import '../widgets/shimmer.dart';
import '../widgets/app_cached_image.dart';
import 'worker_detail_screen.dart';
import 'add_transaction_screen.dart';
import 'edit_project_screen.dart';
import '../utils/haptics.dart';



class ProjectDetailScreen extends StatefulWidget {
  final Project project;
  final bool? quickAddIncome;
  final int? initialTabIndex;
  final String? initialTxId;

  const ProjectDetailScreen({
    super.key,
    required this.project,
    this.quickAddIncome,
    this.initialTabIndex,
    this.initialTxId,
  });

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
  String _sortMode = 'newest';
  DateTimeRange? _dateRange;
  bool _hasChanged = false;
  bool _mutating = false;

  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _project = widget.project;
    _tabController = TabController(
      length: 4,
      vsync: this,
      initialIndex: widget.initialTabIndex ?? 0,
    );
    _tabController.addListener(() {
      if (_tabController.index == 3 && _files.isEmpty && !_filesLoading) {
        _loadFiles();
      }
    });
    _loadAndQuickAdd();
  }

  Future<void> _loadAndQuickAdd() async {
    await _load();
    if (mounted) {
      setState(() => _hasChanged = false);
    }
    if (widget.quickAddIncome != null && mounted) {
      _openAddTransaction(isIncome: widget.quickAddIncome!);
    } else if (widget.initialTxId != null && mounted) {
      try {
        final tx = _txs.firstWhere((t) => t.id == widget.initialTxId);
        _showTransactionDetails(tx);
      } catch (_) {}
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      projectUpdateNotifier.value++;
    });
    super.dispose();
  }

  Future<void> _withMutation(Future<void> Function() fn) async {
    if (!mounted) return;
    setState(() => _mutating = true);
    try {
      await fn();
    } finally {
      if (mounted) setState(() => _mutating = false);
    }
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
        _hasChanged = true;
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
      final membersList = await _memberRepo.loadForProject(_project.id);
      final refreshedProject = await _projectRepo.loadProjectById(_project.id);

      final isOwner = _project.role == 'owner';
      final currentMember = membersList.cast<ObMember?>().firstWhere(
        (m) => m?.userId == userId,
        orElse: () => null,
      );
      final canViewOwner = isOwner || (currentMember?.canViewOwnerTransactions ?? false);

      final loadedTxs = await _txRepo.loadForProject(
        _project.id,
        createdBy: canViewOwner ? null : userId,
      );

      if (!mounted) return;

      setState(() {
        _txs = loadedTxs;
        _members = membersList;
        if (refreshedProject != null) _project = refreshedProject;
        _hasChanged = true;
      });
    } catch (e) {
      print("DEBUG: Error loading project data: $e");
    }
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
    final userId = supabase.auth.currentUser?.id ?? '';
    final isProjectOwner = _project.role == 'owner';
    final currentMember = _members.cast<ObMember?>().firstWhere(
      (m) => m?.userId == userId,
      orElse: () => null,
    );
    final canViewAllProjectTxs = isProjectOwner || (currentMember?.canViewOwnerTransactions ?? false);

    var base = _txs;

    if (!canViewAllProjectTxs) {
      base = base.where((tx) => tx.fromUser == userId || tx.toUser == userId || tx.createdBy == userId).toList();
    }

    switch (_txFilter) {
      case 'income':
        base = base.where((tx) => canViewAllProjectTxs
            ? (tx.tur == 'income' || tx.tur == 'kirim' || tx.isIncomeFor(userId))
            : tx.isIncomeFor(userId)).toList();
        break;
      case 'expense':
        base = base.where((tx) => canViewAllProjectTxs
            ? (tx.tur == 'spend' || tx.tur == 'send' || tx.tur == 'chiqim' || tx.tur == 'expense' || tx.tur == 'ishhaqi' || tx.isExpenseFor(userId))
            : tx.isExpenseFor(userId)).toList();
        break;
    }

    if (_dateRange != null) {
      final startOfDay = DateTime(_dateRange!.start.year, _dateRange!.start.month, _dateRange!.start.day);
      final endOfDay = DateTime(_dateRange!.end.year, _dateRange!.end.month, _dateRange!.end.day, 23, 59, 59);
      base = base.where((tx) => tx.date.isAfter(startOfDay.subtract(const Duration(seconds: 1))) && tx.date.isBefore(endOfDay.add(const Duration(seconds: 1)))).toList();
    }

    switch (_sortMode) {
      case 'oldest':
        base.sort((a, b) => a.date.compareTo(b.date));
        break;
      case 'highest_price':
        base.sort((a, b) => b.summaUzs.compareTo(a.summaUzs));
        break;
      case 'lowest_price':
        base.sort((a, b) => a.summaUzs.compareTo(b.summaUzs));
        break;
      case 'newest':
      default:
        base.sort((a, b) => b.date.compareTo(a.date));
        break;
    }

    return base;
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
    final result = await Navigator.of(context).push<AddTransactionResult>(
      MaterialPageRoute(
        builder: (ctx) => AddTransactionScreen(
          isIncome: isIncome,
          projectId: _project.id,
          workers: _visibleMembers,
          preSelectedWorkerId: preSelectedWorkerId,
        ),
      ),
    );

    if (result == null) return;

    final amount = result.amount;
    final selectedCurrencyCode = result.currencyCode;
    final categoryName = result.categoryName;
    final isWorkerCategory = result.isWorkerCategory;
    final selectedToUserId = result.toUserId;
    final noteText = result.noteText;
    final isMember = _project.role == 'member';

    // Save originals for rollback
    final originalTxs = List<ProjectTransaction>.from(_txs);
    final originalProject = _project;
    final originalMembers = List<ObMember>.from(_members);

    // Prepare optimistic updates
    final rate = CurrencyService().usdToUzsRate;
    final converted = CurrencyService().convert(amount.toDouble(), selectedCurrencyCode);
    final amountUzs = converted['UZS']!;
    final amountUsd = converted['USD']!;

    final filePaths = result.attachedFiles.map((f) => f.path).toList();

    final tempTx = ProjectTransaction(
      id: 'temp_${DateTime.now().millisecondsSinceEpoch}',
      obId: _project.id,
      tur: isIncome ? 'income' : 'spend',
      summa: amount,
      izoh: noteText.isNotEmpty ? noteText : null,
      kategoriya: categoryName,
      toUser: isIncome ? null : selectedToUserId,
      fromUser: isIncome ? supabase.auth.currentUser?.id : null,
      createdBy: supabase.auth.currentUser?.id,
      date: DateTime.now(),
      currency: selectedCurrencyCode,
      exchangeRate: rate,
      summaUsd: amountUsd,
      summaUzs: amountUzs,
      files: filePaths,
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
      olingan: _project.olingan + ((!isIncome && isWorkerCategory) ? amount : 0),
      status: _project.status,
      manzil: _project.manzil,
      mijoz: _project.mijoz,
      bosqich: _project.bosqich,
      imageUrl: _project.imageUrl,
    );

    List<ObMember> updatedMembers = _members;
    if (!isIncome && isWorkerCategory && selectedToUserId != null) {
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
      _mutating = true;
    });

    try {
      if (!isIncome && isMember) {
        if (isWorkerCategory && selectedToUserId != null) {
          await _txRepo.distributeToSubWorker(
            obId: _project.id,
            toUserId: selectedToUserId,
            amount: amount,
            izoh: noteText.isNotEmpty ? noteText : null,
            currency: selectedCurrencyCode,
            files: filePaths,
          );
        } else {
          await _txRepo.logSelfWithdrawal(
            obId: _project.id,
            amount: amount,
            kategoriya: categoryName,
            izoh: noteText.isNotEmpty ? noteText : null,
            currency: selectedCurrencyCode,
            files: filePaths,
          );
        }
      } else {
        await _txRepo.addTransaction(
          obId: _project.id,
          isIncome: isIncome,
          amount: amount,
          kategoriya: categoryName,
          izoh: noteText.isNotEmpty ? noteText : null,
          toUserId: isIncome ? null : selectedToUserId,
          currency: selectedCurrencyCode,
          files: filePaths,
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
    } finally {
      if (mounted) setState(() => _mutating = false);
    }
  }

  Future<void> _openEditProject() async {
    final updated = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => EditProjectScreen(project: _project)),
    );
    if (updated == true) {
      _withMutation(_loadSilent);
      setState(() => _hasChanged = true);
    }
  }

  void _openWorkerDetail(ObMember m) async {
    final worker = Worker(
      userId: m.userId,
      profile: m.profile,
      kasb: m.kasb,
      ishaqi: m.ishaqi,
      olingan: m.olingan,
      obsList: [
        WorkerProject(
          obId: widget.project.id,
          obNomi: widget.project.nomi,
          balans: m.ishaqi - m.olingan,
        ),
      ],
    );

    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => WorkerDetailScreen(
          worker: worker,
          onAction: _load,
        ),
      ),
    );
    _load();
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
          _withMutation(_loadSilent);
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
        _withMutation(_loadSilent);
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
    final amountUzs = tx.summaUzs > 0 ? tx.summaUzs : tx.summa;
    final updatedProject = Project(
      id: _project.id,
      nomi: _project.nomi,
      kirim: _project.kirim - (isIncome ? amountUzs : 0),
      chiqim: _project.chiqim - (isIncome ? 0 : amountUzs),
      boshlanish: _project.boshlanish,
      tugash: _project.tugash,
      createdAt: _project.createdAt,
      muddat: _project.muddat,
      role: _project.role,
      myBalance: _project.myBalance - (isIncome ? amountUzs : -amountUzs),
      ishaqi: _project.ishaqi,
      olingan: _project.olingan - ((!isIncome && tx.toUser != null) ? amountUzs : 0),
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
            olingan: m.olingan - amountUzs,
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

    AppHaptics.delete();
    setState(() {
      _txs = _txs.where((t) => t.id != tx.id).toList();
      _project = updatedProject;
      _members = updatedMembers;
      _mutating = true;
    });

    try {
      await _txRepo.deleteTransaction(tx.id);
      await _loadSilent();
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
    } finally {
      if (mounted) setState(() => _mutating = false);
    }
  }

  Future<void> _showTransactionDetails(ProjectTransaction tx) async {
    final userId = supabase.auth.currentUser?.id ?? '';
    final isIncome = tx.isIncomeFor(userId);
    final color = isIncome ? AppColors.green : AppColors.red;
    
    String displayCategory = tx.kategoriya ?? (isIncome ? tr('income') : tr('expense'));
    if (displayCategory == 'usta' || displayCategory == 'Xodim') {
      displayCategory = tr('worker_default_role');
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
                    tr('tx_info_title'),
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
                  color: color.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Center(
                  child: Text(
                    '${isIncome ? '+' : '-'}${formatTransactionAmount(tx)}',
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w900,
                      color: color,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Info rows
              _buildDetailRow(tr('type'), isIncome ? tr('income') : tr('expense')),
              _buildDetailRow(tr('category'), displayCategory),
              _buildDetailRow(tr('date'), _formatDate(tx.date)),
              if (tx.izoh != null && tx.izoh!.isNotEmpty)
                _buildDetailRow(tr('note'), tx.izoh!),

              if (tx.files.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(
                  appLocaleNotifier.value == 'ru'
                      ? 'Прикрепленные файлы (${tx.files.length})'
                      : 'Biriktirilgan fayllar (${tx.files.length})',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.muted,
                  ),
                ),
                const SizedBox(height: 8),
                ...tx.files.map((filePath) {
                  final pFile = ProjectFile.fromPath(filePath);
                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    decoration: BoxDecoration(
                      color: AppColors.bg,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: ListTile(
                      dense: true,
                      leading: Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: _fileColor(pFile).withOpacity(0.12),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(_fileIcon(pFile),
                            size: 18, color: _fileColor(pFile)),
                      ),
                      title: Text(
                        pFile.name,
                        style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: AppColors.text),
                        overflow: TextOverflow.ellipsis,
                      ),
                      subtitle: pFile.originalName != pFile.name
                          ? Text(
                              pFile.originalName,
                              style: const TextStyle(
                                  fontSize: 11, color: AppColors.muted),
                              overflow: TextOverflow.ellipsis,
                            )
                          : null,
                      trailing: const Icon(Icons.open_in_new_rounded,
                          size: 16, color: AppColors.accent),
                      onTap: () {
                        Navigator.of(ctx).pop();
                        _openFile(pFile);
                      },
                    ),
                  );
                }),
              ],

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
    final result = await Navigator.of(context).push<AddTransactionResult>(
      MaterialPageRoute(
        builder: (ctx) => AddTransactionScreen(
          isIncome: isIncome,
          projectId: _project.id,
          workers: _visibleMembers,
          initialTransaction: tx,
        ),
      ),
    );

    if (result == null) return;

    final amount = result.amount;
    final selectedCurrencyCode = result.currencyCode;
    final categoryName = result.categoryName;
    final selectedToUserId = result.toUserId;
    final noteText = result.noteText;
    final filePaths = result.attachedFiles.map((f) => f.path).toList();

    AppHaptics.medium();
    setState(() => _mutating = true);

    try {
      await _txRepo.updateTransaction(
        id: tx.id,
        newAmount: amount,
        newKategoriya: categoryName,
        newIzoh: noteText.isNotEmpty ? noteText : null,
        newTxDate: tx.date,
        newCurrency: selectedCurrencyCode,
        newToUserId: selectedToUserId,
        newFiles: filePaths,
      );
      await _loadSilent();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Xato: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _mutating = false);
    }
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
      final originalName = pf.name;
      final customNameInput = await showDialog<String>(
        context: context,
        builder: (dctx) {
          final ctrl = TextEditingController(text: originalName);
          return AlertDialog(
            backgroundColor: AppColors.card,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            title: Text(tr('file_name_title'),
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tr('original_file_name'),
                  style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.bg,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.insert_drive_file_outlined, size: 18, color: AppColors.accent),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          originalName,
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.text),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  tr('given_file_name'),
                  style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: ctrl,
                  autofocus: true,
                  decoration: InputDecoration(
                    hintText: tr('file_name_hint'),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
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
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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

      setState(() => _filesLoading = true);
      await _filesRepo.uploadFile(
        _project.id,
        finalCustomName,
        pf.bytes!,
        mime,
        originalName: originalName,
      );
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

  Future<void> _uploadImageFromGallery() async {
    try {
      final picker = ImagePicker();
      final image = await picker.pickImage(source: ImageSource.gallery, imageQuality: 90);
      if (image == null) return;
      final bytes = await image.readAsBytes();

      final originalName = image.name.isNotEmpty ? image.name : 'image_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final ext = originalName.contains('.') ? originalName.split('.').last.toLowerCase() : 'jpg';
      final mime = 'image/${ext == 'png' ? 'png' : 'jpeg'}';

      final customNameInput = await showDialog<String>(
        context: context,
        builder: (dctx) {
          final ctrl = TextEditingController(text: originalName);
          return AlertDialog(
            backgroundColor: AppColors.card,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            title: Text(tr('file_name_title'),
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tr('original_file_name'),
                  style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.bg,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.image_outlined, size: 18, color: AppColors.accent),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          originalName,
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.text),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  tr('given_file_name'),
                  style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: ctrl,
                  autofocus: true,
                  decoration: InputDecoration(
                    hintText: tr('file_name_hint'),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
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
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
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

      setState(() => _filesLoading = true);
      await _filesRepo.uploadFile(
        _project.id,
        finalCustomName,
        bytes,
        mime,
        originalName: originalName,
      );
      await _loadFiles();
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Rasm yuklandi')));
    } catch (e) {
      if (mounted) {
        setState(() => _filesLoading = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Xato: $e')));
      }
    }
  }

  Future<void> _confirmAndDeleteFile(ProjectFile f) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('tx_delete_title')),
        content: Text(
          appLocaleNotifier.value == 'ru'
              ? 'Файл ${f.name} будет удален из хранилища.'
              : "${f.name} xotiradan o'chiriladi.",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(tr('cancel')),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.red,
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(tr('delete')),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await _filesRepo.deleteFile(f.path);
        if (mounted) {
          setState(() {
            _files.removeWhere((x) => x.path == f.path);
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                appLocaleNotifier.value == 'ru'
                    ? 'Файл удален из хранилища'
                    : "Fayl xotiradan o'chirildi",
              ),
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Xato: $e')),
          );
        }
      }
    }
  }

  Future<void> _openFile(ProjectFile f) async {
    if (f.isImage) {
      showDialog(
        context: context,
        builder: (ctx) => Dialog.fullscreen(
          backgroundColor: Colors.black,
          child: Scaffold(
            backgroundColor: Colors.black,
            appBar: AppBar(
              backgroundColor: Colors.black,
              iconTheme: const IconThemeData(color: Colors.white),
              title: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    f.name,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.bold),
                  ),
                  if (f.originalName != f.name)
                    Text(
                      f.originalName,
                      style:
                          const TextStyle(color: Colors.white70, fontSize: 11),
                    ),
                ],
              ),
              actions: [
                IconButton(
                  icon: const Icon(Icons.open_in_new_rounded,
                      color: Colors.white, size: 20),
                  tooltip: tr('open_external'),
                  onPressed: () async {
                    final uri = Uri.parse(f.publicUrl);
                    if (await canLaunchUrl(uri)) {
                      launchUrl(uri, mode: LaunchMode.externalApplication);
                    }
                  },
                ),
              ],
            ),
            body: Center(
              child: InteractiveViewer(
                minScale: 0.5,
                maxScale: 4.0,
                child: AppCachedImage(
                  imageUrl: f.publicUrl,
                  fit: BoxFit.contain,
                ),
              ),
            ),
          ),
        ),
      );
    } else {
      final publicUrl = f.publicUrl;
      final ext = f.extension.toLowerCase();

      final docsViewerUrl = [
        'doc',
        'docx',
        'xls',
        'xlsx',
        'csv',
        'ppt',
        'pptx',
        'pdf'
      ].contains(ext)
          ? 'https://docs.google.com/gview?embedded=true&url=${Uri.encodeComponent(publicUrl)}'
          : publicUrl;

      final uri = Uri.parse(docsViewerUrl);
      try {
        bool launched = await launchUrl(
          uri,
          mode: LaunchMode.inAppBrowserView,
        );
        if (!launched) {
          launched = await launchUrl(
            Uri.parse(publicUrl),
            mode: LaunchMode.inAppBrowserView,
          );
        }
        if (!launched) {
          await launchUrl(
            Uri.parse(publicUrl),
            mode: LaunchMode.externalApplication,
          );
        }
      } catch (_) {
        try {
          await launchUrl(
            Uri.parse(publicUrl),
            mode: LaunchMode.externalApplication,
          );
        } catch (e) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Xato: $e')),
            );
          }
        }
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
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => Navigator.of(context).pop(_hasChanged),
            ),
            title: Text(project.nomi,
                style: const TextStyle(fontWeight: FontWeight.w800)),
            actions: [
              if (_loading || _mutating)
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
                  tooltip: tr('edit'),
                  onPressed: () async {
                    await _openEditProject();
                    setState(() => _hasChanged = true);
                  },
                ),
              ],
              PopupMenuButton<String>(
                onSelected: (action) async {
                  if (action == 'toggleDone') {
                    await _projectRepo.setStatus(
                        project.id, isDone ? 'active' : 'done');
                    setState(() => _hasChanged = true);
                    _withMutation(_loadSilent);
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
                    SnackBar(content: Text(tr('copy_created'))));
            } else if (action == 'delete') {
              final confirm = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: Text(tr('tx_delete_title')),
                  content: Text('${project.nomi} ${tr("no_undo")}'),
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
                child: Text(isDone ? tr('restore_active') : tr('complete_project'))),
            PopupMenuItem(
                value: 'duplicate', child: Text(tr('duplicate_btn'))),
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
        : Column(
            children: [
              Container(
                color: AppColors.bg,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      decoration: BoxDecoration(
                        color: AppColors.card,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: TabBar(
                        controller: _tabController,
                        labelColor: AppColors.accent,
                        unselectedLabelColor: AppColors.text2,
                        indicator: BoxDecoration(
                          color: AppColors.accent.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        indicatorSize: TabBarIndicatorSize.tab,
                        dividerColor: Colors.transparent,
                        isScrollable: false,
                        labelPadding: const EdgeInsets.symmetric(horizontal: 2),
                        labelStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 11.5),
                        unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 11.5),
                        padding: const EdgeInsets.all(4),
                        tabs: [
                          Tab(child: FittedBox(fit: BoxFit.scaleDown, child: Text(tr('umumiy')))),
                          Tab(child: FittedBox(fit: BoxFit.scaleDown, child: Text(tr('transactions')))),
                          Tab(child: FittedBox(fit: BoxFit.scaleDown, child: Text(tr('workers')))),
                          Tab(child: FittedBox(fit: BoxFit.scaleDown, child: Text(tr('files')))),
                        ],
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.swap_horiz_rounded,
                            size: 14, color: AppColors.muted.withOpacity(0.7)),
                        const SizedBox(width: 4),
                        Text(
                          tr('swipe_page_hint'),
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                            color: AppColors.muted.withOpacity(0.8),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const Divider(height: 1, color: AppColors.border),
              Expanded(
                child: TabBarView(
                  controller: _tabController,
                  children: [
                    _buildUmumiyTab(project, isDone, progress, left, startFmt, endFmt),
                    _buildTransactionsTab(),
                    _buildWorkersTab(),
                    _buildFilesTab(),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }


  // ── Umumiy tab: hero + stats + action buttons + info ──
  Widget _buildUmumiyTab(Project project, bool isDone, int progress, int left,
      String startFmt, String endFmt) {
    final balColor = project.balance >= 0 ? AppColors.accent : AppColors.red;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          // Hero card
          _buildHeroCard(project, isDone, progress, left),
          const SizedBox(height: 16),

          // Significant Financial Stats Row (Kirim, Chiqim, Qoldiq)
          Row(
            children: [
              // 1. Kirim Card
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 10),
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.green.withValues(alpha: 0.06),
                        blurRadius: 10,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(3),
                            decoration: BoxDecoration(
                              color: AppColors.green.withValues(alpha: 0.12),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.arrow_downward_rounded,
                              size: 13,
                              color: AppColors.green,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            tr('income').toUpperCase(),
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w900,
                              color: AppColors.muted,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          formatUzsToDisplay(project.kirim),
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w900,
                            color: AppColors.green,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),

              // 2. Chiqim Card
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 10),
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.red.withValues(alpha: 0.06),
                        blurRadius: 10,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(3),
                            decoration: BoxDecoration(
                              color: AppColors.red.withValues(alpha: 0.12),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.arrow_upward_rounded,
                              size: 13,
                              color: AppColors.red,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            tr('expense').toUpperCase(),
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w900,
                              color: AppColors.muted,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          formatUzsToDisplay(project.chiqim),
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w900,
                            color: AppColors.red,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),

              // 3. Qoldiq Card
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 10),
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: balColor.withValues(alpha: 0.06),
                        blurRadius: 10,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(3),
                            decoration: BoxDecoration(
                              color: balColor.withValues(alpha: 0.12),
                              shape: BoxShape.circle,
                            ),
                            child: Icon(
                              Icons.account_balance_wallet_rounded,
                              size: 13,
                              color: balColor,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            tr('balance').toUpperCase(),
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w900,
                              color: AppColors.muted,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          formatUzsToDisplay(project.balance),
                          style: TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w900,
                            color: balColor,
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

          // Action buttons
          if (_project.role == 'owner') ...[
            Row(children: [
              _buildActionButton(
                title: tr('income'),
                subtitle: tr('add'),
                icon: Icons.arrow_downward_rounded,
                color: AppColors.accent,
                onPressed: () => _openAddTransaction(isIncome: true),
              ),
              const SizedBox(width: 12),
              _buildActionButton(
                title: tr('expense'),
                subtitle: tr('add'),
                icon: Icons.arrow_upward_rounded,
                color: AppColors.green,
                onPressed: () => _openAddTransaction(isIncome: false),
              ),
            ]),
            const SizedBox(height: 20),
          ] else if (_project.role == 'member') ...[
            Row(children: [
              _buildActionButton(
                title: tr('income'),
                subtitle: tr('add'),
                icon: Icons.arrow_downward_rounded,
                color: AppColors.accent,
                onPressed: () => _openAddTransaction(isIncome: true),
              ),
              const SizedBox(width: 12),
              _buildActionButton(
                title: tr('expense'),
                subtitle: tr('add'),
                icon: Icons.arrow_upward_rounded,
                color: AppColors.red,
                onPressed: () => _openAddTransaction(isIncome: false),
              ),
            ]),
            const SizedBox(height: 20),
          ],

          // Info section
          _buildInfoSection(project, isDone, progress, left, startFmt, endFmt),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Widget _buildActionButton({
    required String title,
    required String subtitle,
    required IconData icon,
    required Color color,
    required VoidCallback onPressed,
  }) {
    return Expanded(
      child: ElevatedButton(
        style: ElevatedButton.styleFrom(
          backgroundColor: color,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          elevation: 0,
        ),
        onPressed: onPressed,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Container(
                width: 28,
                height: 28,
                margin: const EdgeInsets.only(left: 8),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 16, color: Colors.white),
              ),
            ),
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 10,
                      color: Colors.white70,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Hero card: image overlay with project name, progress, members, days ──
  Widget _buildHeroCard(Project project, bool isDone, int progress, int left) {
    return ProjectHeroCard(
      project: project,
      members: _members,
      onUploadImage: _pickAndUploadImage,
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
            _InfoRow(icon: Icons.people_outline_rounded, label: tr('total_workers'), trailing: Text('${_members.length}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700))),
          ]),
        ),
      ],
    );
  }

  String _getSortLabel(String mode) {
    if (mode == 'oldest') return tr('sort_oldest');
    if (mode == 'highest_price') return tr('sort_highest_price');
    if (mode == 'lowest_price') return tr('sort_lowest_price');
    return tr('sort_newest');
  }

  Widget _buildSortFilterButton() {
    final active = _sortMode != 'newest';
    return PopupMenuButton<String>(
      tooltip: tr('sort'),
      initialValue: _sortMode,
      onSelected: (val) {
        AppHaptics.selection();
        setState(() => _sortMode = val);
      },
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      color: AppColors.card,
      elevation: 4,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: active ? AppColors.accent.withValues(alpha: 0.1) : AppColors.card,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: active ? AppColors.accent : AppColors.border,
            width: active ? 1.5 : 1.0,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.tune_rounded,
              size: 16,
              color: active ? AppColors.accent : AppColors.text2,
            ),
            const SizedBox(width: 6),
            Text(
              _getSortLabel(_sortMode),
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: active ? AppColors.accent : AppColors.text2,
              ),
            ),
            const SizedBox(width: 4),
            Icon(
              Icons.arrow_drop_down_rounded,
              size: 18,
              color: active ? AppColors.accent : AppColors.muted,
            ),
          ],
        ),
      ),
      itemBuilder: (ctx) => [
        PopupMenuItem(
          value: 'newest',
          child: Row(
            children: [
              Icon(
                Icons.access_time_filled_rounded,
                size: 18,
                color: _sortMode == 'newest' ? AppColors.accent : AppColors.muted,
              ),
              const SizedBox(width: 10),
              Text(
                tr('sort_newest'),
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: _sortMode == 'newest' ? FontWeight.w800 : FontWeight.w600,
                  color: _sortMode == 'newest' ? AppColors.accent : AppColors.text,
                ),
              ),
            ],
          ),
        ),
        PopupMenuItem(
          value: 'oldest',
          child: Row(
            children: [
              Icon(
                Icons.history_rounded,
                size: 18,
                color: _sortMode == 'oldest' ? AppColors.accent : AppColors.muted,
              ),
              const SizedBox(width: 10),
              Text(
                tr('sort_oldest'),
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: _sortMode == 'oldest' ? FontWeight.w800 : FontWeight.w600,
                  color: _sortMode == 'oldest' ? AppColors.accent : AppColors.text,
                ),
              ),
            ],
          ),
        ),
        PopupMenuItem(
          value: 'highest_price',
          child: Row(
            children: [
              Icon(
                Icons.arrow_upward_rounded,
                size: 18,
                color: _sortMode == 'highest_price' ? AppColors.accent : AppColors.muted,
              ),
              const SizedBox(width: 10),
              Text(
                tr('sort_highest_price'),
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: _sortMode == 'highest_price' ? FontWeight.w800 : FontWeight.w600,
                  color: _sortMode == 'highest_price' ? AppColors.accent : AppColors.text,
                ),
              ),
            ],
          ),
        ),
        PopupMenuItem(
          value: 'lowest_price',
          child: Row(
            children: [
              Icon(
                Icons.arrow_downward_rounded,
                size: 18,
                color: _sortMode == 'lowest_price' ? AppColors.accent : AppColors.muted,
              ),
              const SizedBox(width: 10),
              Text(
                tr('sort_lowest_price'),
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: _sortMode == 'lowest_price' ? FontWeight.w800 : FontWeight.w600,
                  color: _sortMode == 'lowest_price' ? AppColors.accent : AppColors.text,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ── So'nggi faoliyat: last 4 transactions with 'Barchasi' link ──

  Widget _buildTransactionsTab() {
    final userId = supabase.auth.currentUser?.id ?? '';

    return Column(children: [
      // Filter chips: Barchasi, Faqat kirim, Faqat chiqim
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
        child: Row(children: [
          _FilterChip(
              label: tr('all'),
              selected: _txFilter == 'all',
              onTap: () {
                AppHaptics.selection();
                setState(() => _txFilter = 'all');
              }),
          const SizedBox(width: 8),
          _FilterChip(
              label: tr('only_income'),
              selected: _txFilter == 'income',
              onTap: () {
                AppHaptics.selection();
                setState(() => _txFilter = 'income');
              }),
          const SizedBox(width: 8),
          _FilterChip(
              label: tr('only_expense'),
              selected: _txFilter == 'expense',
              onTap: () {
                AppHaptics.selection();
                setState(() => _txFilter = 'expense');
              }),
        ]),
      ),

      // Date range picker: Sana oralig'ini tanlash
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
        child: InkWell(
          onTap: () {
            AppHaptics.light();
            _selectDateRange();
          },
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: _dateRange != null
                  ? AppColors.accent.withValues(alpha: 0.08)
                  : AppColors.card,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: _dateRange != null
                    ? AppColors.accent.withValues(alpha: 0.3)
                    : AppColors.border,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.calendar_month_outlined,
                  size: 20,
                  color: _dateRange != null ? AppColors.accent : AppColors.text2,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    _dateRange == null
                        ? tr('select_date_range')
                        : "${_formatDate(_dateRange!.start)} - ${_formatDate(_dateRange!.end)}",
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: _dateRange != null
                          ? FontWeight.w700
                          : FontWeight.w600,
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
                      size: 18,
                      color: AppColors.accent,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),

      // Sort filter button on bottom of date range picker
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        child: Align(
          alignment: Alignment.centerLeft,
          child: _buildSortFilterButton(),
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
                  final isIncome = tx.isIncomeFor(userId);
                  final color = isIncome ? AppColors.green : AppColors.red;

                  String displayCategory;
                  if (tx.tur == 'ishhaqi') {
                    displayCategory = tr('write_salary');
                  } else if (tx.tur == 'send') {
                    displayCategory = 'Avans';
                  } else {
                    displayCategory = tx.kategoriya ?? (isIncome ? tr('income') : tr('expense'));
                    if (displayCategory == 'usta' || displayCategory == 'Xodim') {
                      displayCategory = tr('xodim_category');
                    } else if (displayCategory == 'income' || displayCategory == 'Kirim') {
                      displayCategory = tr('income');
                    } else if (displayCategory == 'spend' || displayCategory == 'Chiqim') {
                      displayCategory = tr('expense');
                    }
                  }

                  if (tx.toUser == userId && tx.createdBy != null && tx.createdBy != userId) {
                    final matchingCreator = _members.cast<ObMember?>().firstWhere(
                      (m) => m?.userId == tx.createdBy,
                      orElse: () => null,
                    );
                    final name = matchingCreator?.displayName ?? tr('role_owner');
                    displayCategory = '${tr("role_owner")}: $name';
                  } else if (tx.toUser != null) {
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
                                Row(
                                  children: [
                                    Text(_formatDate(tx.date),
                                        style: const TextStyle(
                                            fontSize: 11, color: AppColors.muted)),
                                    if (tx.files.isNotEmpty) ...[
                                      const SizedBox(width: 8),
                                      Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          const Icon(Icons.attach_file_rounded,
                                              size: 13, color: AppColors.accent),
                                          const SizedBox(width: 2),
                                          Text(
                                            '${tx.files.length} ta fayl',
                                            style: const TextStyle(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w600,
                                              color: AppColors.accent,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ],
                                ),
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
                  return Column(
                    children: [
                      InkWell(
                        onTap: () => _openWorkerDetail(m),
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
                                        ? '${tr("debt").split(":")[0]}: ${formatUzsToDisplay(balance)}'
                                        : tr('accounting'),
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
                      ),
                      if (_project.role == 'owner')
                        Padding(
                          padding: const EdgeInsets.fromLTRB(14, 0, 14, 8),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                            decoration: BoxDecoration(
                              color: m.canViewOwnerTransactions
                                  ? AppColors.accent.withValues(alpha: 0.08)
                                  : AppColors.bg,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: m.canViewOwnerTransactions
                                    ? AppColors.accent.withValues(alpha: 0.3)
                                    : AppColors.border,
                              ),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  Icons.visibility_outlined,
                                  size: 16,
                                  color: m.canViewOwnerTransactions ? AppColors.accent : AppColors.muted,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    tr('allow_view_my_transactions'),
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w600,
                                      color: m.canViewOwnerTransactions ? AppColors.accent : AppColors.text2,
                                    ),
                                  ),
                                ),
                                Switch(
                                  value: m.canViewOwnerTransactions,
                                  activeColor: AppColors.accent,
                                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                  onChanged: (val) async {
                                    AppHaptics.selection();
                                    final updatedList = _members.map((mem) {
                                      if (mem.userId == m.userId) {
                                        return mem.copyWith(canViewOwnerTransactions: val);
                                      }
                                      return mem;
                                    }).toList();
                                    setState(() => _members = updatedList);
                                    await MemberRepository().updateCanViewOwnerTransactions(
                                      obId: _project.id,
                                      userId: m.userId,
                                      canView: val,
                                      currentRole: m.role,
                                    );
                                  },
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  );
                },
              ),
      ),
    ]);
  }

  Widget _buildFilesTab() {
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            TextButton.icon(
              onPressed: _uploadImageFromGallery,
              icon: const Icon(Icons.add_a_photo_outlined, size: 16),
              label: Text(tr('upload_image'), style: const TextStyle(fontSize: 12)),
              style: TextButton.styleFrom(foregroundColor: AppColors.accent),
            ),
            const SizedBox(width: 4),
            TextButton.icon(
              onPressed: _uploadFile,
              icon: const Icon(Icons.upload_file_outlined, size: 16),
              label: Text(tr('upload_file'), style: const TextStyle(fontSize: 12)),
              style: TextButton.styleFrom(foregroundColor: AppColors.accent),
            ),
          ],
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
                            size: 44, color: AppColors.muted),
                        const SizedBox(height: 10),
                        Text(tr('no_files'),
                            style: const TextStyle(
                                color: AppColors.muted, fontSize: 14)),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            OutlinedButton.icon(
                              onPressed: _uploadImageFromGallery,
                              icon: const Icon(Icons.add_a_photo_rounded, size: 18),
                              label: Text(tr('upload_image')),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: AppColors.accent,
                                side: const BorderSide(color: AppColors.accent),
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                              ),
                            ),
                            const SizedBox(width: 10),
                            ElevatedButton.icon(
                              onPressed: _uploadFile,
                              icon: const Icon(Icons.upload_file_rounded, size: 18),
                              label: Text(tr('upload_file')),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.accent,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                elevation: 0,
                              ),
                            ),
                          ],
                        ),
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
                            content: Text(appLocaleNotifier.value == 'ru'
                                ? 'Файл ${f.name} будет удален из хранилища.'
                                : "${f.name} xotiradan o'chiriladi."),
                            actions: [
                              TextButton(
                                  onPressed: () => Navigator.of(ctx).pop(false),
                                  child: Text(tr('cancel'))),
                              ElevatedButton(
                                  style: ElevatedButton.styleFrom(
                                      backgroundColor: AppColors.red,
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 18, vertical: 10)),
                                  onPressed: () => Navigator.of(ctx).pop(true),
                                  child: Text(tr('delete'))),
                            ],
                          ),
                        ),
                        onDismissed: (_) async {
                          AppHaptics.delete();
                          try {
                            await _filesRepo.deleteFile(f.path);
                            setState(() =>
                                _files.removeWhere((x) => x.path == f.path));
                          } catch (e) {
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text('Xato: $e')));
                            }
                          }
                        },
                        child: InkWell(
                          onTap: () => _openFile(f),
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
                                    const SizedBox(height: 2),
                                    Text(
                                      f.originalName != f.name
                                          ? '${tr('original_file_name')}: ${f.originalName}${f.sizeBytes != null ? ' • ${_formatSize(f.sizeBytes!)}' : ''}'
                                          : (f.sizeBytes != null ? _formatSize(f.sizeBytes!) : ''),
                                      style: const TextStyle(
                                          fontSize: 11,
                                          color: AppColors.muted),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ])),
                              IconButton(
                                icon: const Icon(Icons.delete_outline_rounded,
                                    size: 20, color: AppColors.red),
                                tooltip: tr('delete'),
                                onPressed: () => _confirmAndDeleteFile(f),
                              ),
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
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AppColors.accent : AppColors.card,
          borderRadius: BorderRadius.circular(24),
          border:
              Border.all(color: selected ? AppColors.accent : AppColors.border, width: 1.2),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: selected ? Colors.white : AppColors.text2,
          ),
        ),
      ),
    );
  }
}
