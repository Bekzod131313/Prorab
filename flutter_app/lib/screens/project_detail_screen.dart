import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';

import '../data/budget_repository.dart';
import '../data/category_repository.dart';
import '../data/notes_repository.dart';
import '../data/templates_repository.dart';
import '../data/material_repository.dart';
import '../data/member_repository.dart';
import '../data/project_repository.dart';
import '../data/task_repository.dart';
import '../data/transaction_repository.dart';
import '../data/worker_repository.dart';
import '../main.dart';
import '../widgets/add_member_sheet.dart';
import '../models/material.dart';
import '../models/member.dart';
import '../models/project.dart';
import '../models/task.dart';
import '../models/transaction.dart';
import '../theme/app_theme.dart';
import '../widgets/material_row.dart';
import '../widgets/member_row.dart' show MemberRow, colorForName;
import '../widgets/project_card.dart' show colorForProject, formatMoney;
import '../widgets/task_row.dart';
import '../widgets/transaction_row.dart';

class ProjectDetailScreen extends StatefulWidget {
  final Project project;
  final bool? quickAddIncome;

  const ProjectDetailScreen({super.key, required this.project, this.quickAddIncome});

  @override
  State<ProjectDetailScreen> createState() => _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends State<ProjectDetailScreen> {
  final _repo = TransactionRepository();
  final _memberRepo = MemberRepository();
  final _projectRepo = ProjectRepository();
  final _taskRepo = TaskRepository();
  final _materialRepo = MaterialRepository();
  final _workerRepo = WorkerRepository();
  final _budgetRepo = BudgetRepository();
  final _notesRepo = NotesRepository();
  late Project _project;
  List<ProjectTransaction> _txs = [];
  List<ObMember> _members = [];
  List<ObTask> _tasks = [];
  List<ObMaterial> _materials = [];
  List<ProjectNote> _notes = [];
  Map<String, num> _budgets = {};
  String? _tasksError;
  String? _materialsError;
  bool _loading = true;
  String? _error;
  String _txFilter = 'all';
  String _txSearch = '';
  bool _showTxSearch = false;
  String _taskFilter = 'all';

  @override
  void initState() {
    super.initState();
    _project = widget.project;
    _load();
    if (widget.quickAddIncome != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _openAddTransaction(initialIsIncome: widget.quickAddIncome!);
      });
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        _repo.loadForProject(_project.id),
        _memberRepo.loadForProject(_project.id),
        _projectRepo.loadProjectById(_project.id),
      ]);
      final txs = results[0] as List<ProjectTransaction>;
      final members = results[1] as List<ObMember>;
      final refreshed = results[2] as Project?;
      if (!mounted) return;
      setState(() {
        _txs = txs;
        _members = members;
        if (refreshed != null) _project = refreshed;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }

    try {
      _tasks = await _taskRepo.loadForProject(_project.id);
      _tasksError = null;
    } catch (e) {
      _tasksError = e.toString();
    }
    try {
      _materials = await _materialRepo.loadForProject(_project.id);
      _materialsError = null;
    } catch (e) {
      _materialsError = e.toString();
    }
    try {
      _budgets = await _budgetRepo.loadBudgets(_project.id);
    } catch (_) {}
    try {
      _notes = await _notesRepo.load(_project.id);
    } catch (_) {}
    if (mounted) setState(() {});
  }

  List<ObMember> get _visibleMembers {
    final userId = supabase.auth.currentUser?.id;
    if (_project.role == 'owner') {
      return _members.where((m) => m.role == 'member').toList();
    }
    return _members.where((m) => m.addedBy == userId).toList();
  }

  List<ProjectTransaction> get _visibleTxs {
    final userId = supabase.auth.currentUser?.id;
    List<ProjectTransaction> base;
    if (_project.role == 'owner') {
      base = _txs
          .where((tx) =>
              tx.tur == 'income' ||
              ((tx.tur == 'send' || tx.tur == 'spend' || tx.tur == 'ishhaqi') && tx.fromUser == userId))
          .toList();
    } else {
      base = _txs.where((tx) => tx.fromUser == userId || tx.toUser == userId).toList();
    }
    List<ProjectTransaction> filtered;
    switch (_txFilter) {
      case 'income':
        filtered = base.where((tx) => tx.isIncomeFor(userId ?? '')).toList();
        break;
      case 'expense':
        filtered = base.where((tx) => tx.isExpenseFor(userId ?? '')).toList();
        break;
      default:
        filtered = base;
    }
    if (_txSearch.isNotEmpty) {
      final q = _txSearch.toLowerCase();
      filtered = filtered.where((tx) =>
          (tx.izoh ?? '').toLowerCase().contains(q) ||
          (tx.kategoriya ?? '').toLowerCase().contains(q) ||
          tx.summa.toString().contains(q)).toList();
    }
    return filtered;
  }

  Future<void> _openAddMember() async {
    final phoneCtrl = TextEditingController(text: '+998');
    final kasbCtrl = TextEditingController();

    final result = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom,
        ),
        child: AddMemberSheet(phoneCtrl: phoneCtrl, kasbCtrl: kasbCtrl),
      ),
    );

    if (result == true) {
      try {
        await _memberRepo.addMember(
          obId: _project.id,
          phone: phoneCtrl.text.trim(),
          kasb: kasbCtrl.text.trim(),
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Qo'shildi")),
        );
        _load();
      } catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    }
  }

  Future<void> _openAddTransaction({bool initialIsIncome = true}) async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom,
        ),
        child: _AddTransactionSheet(members: _visibleMembers, initialIsIncome: initialIsIncome),
      ),
    );

    if (result == null) return;

    try {
      await _repo.addTransaction(
        obId: _project.id,
        isIncome: result['isIncome'] as bool,
        amount: result['amount'] as num,
        kategoriya: result['kategoriya'] as String,
        izoh: result['izoh'] as String?,
        toUserId: result['toUserId'] as String?,
        txDate: result['txDate'] as DateTime?,
      );
      HapticFeedback.mediumImpact();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saqlandi')),
      );
      _load();
    } catch (e) {
      HapticFeedback.heavyImpact();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    }
  }

  Future<void> _openTxDetail(ProjectTransaction tx) async {
    final userId = supabase.auth.currentUser?.id;
    final canDelete = tx.fromUser == userId || _project.role == 'owner';
    final isIn = tx.isIncomeFor(userId ?? '');
    final dateStr = DateFormat('dd.MM.yyyy HH:mm').format(tx.date);

    final delete = await showModalBottomSheet<dynamic>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Text(
                '${isIn ? '+' : '-'}${formatMoney(tx.summa)} so\'m',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w900,
                  color: isIn ? const Color(0xFF16A34A) : const Color(0xFFEF4444),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Center(child: Text(dateStr, style: const TextStyle(color: AppColors.muted))),
            const SizedBox(height: 16),
            if (tx.tur == 'send' || tx.tur == 'ishhaqi') ...[
              Builder(builder: (_) {
                final fromM = _members.where((m) => m.userId == tx.fromUser).firstOrNull;
                final toM = _members.where((m) => m.userId == tx.toUser).firstOrNull;
                return Column(
                  children: [
                    if (fromM != null)
                      _TxDetailRow(label: 'Kimdan', value: fromM.displayName),
                    if (toM != null)
                      _TxDetailRow(label: 'Kimga', value: toM.displayName),
                  ],
                );
              }),
            ],
            if (tx.kategoriya?.isNotEmpty == true && tx.tur != 'send' && tx.tur != 'ishhaqi')
              _TxDetailRow(label: 'Kategoriya', value: tx.kategoriya!),
            if (tx.izoh?.isNotEmpty == true)
              _TxDetailRow(label: 'Izoh', value: tx.izoh!),
            const SizedBox(height: 20),
            OutlinedButton.icon(
              onPressed: () => Navigator.of(ctx).pop('share'),
              icon: const Icon(Icons.ios_share_rounded, size: 16),
              label: const Text("Ulashish"),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
            if (canDelete) ...[
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () => Navigator.of(ctx).pop('edit'),
                icon: const Icon(Icons.edit_outlined, size: 16),
                label: const Text("Tahrirlash"),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: () => Navigator.of(ctx).pop('delete'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.redAccent,
                  side: const BorderSide(color: Colors.redAccent),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: const Text("O'chirish"),
              ),
            ],
          ],
        ),
      ),
    );

    if (delete == 'share') {
      final fromM = _members.where((m) => m.userId == tx.fromUser).firstOrNull;
      final toM = _members.where((m) => m.userId == tx.toUser).firstOrNull;
      final turLabel = {'income': 'Kirim', 'spend': 'Chiqim', 'send': 'Avans', 'ishhaqi': 'Ish haqi'}[tx.tur] ?? tx.tur;
      final lines = [
        '📋 ${_project.nomi} — $turLabel',
        '💰 ${isIn ? '+' : '-'}${formatMoney(tx.summa)} so\'m',
        '📅 $dateStr',
        if (fromM != null) '👤 Kimdan: ${fromM.displayName}',
        if (toM != null) '👤 Kimga: ${toM.displayName}',
        if (tx.kategoriya?.isNotEmpty == true && tx.tur != 'send' && tx.tur != 'ishhaqi') '🏷 ${tx.kategoriya}',
        if (tx.izoh?.isNotEmpty == true) '📝 ${tx.izoh}',
        '',
        '#moliya #hisobot',
      ];
      await Share.share(lines.join('\n'));
    } else if (delete == 'edit') {
      final noteCtrl = TextEditingController(text: tx.izoh ?? '');
      DateTime editDate = tx.date;

      final saved = await showModalBottomSheet<bool>(
        context: context,
        backgroundColor: AppColors.card,
        isScrollControlled: true,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
        builder: (ctx) => StatefulBuilder(
          builder: (ctx, setSS) => Padding(
            padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Operatsiyani tahrirlash', style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text('Faqat izoh va sana o\'zgartiriladi', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                const SizedBox(height: 16),
                TextField(controller: noteCtrl, decoration: const InputDecoration(hintText: 'Izoh...')),
                const SizedBox(height: 12),
                InkWell(
                  onTap: () async {
                    final picked = await showDatePicker(context: ctx, initialDate: editDate, firstDate: DateTime(2020), lastDate: DateTime.now().add(const Duration(days: 1)));
                    if (picked != null) setSS(() => editDate = picked);
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                    decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(14)),
                    child: Row(
                      children: [
                        const Icon(Icons.calendar_today_outlined, size: 18, color: AppColors.muted),
                        const SizedBox(width: 10),
                        Text(DateFormat('dd.MM.yyyy').format(editDate), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                ElevatedButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Saqlash')),
              ],
            ),
          ),
        ),
      );
      if (saved == true) {
        await _repo.updateTransactionNote(tx.id, izoh: noteCtrl.text.trim(), txDate: editDate);
        _load();
      }
    } else if (delete == 'delete') {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text("O'chirishni tasdiqlang"),
          content: const Text("Bu amal moliyaviy hisobotlarga ta'sir qiladi. Davom etasizmi?"),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text("Bekor")),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              style: TextButton.styleFrom(foregroundColor: Colors.redAccent),
              child: const Text("O'chir"),
            ),
          ],
        ),
      );
      if (confirm == true) {
        await _repo.deleteTransaction(tx.id);
        _load();
      }
    }
  }

  Future<void> _openMemberDetail(ObMember member) async {
    final memberTxs = _txs.where((t) => t.fromUser == member.userId || t.toUser == member.userId).toList();
    final canSend = (_project.role == 'owner' && member.role == 'member') ||
        (_project.role == 'member' && member.role == 'worker');

    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        minChildSize: 0.4,
        maxChildSize: 0.9,
        expand: false,
        builder: (ctx, scrollCtrl) => ListView(
          controller: scrollCtrl,
          padding: const EdgeInsets.all(20),
          children: [
            Row(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: colorForName(member.displayName),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    member.displayName.isNotEmpty ? member.displayName[0].toUpperCase() : '?',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 22),
                  ),
                ),
                const SizedBox(width: 14),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(member.displayName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Text(
                      member.kasb?.isNotEmpty == true ? member.kasb! : member.roleLabel,
                      style: const TextStyle(color: AppColors.text2),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                    decoration: BoxDecoration(
                      color: AppColors.bg,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('ISH HAQI', style: TextStyle(fontSize: 10, color: AppColors.muted, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                        const SizedBox(height: 4),
                        Text(formatMoney(member.ishaqi), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Color(0xFF16A34A))),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                    decoration: BoxDecoration(
                      color: AppColors.bg,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('OLINGAN', style: TextStyle(fontSize: 10, color: AppColors.muted, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                        const SizedBox(height: 4),
                        Text(formatMoney(member.olingan), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Color(0xFFF59E0B))),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                    decoration: BoxDecoration(
                      color: AppColors.bg,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('BALANS', style: TextStyle(fontSize: 10, color: AppColors.muted, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                        const SizedBox(height: 4),
                        Text(
                          '${member.balance >= 0 ? '+' : ''}${formatMoney(member.balance)}',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w900,
                            color: member.balance >= 0 ? const Color(0xFF16A34A) : const Color(0xFFEF4444),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            if (canSend) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => Navigator.of(ctx).pop('send'),
                      icon: const Icon(Icons.send_rounded, size: 18),
                      label: const Text('Avans'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => Navigator.of(ctx).pop('ishhaqi'),
                      icon: const Icon(Icons.payments_outlined, size: 18),
                      label: const Text('Ish haqi'),
                    ),
                  ),
                ],
              ),
            ],
            if (_project.role == 'owner') ...[
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () => Navigator.of(ctx).pop('editKasb'),
                icon: const Icon(Icons.edit_outlined, size: 16),
                label: const Text("Kasbini tahrirlash"),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: () => Navigator.of(ctx).pop('remove'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.redAccent,
                  side: const BorderSide(color: Colors.redAccent),
                ),
                child: const Text("Loyihadan chiqarish"),
              ),
            ],
            const SizedBox(height: 20),
            Text(
              'Operatsiyalar',
              style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 10),
            if (memberTxs.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(child: Text("Operatsiyalar yo'q", style: TextStyle(color: AppColors.muted))),
              )
            else
              ...memberTxs.map((tx) => TransactionRow(
                    tx: tx,
                    onTap: () {
                      Navigator.of(ctx).pop(null);
                      _openTxDetail(tx);
                    },
                  )),
          ],
        ),
      ),
    );

    if (action == 'send') {
      await _openSendMoney(member);
    } else if (action == 'ishhaqi') {
      await _openRecordIshHaqi(member);
    } else if (action == 'editKasb') {
      final kasbCtrl = TextEditingController(text: member.kasb ?? '');
      final saved = await showModalBottomSheet<bool>(
        context: context,
        backgroundColor: AppColors.card,
        isScrollControlled: true,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
        builder: (ctx) => Padding(
          padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('${member.displayName}: kasb', style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 16),
              TextField(controller: kasbCtrl, decoration: const InputDecoration(hintText: 'Kasb (masalan: Usta, Qorovul...)')),
              const SizedBox(height: 20),
              ElevatedButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Saqlash')),
            ],
          ),
        ),
      );
      if (saved == true) {
        await _memberRepo.updateKasb(obId: _project.id, userId: member.userId, kasb: kasbCtrl.text.trim());
        _load();
      }
    } else if (action == 'remove') {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text("Loyihadan chiqarish"),
          content: Text("${member.displayName}ni loyihadan chiqarasizmi?"),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text("Yo'q")),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              style: TextButton.styleFrom(foregroundColor: Colors.redAccent),
              child: const Text("Ha, chiqar"),
            ),
          ],
        ),
      );
      if (confirm == true) {
        await _memberRepo.removeMember(obId: _project.id, userId: member.userId);
        _load();
      }
    }
  }

  Future<void> _openSendMoney(ObMember member) async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom,
        ),
        child: _SendMoneySheet(member: member),
      ),
    );

    if (result == null) return;

    try {
      await _repo.addTransaction(
        obId: _project.id,
        isIncome: false,
        amount: result['amount'] as num,
        kategoriya: 'ishchi',
        izoh: result['izoh'] as String?,
        toUserId: member.userId,
        txDate: result['txDate'] as DateTime?,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saqlandi')),
      );
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    }
  }

  Future<void> _openRecordIshHaqi(ObMember member) async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom,
        ),
        child: _SendMoneySheet(member: member, title: 'Ish haqi yozish'),
      ),
    );

    if (result == null) return;

    try {
      await _workerRepo.giveIshHaqi(
        obId: _project.id,
        toUserId: member.userId,
        amount: result['amount'] as num,
        izoh: result['izoh'] as String?,
        txDate: result['txDate'] as DateTime?,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saqlandi')),
      );
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    }
  }

  Future<void> _openAddTask() async {
    final ctrl = TextEditingController();
    DateTime? muddat;

    final result = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                "Yangi vazifa",
                style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: ctrl,
                decoration: const InputDecoration(hintText: 'Vazifa nomi'),
              ),
              const SizedBox(height: 12),
              InkWell(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: ctx,
                    initialDate: muddat ?? DateTime.now().add(const Duration(days: 1)),
                    firstDate: DateTime.now(),
                    lastDate: DateTime(2100),
                  );
                  setSheetState(() => muddat = picked);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                  decoration: BoxDecoration(
                    border: Border.all(color: AppColors.border),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.event_outlined, size: 18, color: AppColors.muted),
                      const SizedBox(width: 10),
                      Text(
                        muddat != null ? DateFormat('dd.MM.yyyy').format(muddat!) : 'Muddat (ixtiyoriy)',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: muddat != null ? AppColors.text : AppColors.muted,
                        ),
                      ),
                      if (muddat != null) ...[
                        const Spacer(),
                        GestureDetector(
                          onTap: () => setSheetState(() => muddat = null),
                          child: const Icon(Icons.close, size: 16, color: AppColors.muted),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: () {
                  final name = ctrl.text.trim();
                  if (name.isEmpty) return;
                  Navigator.of(ctx).pop(name);
                },
                child: const Text("Qo'shish"),
              ),
            ],
          ),
        ),
      ),
    );

    if (result != null) {
      await _taskRepo.addTask(_project.id, result, muddat: muddat);
      _load();
    }
  }

  Future<void> _toggleTask(ObTask task) async {
    HapticFeedback.lightImpact();
    await _taskRepo.toggleTask(task.id, task.holat);
    _load();
  }

  Future<void> _openTaskMenu(ObTask task) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(task.nomi, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(task.statusLabel, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
            const SizedBox(height: 16),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.refresh_rounded, color: AppColors.accentTeal),
              title: const Text('Holatini o\'zgartirish'),
              onTap: () => Navigator.of(ctx).pop('toggle'),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.edit_outlined, color: AppColors.accent),
              title: const Text('Tahrirlash'),
              onTap: () => Navigator.of(ctx).pop('edit'),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.delete_outline_rounded, color: Colors.redAccent),
              title: const Text('O\'chirish', style: TextStyle(color: Colors.redAccent)),
              onTap: () => Navigator.of(ctx).pop('delete'),
            ),
          ],
        ),
      ),
    );

    if (action == 'toggle') {
      await _toggleTask(task);
    } else if (action == 'edit') {
      final ctrl = TextEditingController(text: task.nomi);
      DateTime? muddat = task.muddat;
      bool clearMuddat = false;

      final saved = await showModalBottomSheet<bool>(
        context: context,
        backgroundColor: AppColors.card,
        isScrollControlled: true,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
        builder: (ctx) => StatefulBuilder(
          builder: (ctx, setSheetState) => Padding(
            padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Vazifani tahrirlash', style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 16),
                TextField(controller: ctrl, decoration: const InputDecoration(hintText: 'Vazifa nomi')),
                const SizedBox(height: 12),
                InkWell(
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: ctx,
                      initialDate: muddat ?? DateTime.now().add(const Duration(days: 1)),
                      firstDate: DateTime.now().subtract(const Duration(days: 365)),
                      lastDate: DateTime(2100),
                    );
                    setSheetState(() { muddat = picked; clearMuddat = picked == null; });
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                    decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(14)),
                    child: Row(
                      children: [
                        const Icon(Icons.event_outlined, size: 18, color: AppColors.muted),
                        const SizedBox(width: 10),
                        Text(
                          muddat != null ? DateFormat('dd.MM.yyyy').format(muddat!) : 'Muddat (ixtiyoriy)',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: muddat != null ? AppColors.text : AppColors.muted),
                        ),
                        if (muddat != null) ...[
                          const Spacer(),
                          GestureDetector(
                            onTap: () => setSheetState(() { muddat = null; clearMuddat = true; }),
                            child: const Icon(Icons.close, size: 16, color: AppColors.muted),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: () { if (ctrl.text.trim().isEmpty) return; Navigator.of(ctx).pop(true); },
                  child: const Text('Saqlash'),
                ),
              ],
            ),
          ),
        ),
      );
      if (saved == true) {
        await _taskRepo.updateTask(task.id, nomi: ctrl.text.trim(), muddat: muddat, clearMuddat: clearMuddat);
        _load();
      }
    } else if (action == 'delete') {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text("Vazifani o'chirish"),
          content: Text("'${task.nomi}' vazifasini o'chirasizmi?"),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text("Yo'q")),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              style: TextButton.styleFrom(foregroundColor: Colors.redAccent),
              child: const Text("Ha, o'chir"),
            ),
          ],
        ),
      );
      if (confirm == true) {
        await _taskRepo.deleteTask(task.id);
        _load();
      }
    }
  }

  Future<void> _openMaterialDetail(ObMaterial material) async {
    const statuses = ['kerak', 'buyurtma', 'yetkazildi'];
    const statusLabels = {'kerak': 'Kerak', 'buyurtma': 'Buyurtma', 'yetkazildi': 'Yetkazildi'};
    const statusColors = {
      'kerak': Color(0xFFF43F5E),
      'buyurtma': Color(0xFFF59E0B),
      'yetkazildi': Color(0xFF22C55E),
    };

    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(material.nomi, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text('${material.miqdor} ${material.birlik}', style: const TextStyle(color: AppColors.muted)),
            const SizedBox(height: 16),
            const Text('Holati:', style: TextStyle(color: AppColors.text2, fontSize: 13, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            ...statuses.map((s) {
              final isActive = material.holat == s;
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: InkWell(
                  onTap: () => Navigator.of(ctx).pop(s),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: isActive ? (statusColors[s] ?? AppColors.accent).withOpacity(0.15) : AppColors.bg,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isActive ? (statusColors[s] ?? AppColors.accent) : AppColors.border,
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: statusColors[s] ?? AppColors.muted,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          statusLabels[s] ?? s,
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: isActive ? (statusColors[s] ?? AppColors.accent) : AppColors.text,
                          ),
                        ),
                        if (isActive) ...[
                          const Spacer(),
                          const Icon(Icons.check_rounded, size: 16, color: AppColors.accentTeal),
                        ],
                      ],
                    ),
                  ),
                ),
              );
            }),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => Navigator.of(ctx).pop('__edit__'),
              icon: const Icon(Icons.edit_outlined, size: 16),
              label: const Text("Tahrirlash"),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () => Navigator.of(ctx).pop('__delete__'),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.redAccent,
                side: const BorderSide(color: Colors.redAccent),
              ),
              child: const Text("O'chirish"),
            ),
          ],
        ),
      ),
    );

    if (action == null) return;
    if (action == '__delete__') {
      await _materialRepo.deleteMaterial(material.id);
      _load();
    } else if (action == '__edit__') {
      final nameCtrl = TextEditingController(text: material.nomi);
      final qtyCtrl = TextEditingController(text: material.miqdor.toString());
      final unitCtrl = TextEditingController(text: material.birlik);
      final narxCtrl = TextEditingController(text: material.narx != null ? material.narx.toString() : '');

      final saved = await showModalBottomSheet<bool>(
        context: context,
        backgroundColor: AppColors.card,
        isScrollControlled: true,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
        builder: (ctx) => Padding(
          padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Materialni tahrirlash', style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 16),
              TextField(controller: nameCtrl, decoration: const InputDecoration(hintText: 'Material nomi')),
              const SizedBox(height: 12),
              TextField(controller: qtyCtrl, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(hintText: 'Miqdor')),
              const SizedBox(height: 12),
              TextField(controller: unitCtrl, decoration: const InputDecoration(hintText: 'Birlik (kg, dona...)')),
              const SizedBox(height: 12),
              TextField(controller: narxCtrl, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(hintText: 'Narx (ixtiyoriy)')),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: () { if (nameCtrl.text.trim().isEmpty) return; Navigator.of(ctx).pop(true); },
                child: const Text('Saqlash'),
              ),
            ],
          ),
        ),
      );
      if (saved == true) {
        await _materialRepo.updateMaterial(
          material.id,
          nomi: nameCtrl.text.trim(),
          miqdor: num.tryParse(qtyCtrl.text.trim()) ?? material.miqdor,
          birlik: unitCtrl.text.trim().isNotEmpty ? unitCtrl.text.trim() : material.birlik,
          narx: num.tryParse(narxCtrl.text.trim()),
        );
        _load();
      }
    } else if (action != material.holat) {
      await _materialRepo.updateStatus(material.id, action);
      _load();
    }
  }

  Future<void> _openAddMaterial() async {
    final nameCtrl = TextEditingController();
    final qtyCtrl = TextEditingController();
    final unitCtrl = TextEditingController();
    final narxCtrl = TextEditingController();

    final result = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Yangi material',
              style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: nameCtrl,
              decoration: const InputDecoration(hintText: 'Material nomi'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: qtyCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(hintText: 'Miqdor'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: unitCtrl,
              decoration: const InputDecoration(hintText: 'Birlik (kg, dona...)'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: narxCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(hintText: 'Narx (ixtiyoriy)'),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () {
                if (nameCtrl.text.trim().isEmpty) return;
                Navigator.of(ctx).pop(true);
              },
              child: const Text("Qo'shish"),
            ),
          ],
        ),
      ),
    );

    if (result == true) {
      await _materialRepo.addMaterial(
        obId: _project.id,
        nomi: nameCtrl.text.trim(),
        miqdor: num.tryParse(qtyCtrl.text.trim()) ?? 0,
        birlik: unitCtrl.text.trim(),
        narx: num.tryParse(narxCtrl.text.trim()),
      );
      _load();
    }
  }

  Future<void> _openEditProject() async {
    final nameCtrl = TextEditingController(text: _project.nomi);
    final daysCtrl = TextEditingController(text: _project.muddat.toString());
    final manzilCtrl = TextEditingController(text: _project.manzil ?? '');
    final mijozCtrl = TextEditingController(text: _project.mijoz ?? '');
    final bosqichCtrl = TextEditingController(text: _project.bosqich ?? '');
    DateTime startDate = _project.boshlanish ?? DateTime.now();
    bool isDone = _project.status == 'done';

    final saved = await showModalBottomSheet<dynamic>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Obyektni tahrirlash',
                style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(hintText: 'Obyekt nomi'),
              ),
              const SizedBox(height: 12),
              InkWell(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: ctx,
                    initialDate: startDate,
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2100),
                  );
                  if (picked != null) setSheetState(() => startDate = picked);
                },
                child: InputDecorator(
                  decoration: const InputDecoration(labelText: 'Boshlanish sanasi'),
                  child: Text(
                    '${startDate.year}-${startDate.month.toString().padLeft(2, '0')}-${startDate.day.toString().padLeft(2, '0')}',
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: daysCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(hintText: 'Muddat (kun)'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: manzilCtrl,
                decoration: const InputDecoration(hintText: 'Manzil (ixtiyoriy)'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: mijozCtrl,
                decoration: const InputDecoration(hintText: 'Mijoz (ixtiyoriy)'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: bosqichCtrl,
                decoration: const InputDecoration(hintText: 'Bosqich (ixtiyoriy, masalan: Poydevor)'),
              ),
              const SizedBox(height: 12),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Loyiha yakunlandi'),
                value: isDone,
                activeColor: AppColors.accent,
                onChanged: (v) => setSheetState(() => isDone = v),
              ),
              const SizedBox(height: 8),
              ElevatedButton(
                onPressed: () {
                  if (nameCtrl.text.trim().isEmpty) return;
                  Navigator.of(ctx).pop(true);
                },
                child: const Text('Saqlash'),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: () => Navigator.of(ctx).pop('delete'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.redAccent,
                  side: const BorderSide(color: Colors.redAccent),
                ),
                child: const Text("Loyihani o'chirish"),
              ),
            ],
          ),
        ),
      ),
    );

    if (saved == 'delete') {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text("Loyihani o'chirish"),
          content: Text("'${_project.nomi}' loyihasini barcha ma'lumotlari bilan birga o'chirasizmi? Bu amalni qaytarib bo'lmaydi."),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text("Bekor")),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              style: TextButton.styleFrom(foregroundColor: Colors.redAccent),
              child: const Text("Ha, o'chir"),
            ),
          ],
        ),
      );
      if (confirm == true && mounted) {
        await _projectRepo.deleteProject(_project.id);
        if (mounted) Navigator.of(context).pop();
      }
      return;
    }

    if (saved == true) {
      final days = int.tryParse(daysCtrl.text.trim()) ?? _project.muddat;
      final nomi = nameCtrl.text.trim();
      final manzil = manzilCtrl.text.trim();
      final mijoz = mijozCtrl.text.trim();
      final bosqich = bosqichCtrl.text.trim();
      final status = isDone ? 'done' : 'active';
      await _projectRepo.updateProject(
        id: _project.id,
        nomi: nomi,
        boshlanish: startDate,
        muddat: days,
        manzil: manzil,
        mijoz: mijoz,
        bosqich: bosqich,
      );
      if (status != _project.status) {
        await _projectRepo.setStatus(_project.id, status);
      }
      if (!mounted) return;
      setState(() {
        _project = Project(
          id: _project.id,
          nomi: nomi,
          kirim: _project.kirim,
          chiqim: _project.chiqim,
          boshlanish: startDate,
          createdAt: _project.createdAt,
          muddat: days,
          role: _project.role,
          myBalance: _project.myBalance,
          ishaqi: _project.ishaqi,
          olingan: _project.olingan,
          status: status,
          manzil: manzil.isEmpty ? null : manzil,
          mijoz: mijoz.isEmpty ? null : mijoz,
          bosqich: bosqich.isEmpty ? null : bosqich,
        );
      });
    }
  }

  Future<void> _openAddNote() async {
    final ctrl = TextEditingController();
    final saved = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Eslatma qo\'shish', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              autofocus: true,
              maxLines: 4,
              decoration: const InputDecoration(hintText: 'Eslatma matni...'),
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Saqlash'),
            ),
          ],
        ),
      ),
    );
    final text = ctrl.text.trim();
    ctrl.dispose();
    if (saved == true && text.isNotEmpty) {
      await _notesRepo.add(_project.id, text);
      final notes = await _notesRepo.load(_project.id);
      if (!mounted) return;
      setState(() => _notes = notes);
    }
  }

  Future<void> _deleteNote(String noteId) async {
    await _notesRepo.delete(_project.id, noteId);
    final notes = await _notesRepo.load(_project.id);
    if (!mounted) return;
    setState(() => _notes = notes);
  }

  Future<void> _openBudgetSheet(List<String> categories) async {
    final controllers = {for (final cat in categories) cat: TextEditingController(text: _budgets[cat]?.toStringAsFixed(0) ?? '')};
    await showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Smeta (byudjet limiti)', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 4),
            const Text('Har bir kategoriya uchun chiqim limitini belgilang', style: TextStyle(fontSize: 12, color: AppColors.muted)),
            const SizedBox(height: 16),
            for (final cat in categories) ...[
              Text(cat, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              TextField(
                controller: controllers[cat],
                keyboardType: TextInputType.number,
                decoration: InputDecoration(hintText: 'Limit ($cat)', suffixText: "so'm"),
              ),
              const SizedBox(height: 10),
            ],
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: () async {
                for (final cat in categories) {
                  final val = num.tryParse(controllers[cat]?.text.replaceAll(' ', '') ?? '') ?? 0;
                  await _budgetRepo.setBudget(_project.id, cat, val);
                }
                if (!mounted) return;
                Navigator.of(ctx).pop();
                final budgets = await _budgetRepo.loadBudgets(_project.id);
                if (!mounted) return;
                setState(() => _budgets = budgets);
              },
              child: const Text('Saqlash'),
            ),
          ],
        ),
      ),
    );
    for (final c in controllers.values) c.dispose();
  }

  Future<void> _shareProjectSummary() async {
    final df = DateFormat('dd.MM.yyyy');
    final start = _project.boshlanish ?? _project.createdAt;
    final done = _tasks.where((t) => t.holat == 'done').length;
    final lines = [
      '📊 Loyiha hisoboti',
      '🏗 ${_project.nomi}',
      if (_project.manzil?.isNotEmpty == true) '📍 ${_project.manzil}',
      if (_project.mijoz?.isNotEmpty == true) '👤 Mijoz: ${_project.mijoz}',
      '📅 ${df.format(start)}',
      if (_project.bosqich?.isNotEmpty == true) '🔖 Bosqich: ${_project.bosqich}',
      '',
      '💰 Kirim: +${formatMoney(_project.kirim)} so\'m',
      '💸 Chiqim: -${formatMoney(_project.chiqim)} so\'m',
      '📈 Foyda: ${_project.balance >= 0 ? '+' : ''}${formatMoney(_project.balance)} so\'m',
      '',
      if (_tasks.isNotEmpty) '✅ Vazifalar: $done/${_tasks.length} bajarildi',
      if (_members.isNotEmpty) '👷 Ishchilar: ${_members.where((m) => m.role != 'owner').length} kishi',
      '',
      '#moliya #hisobot',
    ];
    await Share.share(lines.join('\n'), subject: '${_project.nomi} hisoboti');
  }

  @override
  Widget build(BuildContext context) {
    final project = _project;
    final color = colorForProject(project.nomi);
    final bal = project.balance;
    final balColor = bal >= 0 ? const Color(0xFF16A34A) : const Color(0xFFEF4444);

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Text(project.nomi),
        actions: [
          IconButton(
            icon: const Icon(Icons.ios_share_rounded),
            onPressed: _shareProjectSummary,
          ),
          if (project.role == 'owner')
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              onPressed: _openEditProject,
            ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openAddTransaction,
        child: const Icon(Icons.add_rounded),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: AppColors.gradient,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Text(
                          project.nomi.isNotEmpty ? project.nomi[0].toUpperCase() : '?',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 20),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              project.nomi,
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18),
                            ),
                            if (project.manzil?.isNotEmpty == true || project.mijoz?.isNotEmpty == true)
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text(
                                  [
                                    if (project.manzil?.isNotEmpty == true) project.manzil,
                                    if (project.mijoz?.isNotEmpty == true) project.mijoz,
                                  ].join(' · '),
                                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  const Text('QOLDIQ', style: TextStyle(color: Colors.white70, fontSize: 12, letterSpacing: 1)),
                  const SizedBox(height: 4),
                  Text(
                    '${bal >= 0 ? '+' : ''}${formatMoney(bal)} so\'m',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 26),
                  ),
                  if (project.role == 'owner' && project.kirim > 0) ...[
                    const SizedBox(height: 10),
                    Builder(builder: (_) {
                      final roi = ((project.kirim - project.chiqim) / project.kirim * 100);
                      final roiStr = '${roi >= 0 ? '+' : ''}${roi.toStringAsFixed(1)}%';
                      final start = project.boshlanish ?? project.createdAt;
                      final days = DateTime.now().difference(start).inDays.clamp(1, 9999);
                      final avgDaily = project.chiqim / days;
                      return Row(
                        children: [
                          _MiniStat(label: 'ROI', value: roiStr, positive: roi >= 0),
                          const SizedBox(width: 12),
                          _MiniStat(label: 'KUN/CHIQIM', value: '${formatMoney(avgDaily.round())}', positive: null),
                          const SizedBox(width: 12),
                          _MiniStat(label: 'ISHCHILAR', value: '${_members.where((m) => m.role != 'owner').length}', positive: null),
                        ],
                      );
                    }),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: project.role == 'owner'
                  ? [
                      Expanded(
                        child: _InfoBox(label: 'KIRIM', value: formatMoney(project.kirim), color: const Color(0xFF16A34A)),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _InfoBox(label: 'CHIQIM', value: formatMoney(project.chiqim), color: const Color(0xFFEF4444)),
                      ),
                    ]
                  : [
                      Expanded(
                        child: _InfoBox(label: 'ISHHAQI', value: formatMoney(project.ishaqi), color: const Color(0xFF16A34A)),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _InfoBox(label: 'OLINGAN', value: formatMoney(project.olingan), color: const Color(0xFFF59E0B)),
                      ),
                    ],
            ),
            const SizedBox(height: 16),
            Builder(builder: (context) {
              final (_, left, progress) = project.schedule;
              return Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.card,
                  border: Border.all(color: AppColors.border),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Loyiha progress',
                          style: TextStyle(color: AppColors.text, fontWeight: FontWeight.w800, fontSize: 15),
                        ),
                        Text(
                          '$progress%',
                          style: const TextStyle(color: AppColors.accent, fontWeight: FontWeight.w800, fontSize: 15),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: LinearProgressIndicator(
                        value: progress / 100,
                        minHeight: 10,
                        backgroundColor: AppColors.border,
                        valueColor: const AlwaysStoppedAnimation(AppColors.accent),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '$left kun qoldi',
                          style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w700, fontSize: 12),
                        ),
                        if (project.bosqich?.isNotEmpty == true)
                          Text(
                            project.bosqich!,
                            style: const TextStyle(color: AppColors.accentTeal, fontWeight: FontWeight.w800, fontSize: 12),
                          ),
                      ],
                    ),
                  ],
                ),
              );
            }),
            const SizedBox(height: 16),
            Builder(builder: (context) {
              final start = project.boshlanish ?? project.createdAt;
              final end = start.add(Duration(days: project.muddat == 0 ? 30 : project.muddat));
              final (_, left, _) = project.schedule;
              final workersCount = _members.where((m) => m.role != 'owner').length;
              final df = DateFormat('dd.MM.yyyy');

              return Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.card,
                  border: Border.all(color: AppColors.border),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      "Loyiha ma'lumotlari",
                      style: TextStyle(color: AppColors.text, fontWeight: FontWeight.w800, fontSize: 15),
                    ),
                    const SizedBox(height: 12),
                    GridView.count(
                      crossAxisCount: 2,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      mainAxisSpacing: 10,
                      crossAxisSpacing: 10,
                      childAspectRatio: 2.4,
                      children: [
                        _InfoTile(label: 'BOSHLANISH', value: df.format(start)),
                        _InfoTile(label: 'TUGASH', value: df.format(end)),
                        _InfoTile(label: 'QOLGAN', value: '$left kun'),
                        _InfoTile(label: 'ISHCHILAR', value: '$workersCount ta'),
                        _InfoTile(label: 'MIJOZ', value: project.mijoz?.isNotEmpty == true ? project.mijoz! : '—'),
                        _InfoTile(label: 'BOSQICH', value: project.bosqich?.isNotEmpty == true ? project.bosqich! : '—'),
                        _InfoTile(label: 'VAZIFALAR', value: () {
                          final done = _tasks.where((t) => t.holat == 'done').length;
                          return '${_tasks.length} ta (${done}✓)';
                        }()),
                        _InfoTile(label: 'MATERIALLAR', value: () {
                          final total = _materials.fold<num>(0, (s, m) => s + m.total);
                          return total > 0 ? '${formatMoney(total)} so\'m' : '${_materials.length} ta';
                        }()),
                      ],
                    ),
                    const SizedBox(height: 10),
                    _InfoTile(label: 'MANZIL', value: project.manzil?.isNotEmpty == true ? project.manzil! : '—'),
                  ],
                ),
              );
            }),
            if (_project.role == 'owner' && _txs.isNotEmpty) ...[
              const SizedBox(height: 16),
              Builder(builder: (context) {
                final userId = supabase.auth.currentUser?.id ?? '';
                final catMap = <String, num>{};
                for (final tx in _txs) {
                  if (tx.isExpenseFor(userId)) {
                    final cat = tx.kategoriya?.isNotEmpty == true ? tx.kategoriya! : 'Boshqa';
                    catMap[cat] = (catMap[cat] ?? 0) + tx.summa;
                  }
                }
                if (catMap.isEmpty) return const SizedBox.shrink();
                final entries = catMap.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
                final maxVal = entries.first.value;
                const catColors = [Color(0xFF3B82F6), Color(0xFFF59E0B), Color(0xFFF43F5E), Color(0xFFA855F7), Color(0xFF22C55E), Color(0xFF0891B2)];
                return Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Expanded(child: Text('Xarajat taqsimoti', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14))),
                          GestureDetector(
                            onTap: () => _openBudgetSheet(entries.map((e) => e.key).toList()),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.tune_rounded, size: 14, color: AppColors.accent),
                                SizedBox(width: 4),
                                Text('Smeta', style: TextStyle(fontSize: 12, color: AppColors.accent, fontWeight: FontWeight.w700)),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      for (var i = 0; i < entries.length && i < 5; i++) ...[
                        if (i > 0) const SizedBox(height: 10),
                        Builder(builder: (_) {
                          final cat = entries[i].key;
                          final spent = entries[i].value;
                          final budget = _budgets[cat];
                          final color = catColors[i % catColors.length];
                          final overBudget = budget != null && spent > budget;
                          final barColor = overBudget ? const Color(0xFFF43F5E) : color;
                          final barValue = budget != null
                              ? (spent / budget).clamp(0.0, 1.0)
                              : maxVal > 0 ? (spent / maxVal).clamp(0.0, 1.0) : 0.0;
                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(cat, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w700)),
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(formatMoney(spent), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: barColor)),
                                      if (budget != null) ...[
                                        Text(' / ${formatMoney(budget)}', style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w600)),
                                        if (overBudget)
                                          const Padding(
                                            padding: EdgeInsets.only(left: 4),
                                            child: Icon(Icons.warning_amber_rounded, size: 13, color: Color(0xFFF43F5E)),
                                          ),
                                      ],
                                    ],
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              ClipRRect(
                                borderRadius: BorderRadius.circular(4),
                                child: LinearProgressIndicator(
                                  value: barValue,
                                  minHeight: 7,
                                  backgroundColor: AppColors.border,
                                  valueColor: AlwaysStoppedAnimation(barColor),
                                ),
                              ),
                            ],
                          );
                        }),
                      ],
                    ],
                  ),
                );
              }),
            ],
            if (_txs.isNotEmpty) ...[
              const SizedBox(height: 16),
              Builder(builder: (context) {
                final userId = supabase.auth.currentUser?.id ?? '';
                final now = DateTime.now();
                // Build last 7 days data
                final days = List.generate(7, (i) => DateTime(now.year, now.month, now.day - (6 - i)));
                final dayIn = <int, num>{};
                final dayOut = <int, num>{};
                for (final tx in _txs) {
                  final d = DateTime(tx.date.year, tx.date.month, tx.date.day);
                  final idx = days.indexWhere((day) => day == d);
                  if (idx == -1) continue;
                  if (tx.isIncomeFor(userId)) dayIn[idx] = (dayIn[idx] ?? 0) + tx.summa;
                  if (tx.isExpenseFor(userId)) dayOut[idx] = (dayOut[idx] ?? 0) + tx.summa;
                }
                final hasData = dayIn.isNotEmpty || dayOut.isNotEmpty;
                if (!hasData) return const SizedBox.shrink();
                final maxVal = [...dayIn.values, ...dayOut.values, 1].reduce((a, b) => a > b ? a : b);
                return Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('7 kunlik grafik', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                      const SizedBox(height: 12),
                      SizedBox(
                        height: 80,
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            for (var i = 0; i < 7; i++) ...[
                              if (i > 0) const SizedBox(width: 4),
                              Expanded(
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.end,
                                  children: [
                                    Expanded(
                                      child: Column(
                                        mainAxisAlignment: MainAxisAlignment.end,
                                        children: [
                                          if ((dayIn[i] ?? 0) > 0)
                                            Flexible(
                                              flex: ((dayIn[i] ?? 0) / maxVal * 100).round().clamp(1, 100),
                                              child: Container(
                                                margin: const EdgeInsets.only(bottom: 1),
                                                decoration: BoxDecoration(
                                                  color: const Color(0xFF22C55E).withOpacity(0.8),
                                                  borderRadius: BorderRadius.circular(3),
                                                ),
                                              ),
                                            ),
                                          if ((dayOut[i] ?? 0) > 0)
                                            Flexible(
                                              flex: ((dayOut[i] ?? 0) / maxVal * 100).round().clamp(1, 100),
                                              child: Container(
                                                decoration: BoxDecoration(
                                                  color: const Color(0xFFF43F5E).withOpacity(0.8),
                                                  borderRadius: BorderRadius.circular(3),
                                                ),
                                              ),
                                            ),
                                          if ((dayIn[i] ?? 0) == 0 && (dayOut[i] ?? 0) == 0)
                                            Container(height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(3))),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      DateFormat('E').format(days[i])[0],
                                      style: const TextStyle(fontSize: 9, color: AppColors.muted, fontWeight: FontWeight.w700),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Container(width: 8, height: 8, decoration: BoxDecoration(color: const Color(0xFF22C55E), borderRadius: BorderRadius.circular(2))),
                          const SizedBox(width: 4),
                          const Text('Kirim', style: TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w600)),
                          const SizedBox(width: 12),
                          Container(width: 8, height: 8, decoration: BoxDecoration(color: const Color(0xFFF43F5E), borderRadius: BorderRadius.circular(2))),
                          const SizedBox(width: 4),
                          const Text('Chiqim', style: TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ],
                  ),
                );
              }),
            ],
            const SizedBox(height: 20),
            Builder(builder: (context) {
              final userId = supabase.auth.currentUser?.id ?? '';
              final totalIn = _visibleTxs.fold<num>(0, (s, tx) => s + (tx.isIncomeFor(userId) ? tx.summa : 0));
              final totalOut = _visibleTxs.fold<num>(0, (s, tx) => s + (tx.isExpenseFor(userId) ? tx.summa : 0));
              return Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Operatsiyalar',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  Row(
                    children: [
                      if (_visibleTxs.isNotEmpty) ...[
                        Text(
                          '+${formatMoney(totalIn)}',
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF16A34A)),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '-${formatMoney(totalOut)}',
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFFEF4444)),
                        ),
                        const SizedBox(width: 8),
                      ],
                      IconButton(
                        icon: Icon(_showTxSearch ? Icons.search_off_rounded : Icons.search_rounded, size: 20, color: AppColors.muted),
                        onPressed: () => setState(() { _showTxSearch = !_showTxSearch; if (!_showTxSearch) _txSearch = ''; }),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                    ],
                  ),
                ],
              );
            }),
            const SizedBox(height: 10),
            if (_showTxSearch) ...[
              TextField(
                onChanged: (v) => setState(() => _txSearch = v),
                decoration: const InputDecoration(
                  hintText: 'Izoh, kategoriya, summa...',
                  prefixIcon: Icon(Icons.search_rounded),
                  isDense: true,
                ),
              ),
              const SizedBox(height: 10),
            ],
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _TxFilterChip(label: 'Barchasi', selected: _txFilter == 'all', onTap: () => setState(() => _txFilter = 'all')),
                  const SizedBox(width: 8),
                  _TxFilterChip(label: 'Kirim', selected: _txFilter == 'income', onTap: () => setState(() => _txFilter = 'income')),
                  const SizedBox(width: 8),
                  _TxFilterChip(label: 'Chiqim', selected: _txFilter == 'expense', onTap: () => setState(() => _txFilter = 'expense')),
                ],
              ),
            ),
            const SizedBox(height: 10),
            if (_loading)
              const Padding(
                padding: EdgeInsets.only(top: 40),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 40),
                child: Center(child: Text('Xatolik: $_error', style: const TextStyle(color: Colors.redAccent))),
              )
            else if (_visibleTxs.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 40),
                child: Center(child: Text("Operatsiyalar yo'q", style: TextStyle(color: AppColors.muted))),
              )
            else
              ..._visibleTxs.map((tx) => TransactionRow(tx: tx, onTap: () => _openTxDetail(tx))),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Jamoa',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                ),
                if (_visibleMembers.isNotEmpty)
                  Text(
                    '${_visibleMembers.length} kishi',
                    style: const TextStyle(color: AppColors.muted, fontSize: 13),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            ElevatedButton.icon(
              onPressed: _openAddMember,
              icon: Icon(_project.role == 'owner' ? Icons.engineering_rounded : Icons.construction_rounded),
              label: Text(_project.role == 'owner' ? "Usta qo'shish" : "Ishchi qo'shish"),
            ),
            const SizedBox(height: 12),
            if (!_loading && _visibleMembers.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(child: Text("Hali hech kim yo'q", style: TextStyle(color: AppColors.muted))),
              )
            else
              ..._visibleMembers.map((m) => MemberRow(member: m, onTap: () => _openMemberDetail(m))),
            const SizedBox(height: 24),
            Text(
              'Vazifalar',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 10),
            if (_tasks.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Builder(builder: (context) {
                  final done = _tasks.where((t) => t.holat == 'done').length;
                  final pct = _tasks.isEmpty ? 0.0 : done / _tasks.length;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('$done / ${_tasks.length} bajarildi', style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w700)),
                          Text('${(pct * 100).round()}%', style: const TextStyle(fontSize: 12, color: AppColors.accentTeal, fontWeight: FontWeight.w700)),
                        ],
                      ),
                      const SizedBox(height: 6),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: LinearProgressIndicator(
                          value: pct,
                          minHeight: 6,
                          backgroundColor: AppColors.border,
                          valueColor: const AlwaysStoppedAnimation(AppColors.accentTeal),
                        ),
                      ),
                    ],
                  );
                }),
              ),
            OutlinedButton.icon(
              onPressed: _openAddTask,
              icon: const Icon(Icons.add_task_rounded),
              label: const Text('Vazifa qo\'shish'),
            ),
            const SizedBox(height: 12),
            if (_tasksError != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Center(
                  child: Text(
                    "Vazifalar jadvali sozlanmagan",
                    style: const TextStyle(color: AppColors.muted),
                  ),
                ),
              )
            else if (_tasks.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Center(child: Text("Vazifalar yo'q", style: TextStyle(color: AppColors.muted))),
              )
            else ...[
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _TxFilterChip(label: 'Barchasi', selected: _taskFilter == 'all', onTap: () => setState(() => _taskFilter = 'all')),
                    const SizedBox(width: 8),
                    _TxFilterChip(label: 'Boshlanmagan', selected: _taskFilter == 'todo', onTap: () => setState(() => _taskFilter = 'todo')),
                    const SizedBox(width: 8),
                    _TxFilterChip(label: 'Jarayonda', selected: _taskFilter == 'progress', onTap: () => setState(() => _taskFilter = 'progress')),
                    const SizedBox(width: 8),
                    _TxFilterChip(label: 'Bajarildi', selected: _taskFilter == 'done', onTap: () => setState(() => _taskFilter = 'done')),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              ...([..._tasks]
                    ..sort((a, b) {
                        const order = {'todo': 0, 'progress': 1, 'done': 2};
                        return (order[a.holat] ?? 0).compareTo(order[b.holat] ?? 0);
                      }))
                  .where((t) => _taskFilter == 'all' || t.holat == _taskFilter)
                  .map((t) => TaskRow(task: t, onTap: () => _toggleTask(t), onLongPress: () => _openTaskMenu(t))),
            ],
            const SizedBox(height: 24),
            Text(
              'Materiallar',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: _openAddMaterial,
              icon: const Icon(Icons.inventory_2_outlined),
              label: const Text('Material qo\'shish'),
            ),
            const SizedBox(height: 12),
            if (_materialsError != null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Center(
                  child: Text(
                    "Materiallar jadvali sozlanmagan",
                    style: TextStyle(color: AppColors.muted),
                  ),
                ),
              )
            else if (_materials.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Center(child: Text("Materiallar yo'q", style: TextStyle(color: AppColors.muted))),
              )
            else
              ..._materials.map((m) => MaterialRow(material: m, onTap: () => _openMaterialDetail(m))),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Eslatmalar',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                  ),
                ),
                TextButton.icon(
                  onPressed: _openAddNote,
                  icon: const Icon(Icons.add_rounded, size: 16),
                  label: const Text('Qo\'shish'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (_notes.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Center(child: Text("Eslatmalar yo'q", style: TextStyle(color: AppColors.muted, fontSize: 13))),
              )
            else
              for (final note in _notes)
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(note.text, style: const TextStyle(fontSize: 13.5)),
                            const SizedBox(height: 4),
                            Text(
                              DateFormat('dd.MM.yyyy HH:mm').format(note.createdAt),
                              style: const TextStyle(fontSize: 11, color: AppColors.muted),
                            ),
                          ],
                        ),
                      ),
                      GestureDetector(
                        onTap: () => _deleteNote(note.id),
                        child: const Padding(
                          padding: EdgeInsets.only(left: 10),
                          child: Icon(Icons.close_rounded, size: 16, color: AppColors.muted),
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
}

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  final bool? positive;

  const _MiniStat({required this.label, required this.value, required this.positive});

  @override
  Widget build(BuildContext context) {
    final color = positive == null ? Colors.white70 : (positive! ? const Color(0xFF86EFAC) : const Color(0xFFFCA5A5));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white38, fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
        Text(value, style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.w900)),
      ],
    );
  }
}

