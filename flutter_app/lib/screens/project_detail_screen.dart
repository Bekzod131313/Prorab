import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/material_repository.dart';
import '../data/member_repository.dart';
import '../data/project_repository.dart';
import '../data/task_repository.dart';
import '../data/transaction_repository.dart';
import '../main.dart';
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

  const ProjectDetailScreen({super.key, required this.project});

  @override
  State<ProjectDetailScreen> createState() => _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends State<ProjectDetailScreen> {
  final _repo = TransactionRepository();
  final _memberRepo = MemberRepository();
  final _projectRepo = ProjectRepository();
  final _taskRepo = TaskRepository();
  final _materialRepo = MaterialRepository();
  late Project _project;
  List<ProjectTransaction> _txs = [];
  List<ObMember> _members = [];
  List<ObTask> _tasks = [];
  List<ObMaterial> _materials = [];
  String? _tasksError;
  String? _materialsError;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _project = widget.project;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final txs = await _repo.loadForProject(_project.id);
      final members = await _memberRepo.loadForProject(_project.id);
      if (!mounted) return;
      setState(() {
        _txs = txs;
        _members = members;
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
    if (mounted) setState(() {});
  }

  List<ObMember> get _visibleMembers {
    final userId = supabase.auth.currentUser?.id;
    if (_project.role == 'owner') {
      return _members.where((m) => m.role == 'member').toList();
    }
    return _members.where((m) => m.addedBy == userId).toList();
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
        child: _AddMemberSheet(phoneCtrl: phoneCtrl, kasbCtrl: kasbCtrl),
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

  Future<void> _openAddTransaction() async {
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
        child: _AddTransactionSheet(members: _visibleMembers),
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

  Future<void> _openTxDetail(ProjectTransaction tx) async {
    final userId = supabase.auth.currentUser?.id;
    final canDelete = tx.fromUser == userId || _project.role == 'owner';
    final isIn = tx.isIncomeFor(userId ?? '');
    final dateStr = DateFormat('dd.MM.yyyy HH:mm').format(tx.date);

    final delete = await showModalBottomSheet<bool>(
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
            if (tx.izoh?.isNotEmpty == true) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.bg,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Izoh', style: TextStyle(color: AppColors.muted)),
                    Text(tx.izoh!, style: const TextStyle(fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
            ],
            if (canDelete) ...[
              const SizedBox(height: 20),
              OutlinedButton(
                onPressed: () => Navigator.of(ctx).pop(true),
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

    if (delete == true) {
      await _repo.deleteTransaction(tx.id);
      _load();
    }
  }

  Future<void> _openMemberDetail(ObMember member) async {
    final memberTxs = _txs.where((t) => t.fromUser == member.userId || t.toUser == member.userId).toList();
    final canSend = (_project.role == 'owner' && member.role == 'member') ||
        (_project.role == 'member' && member.role == 'worker');

    final send = await showModalBottomSheet<bool>(
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
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.bg,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                children: [
                  const Text("Qo'lida", style: TextStyle(color: Color(0xFF16A34A), fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text(
                    formatMoney(member.balance),
                    style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: Color(0xFF16A34A)),
                  ),
                ],
              ),
            ),
            if (canSend) ...[
              const SizedBox(height: 12),
              ElevatedButton.icon(
                onPressed: () => Navigator.of(ctx).pop(true),
                icon: const Icon(Icons.send_rounded),
                label: const Text('Pul yuborish'),
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
                      Navigator.of(ctx).pop(false);
                      _openTxDetail(tx);
                    },
                  )),
          ],
        ),
      ),
    );

    if (send == true) {
      await _openSendMoney(member);
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

    final result = await showModalBottomSheet<String>(
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
              "Yangi vazifa",
              style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: ctrl,
              decoration: const InputDecoration(hintText: 'Vazifa nomi'),
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
    );

    if (result != null) {
      await _taskRepo.addTask(_project.id, result);
      _load();
    }
  }

  Future<void> _toggleTask(ObTask task) async {
    await _taskRepo.toggleTask(task.id, task.holat);
    _load();
  }

  Future<void> _openAddMaterial() async {
    final nameCtrl = TextEditingController();
    final qtyCtrl = TextEditingController();
    final unitCtrl = TextEditingController();

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
      );
      _load();
    }
  }

  Future<void> _openEditProject() async {
    final nameCtrl = TextEditingController(text: _project.nomi);
    final daysCtrl = TextEditingController(text: _project.muddat.toString());
    DateTime startDate = _project.boshlanish ?? DateTime.now();

    final saved = await showModalBottomSheet<bool>(
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
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: () {
                  if (nameCtrl.text.trim().isEmpty) return;
                  Navigator.of(ctx).pop(true);
                },
                child: const Text('Saqlash'),
              ),
            ],
          ),
        ),
      ),
    );

    if (saved == true) {
      final days = int.tryParse(daysCtrl.text.trim()) ?? _project.muddat;
      final nomi = nameCtrl.text.trim();
      await _projectRepo.updateProject(
        id: _project.id,
        nomi: nomi,
        boshlanish: startDate,
        muddat: days,
      );
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
          status: _project.status,
        );
      });
    }
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
                        child: Text(
                          project.nomi,
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18),
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
                ],
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _InfoBox(
                    label: 'KIRIM',
                    value: formatMoney(project.kirim),
                    color: const Color(0xFF16A34A),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _InfoBox(
                    label: 'CHIQIM',
                    value: formatMoney(project.chiqim),
                    color: const Color(0xFFEF4444),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            Text(
              'Operatsiyalar',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
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
            else if (_txs.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 40),
                child: Center(child: Text("Operatsiyalar yo'q", style: TextStyle(color: AppColors.muted))),
              )
            else
              ..._txs.map((tx) => TransactionRow(tx: tx, onTap: () => _openTxDetail(tx))),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Jamoa',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
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
            else
              ..._tasks.map((t) => TaskRow(task: t, onTap: () => _toggleTask(t))),
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
              ..._materials.map((m) => MaterialRow(material: m)),
          ],
        ),
      ),
    );
  }
}

