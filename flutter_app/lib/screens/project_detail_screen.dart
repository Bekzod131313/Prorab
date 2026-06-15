import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/member_repository.dart';
import '../data/transaction_repository.dart';
import '../main.dart';
import '../models/member.dart';
import '../models/project.dart';
import '../models/transaction.dart';
import '../theme/app_theme.dart';
import '../widgets/member_row.dart' show MemberRow, colorForName;
import '../widgets/project_card.dart' show colorForProject, formatMoney;
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
  List<ProjectTransaction> _txs = [];
  List<ObMember> _members = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final txs = await _repo.loadForProject(widget.project.id);
      final members = await _memberRepo.loadForProject(widget.project.id);
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
  }

  List<ObMember> get _visibleMembers {
    final userId = supabase.auth.currentUser?.id;
    if (widget.project.role == 'owner') {
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
          obId: widget.project.id,
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
        obId: widget.project.id,
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
    final canDelete = tx.fromUser == userId || widget.project.role == 'owner';
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
    final canSend = (widget.project.role == 'owner' && member.role == 'member') ||
        (widget.project.role == 'member' && member.role == 'worker');

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
        obId: widget.project.id,
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

  @override
  Widget build(BuildContext context) {
    final project = widget.project;
    final color = colorForProject(project.nomi);
    final bal = project.balance;
    final balColor = bal >= 0 ? const Color(0xFF16A34A) : const Color(0xFFEF4444);

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Text(project.nomi),
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
              icon: Icon(widget.project.role == 'owner' ? Icons.engineering_rounded : Icons.construction_rounded),
              label: Text(widget.project.role == 'owner' ? "Usta qo'shish" : "Ishchi qo'shish"),
            ),
            const SizedBox(height: 12),
            if (!_loading && _visibleMembers.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(child: Text("Hali hech kim yo'q", style: TextStyle(color: AppColors.muted))),
              )
            else
              ..._visibleMembers.map((m) => MemberRow(member: m, onTap: () => _openMemberDetail(m))),
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