class _AddTransactionSheet extends StatefulWidget {
  final List<ObMember> members;
  final bool initialIsIncome;

  const _AddTransactionSheet({required this.members, this.initialIsIncome = true});

  @override
  State<_AddTransactionSheet> createState() => _AddTransactionSheetState();
}

class _AddTransactionSheetState extends State<_AddTransactionSheet> {
  static const _defaultIncomeCats = {
    'mijoz': 'Mijozdan',
    'kredit': 'Kredit',
    'owner': 'Prorab (avans)',
    'boshqa': 'Boshqa',
  };
  static const _defaultExpenseCats = {
    'ishchi': 'Ishchi',
    'boshqa': 'Boshqa',
  };

  static const _addNewValue = '__add_new__';

  final _categoryRepo = CategoryRepository();
  final _templatesRepo = TemplatesRepository();
  List<String> _customIncomeCats = [];
  List<String> _customExpenseCats = [];
  List<TxTemplate> _templates = [];

  bool _isIncome = true;
  String _category = 'mijoz';
  String? _workerId;
  DateTime _txDate = DateTime.now();
  final _amountCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _isIncome = widget.initialIsIncome;
    _loadCustomCats();
  }

  Future<void> _loadCustomCats() async {
    final income = await _categoryRepo.loadCustomIncomeCats();
    final expense = await _categoryRepo.loadCustomExpenseCats();
    final templates = await _templatesRepo.load();
    if (!mounted) return;
    setState(() {
      _customIncomeCats = income;
      _customExpenseCats = expense;
      _templates = templates;
    });
  }

  Future<void> _addCustomCategory() async {
    final ctrl = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Yangi kategoriya'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Kategoriya nomi'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Bekor qilish')),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(ctrl.text.trim()),
            child: const Text('Qoshish'),
          ),
        ],
      ),
    );
    if (name == null || name.isEmpty) return;

    if (_isIncome) {
      await _categoryRepo.addIncomeCat(name);
    } else {
      await _categoryRepo.addExpenseCat(name);
    }
    if (!mounted) return;
    setState(() {
      if (_isIncome) {
        _customIncomeCats = [..._customIncomeCats, name];
      } else {
        _customExpenseCats = [..._customExpenseCats, name];
      }
      _category = name;
    });
  }

  @override
  Widget build(BuildContext context) {
    final cats = {
      ...(_isIncome ? _defaultIncomeCats : _defaultExpenseCats),
      for (final c in (_isIncome ? _customIncomeCats : _customExpenseCats)) c: c,
    };
    if (!cats.containsKey(_category)) {
      _category = cats.keys.first;
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Operatsiya qo\'shish',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
            ),
            TextButton.icon(
              onPressed: () async {
                final note = _noteCtrl.text.trim();
                if (note.isEmpty) return;
                final t = TxTemplate(
                  id: DateTime.now().millisecondsSinceEpoch.toString(),
                  izoh: note,
                  kategoriya: _category,
                  isIncome: _isIncome,
                );
                await _templatesRepo.add(t);
                final templates = await _templatesRepo.load();
                if (!mounted) return;
                setState(() => _templates = templates);
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Shablon saqlandi')));
              },
              icon: const Icon(Icons.bookmark_add_outlined, size: 16),
              label: const Text('Shablon', style: TextStyle(fontSize: 12)),
            ),
          ],
        ),
        if (_templates.isNotEmpty) ...[
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _templates.where((t) => t.isIncome == _isIncome).map((t) => Padding(
                padding: const EdgeInsets.only(right: 6),
                child: GestureDetector(
                  onTap: () {
                    setState(() {
                      _noteCtrl.text = t.izoh;
                      _category = t.kategoriya;
                    });
                  },
                  onLongPress: () async {
                    await _templatesRepo.delete(t.id);
                    final templates = await _templatesRepo.load();
                    if (!mounted) return;
                    setState(() => _templates = templates);
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: AppColors.accent.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.accent.withOpacity(0.3)),
                    ),
                    child: Text(t.izoh, style: const TextStyle(fontSize: 12, color: AppColors.accent, fontWeight: FontWeight.w700)),
                  ),
                ),
              )).toList(),
            ),
          ),
        ],
        const SizedBox(height: 12),
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: true, label: Text('Kirim')),
            ButtonSegment(value: false, label: Text('Chiqim')),
          ],
          selected: {_isIncome},
          onSelectionChanged: (s) => setState(() {
            _isIncome = s.first;
            _workerId = null;
          }),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _amountCtrl,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(hintText: 'Summa'),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: _category,
          decoration: const InputDecoration(labelText: 'Kategoriya'),
          items: [
            ...cats.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))),
            const DropdownMenuItem(value: _addNewValue, child: Text('+ Yangi kategoriya')),
          ],
          onChanged: (v) {
            if (v == _addNewValue) {
              _addCustomCategory();
              return;
            }
            setState(() => _category = v ?? _category);
          },
        ),
        if (!_isIncome && _category == 'ishchi' && widget.members.isNotEmpty) ...[
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _workerId,
            decoration: const InputDecoration(labelText: 'Ishchi'),
            items: widget.members
                .map((m) => DropdownMenuItem(value: m.userId, child: Text(m.displayName)))
                .toList(),
            onChanged: (v) => setState(() => _workerId = v),
          ),
        ],
        const SizedBox(height: 12),
        TextField(
          controller: _noteCtrl,
          decoration: const InputDecoration(hintText: 'Izoh...'),
        ),
        const SizedBox(height: 12),
        InkWell(
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: _txDate,
              firstDate: DateTime(2020),
              lastDate: DateTime.now().add(const Duration(days: 1)),
            );
            if (picked != null) setState(() => _txDate = picked);
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(
              border: Border.all(color: AppColors.border),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              children: [
                const Icon(Icons.calendar_today_outlined, size: 18, color: AppColors.muted),
                const SizedBox(width: 10),
                Text(
                  DateFormat('dd.MM.yyyy').format(_txDate),
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        ElevatedButton(
          onPressed: () {
            final amount = num.tryParse(_amountCtrl.text.trim());
            if (amount == null || amount <= 0) return;
            Navigator.of(context).pop({
              'isIncome': _isIncome,
              'amount': amount,
              'kategoriya': _category,
              'izoh': _noteCtrl.text.trim().isNotEmpty ? _noteCtrl.text.trim() : null,
              'toUserId': _workerId,
              'txDate': _txDate,
            });
          },
          child: Text(_isIncome ? "Kirim qo'shish" : "Chiqim qo'shish"),
        ),
      ],
    );
  }
}