class _AddTransactionSheet extends StatefulWidget {
  final List<ObMember> members;

  const _AddTransactionSheet({required this.members});

  @override
  State<_AddTransactionSheet> createState() => _AddTransactionSheetState();
}

class _AddTransactionSheetState extends State<_AddTransactionSheet> {
  static const _incomeCats = {
    'mijoz': 'Mijozdan',
    'kredit': 'Kredit',
    'owner': 'Prorab (avans)',
    'boshqa': 'Boshqa',
  };
  static const _expenseCats = {
    'ishchi': 'Ishchi',
    'boshqa': 'Boshqa',
  };

  bool _isIncome = true;
  String _category = 'mijoz';
  String? _workerId;
  final _amountCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final cats = _isIncome ? _incomeCats : _expenseCats;
    if (!cats.containsKey(_category)) {
      _category = cats.keys.first;
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Operatsiya qo\'shish',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 16),
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
          items: cats.entries
              .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
              .toList(),
          onChanged: (v) => setState(() => _category = v ?? _category),
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
            });
          },
          child: Text(_isIncome ? "Kirim qo'shish" : "Chiqim qo'shish"),
        ),
      ],
    );
  }
}

class _AddMemberSheet extends StatelessWidget {
  final TextEditingController phoneCtrl;
  final TextEditingController kasbCtrl;

  const _AddMemberSheet({required this.phoneCtrl, required this.kasbCtrl});

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

class _SendMoneySheet extends StatefulWidget {
  final ObMember member;

  const _SendMoneySheet({required this.member});

  @override
  State<_SendMoneySheet> createState() => _SendMoneySheetState();
}

class _SendMoneySheetState extends State<_SendMoneySheet> {
  final _amountCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '${widget.member.displayName}ga pul yuborish',
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
        const SizedBox(height: 20),
        ElevatedButton(
          onPressed: () {
            final amount = num.tryParse(_amountCtrl.text.trim());
            if (amount == null || amount <= 0) return;
            Navigator.of(context).pop({
              'amount': amount,
              'izoh': _noteCtrl.text.trim().isNotEmpty ? _noteCtrl.text.trim() : null,
            });
          },
          child: const Text('Yuborish'),
        ),
      ],
    );
  }
}