class _InfoBox extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _InfoBox({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.muted, letterSpacing: 0.5)),
          const SizedBox(height: 4),
          Text(value, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: color)),
        ],
      ),
    );
  }
}

class _TxDetailRow extends StatelessWidget {
  final String label;
  final String value;

  const _TxDetailRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      decoration: BoxDecoration(
        color: AppColors.bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
        ],
      ),
    );
  }
}

class _InfoTile extends StatelessWidget {
  final String label;
  final String value;

  const _InfoTile({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.bg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 10, color: AppColors.muted, fontWeight: FontWeight.w800, letterSpacing: 0.4),
          ),
          const SizedBox(height: 3),
          Text(
            value,
            style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.text),
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

class _SendMoneySheet extends StatefulWidget {
  final ObMember member;
  final String title;

  const _SendMoneySheet({required this.member, this.title = 'Pul yuborish'});

  @override
  State<_SendMoneySheet> createState() => _SendMoneySheetState();
}

class _SendMoneySheetState extends State<_SendMoneySheet> {
  final _amountCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();
  DateTime _txDate = DateTime.now();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '${widget.member.displayName}: ${widget.title}',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _amountCtrl,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(hintText: 'Summa'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _noteCtrl,
          decoration: const InputDecoration(hintText: 'Izoh...'),
        ),
        const SizedBox(height: 12),
        InkWell(
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: _txDate,
              firstDate: DateTime(2020),
              lastDate: DateTime.now().add(const Duration(days: 1)),
            );
            if (picked != null) setState(() => _txDate = picked);
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(
              border: Border.all(color: AppColors.border),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              children: [
                const Icon(Icons.calendar_today_outlined, size: 18, color: AppColors.muted),
                const SizedBox(width: 10),
                Text(
                  DateFormat('dd.MM.yyyy').format(_txDate),
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        ElevatedButton(
          onPressed: () {
            final amount = num.tryParse(_amountCtrl.text.trim());
            if (amount == null || amount <= 0) return;
            Navigator.of(context).pop({
              'amount': amount,
              'izoh': _noteCtrl.text.trim().isNotEmpty ? _noteCtrl.text.trim() : null,
              'txDate': _txDate,
            });
          },
          child: const Text('Yuborish'),
        ),
      ],
    );
  }
}

class _TxFilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _TxFilterChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? AppColors.accent.withOpacity(0.18) : AppColors.card,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? AppColors.accent : AppColors.border),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: selected ? AppColors.accent : AppColors.text2,
          ),
        ),
      ),
    );
  }
}
