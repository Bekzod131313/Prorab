import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../main.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../widgets/project_card.dart' show formatMoney, formatUzsToDisplay, formatTransactionAmount;
import '../widgets/member_row.dart' show colorForName;
import '../models/transaction.dart';
import 'create_notification_screen.dart';

class AdminPanelScreen extends StatefulWidget {
  const AdminPanelScreen({super.key});

  @override
  State<AdminPanelScreen> createState() => _AdminPanelScreenState();
}

class _AdminPanelScreenState extends State<AdminPanelScreen> with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;
  bool _loading = true;
  String _cfUrl = 'https://us-central1-risq-91c54.cloudfunctions.net/sendPushNotification';

  List<Map<String, dynamic>> _profiles = [];
  List<Map<String, dynamic>> _projects = [];
  List<Map<String, dynamic>> _members = [];
  List<Map<String, dynamic>> _transactions = [];
  List<Map<String, dynamic>> _smsLogs = [];

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 5, vsync: this);
    _loadSettings();
    _loadAllData();
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    final url = prefs.getString('admin_cf_url');
    if (url != null && url.isNotEmpty) {
      setState(() => _cfUrl = url);
    }
  }

  Future<void> _saveSettings(String url) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('admin_cf_url', url);
    setState(() => _cfUrl = url);
  }

  Future<void> _loadAllData() async {
    setState(() => _loading = true);
    try {
      final profilesRes = await supabase.from('profiles').select('*').order('created_at', ascending: false);
      final projectsRes = await supabase.from('obyektlar').select('*').order('created_at', ascending: false);
      final membersRes = await supabase.from('ob_members').select('*,profiles(*),ob:obyektlar(*)').order('created_at', ascending: false);
      final txRes = await supabase.from('transactions').select('*,ob:obyektlar(*)').order('tx_date', ascending: false);

      List<Map<String, dynamic>> smsLogs = [];
      try {
        final smsRes = await supabase.from('sms_logs').select('*').order('created_at', ascending: false);
        smsLogs = List<Map<String, dynamic>>.from(smsRes as List);
      } catch (e) {
        debugPrint('sms_logs table may not exist yet: $e');
      }

      if (!mounted) return;
      setState(() {
        _profiles = List<Map<String, dynamic>>.from(profilesRes as List);
        _projects = List<Map<String, dynamic>>.from(projectsRes as List);
        _members = List<Map<String, dynamic>>.from(membersRes as List);
        _transactions = List<Map<String, dynamic>>.from(txRes as List);
        _smsLogs = smsLogs;
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ma\'lumotlarni yuklashda xatolik: $e')));
      }
    }
  }

  Future<void> _sendNotification(String targetUserId, String fcmToken, String title, String body) async {
    try {
      // 1. Always save to Supabase notifications table first
      await supabase.from('notifications').insert({
        'user_id': targetUserId,
        'title': title,
        'body': body,
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Baza bilan bog\'lanishda xatolik: $e\n(Ehtimol notifications jadvalini yaratmagandirsiz?)')),
        );
      }
      return;
    }

    // 2. Try to send FCM push notification
    try {
      final response = await http.post(
        Uri.parse(_cfUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'token': fcmToken,
          'title': title,
          'body': body,
        }),
      );

      if (response.statusCode == 200) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Bildirishnoma saqlandi va Push yuborildi!')));
      } else {
        throw Exception('Status code: ${response.statusCode}');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Bildirishnoma saqlandi, lekin Push yuborishda xato: $e\n(Ehtimol Cloud Function hali deploy qilinmagandir)')),
        );
      }
    }
  }

  void _openSendDialog(Map<String, dynamic> user) async {
    final token = user['fcm_token'] as String?;
    if (token == null || token.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Ushbu foydalanuvchida FCM token mavjud emas.')));
      return;
    }

    final success = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => CreateNotificationScreen(targetUser: user),
      ),
    );
    if (success == true) {
      _loadAllData();
    }
  }

  void _openSendAllDialog(List<Map<String, dynamic>> users) async {
    final success = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => CreateNotificationScreen(allUsers: users),
      ),
    );
    if (success == true) {
      _loadAllData();
    }
  }

  void _openSettingsDialog() {
    final urlCtrl = TextEditingController(text: _cfUrl);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('settings')),
        content: TextField(
          controller: urlCtrl,
          decoration: const InputDecoration(labelText: 'URL manzili', hintText: 'https://...'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: Text(tr('cancel'))),
          ElevatedButton(
            onPressed: () {
              if (urlCtrl.text.trim().isEmpty) return;
              _saveSettings(urlCtrl.text.trim());
              Navigator.of(ctx).pop();
            },
            child: Text(tr('save')),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: const Text('Admin Panel', style: TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          IconButton(icon: const Icon(Icons.settings_outlined), onPressed: _openSettingsDialog),
          IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: _loadAllData),
        ],
        bottom: TabBar(
          controller: _tabCtrl,
          isScrollable: true,
          labelColor: AppColors.accent,
          unselectedLabelColor: AppColors.muted,
          indicatorColor: AppColors.accent,
          tabs: const [
            Tab(text: 'Foydalanuvchilar'),
            Tab(text: 'Loyihalar'),
            Tab(text: 'Jamoalar'),
            Tab(text: 'Tranzaksiyalar'),
            Tab(text: 'SMS loglari'),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabCtrl,
              children: [
                _buildUsersTab(),
                _buildProjectsTab(),
                _buildMembersTab(),
                _buildTransactionsTab(),
                _buildSmsTab(),
              ],
            ),
    );
  }

  Widget _buildUsersTab() {
    if (_profiles.isEmpty) return Center(child: Text(tr('workers_empty')));
    final usersWithToken = _profiles.where((u) => u['fcm_token'] != null && (u['fcm_token'] as String).isNotEmpty).toList();

    return Column(
      children: [
        if (usersWithToken.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.accent,
                minimumSize: const Size.fromHeight(44),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              icon: const Icon(Icons.campaign_outlined, color: Colors.white),
              label: Text("Barchaga bildirishnoma yuborish (${usersWithToken.length})",
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              onPressed: () => _openSendAllDialog(usersWithToken),
            ),
          ),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: _profiles.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, i) {
              final u = _profiles[i];
              final name = u['full_name'] ?? 'Noma\'lum';
              final phone = u['phone'] ?? '';
              final kasb = u['kasb'] ?? 'Kasb belgilanmagan';
              final staj = u['staj'] ?? 0;
              final hasToken = u['fcm_token'] != null && (u['fcm_token'] as String).isNotEmpty;
              final isAdmin = u['is_admin'] == true;

              final color = colorForName(name);
              final initials = name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase();

              return Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 22,
                      backgroundColor: color.withOpacity(0.15),
                      child: Text(initials, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: color)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                              if (isAdmin) ...[
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(color: AppColors.orange.withOpacity(0.15), borderRadius: BorderRadius.circular(6)),
                                  child: const Text('Admin', style: TextStyle(color: AppColors.orange, fontSize: 9, fontWeight: FontWeight.w800)),
                                ),
                              ]
                            ],
                          ),
                          Text(phone, style: const TextStyle(fontSize: 11, color: AppColors.text2)),
                          Text('$kasb • ${tr('experience_label')}: $staj ${tr('years_suffix')}', style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: Icon(
                        Icons.notifications_active_outlined,
                        color: hasToken ? AppColors.accent : AppColors.muted.withOpacity(0.4),
                      ),
                      tooltip: hasToken ? 'Push-bildirishnoma jo\'natish' : 'FCM Token topilmadi',
                      onPressed: hasToken ? () => _openSendDialog(u) : null,
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildProjectsTab() {
    if (_projects.isEmpty) return Center(child: Text(tr('no_projects')));
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _projects.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, i) {
        final p = _projects[i];
        final name = p['nomi'] ?? '';
        final status = p['status'] ?? 'active';
        final kirim = p['kirim'] ?? 0;
        final chiqim = p['chiqim'] ?? 0;
        final muddat = p['muddat'] ?? 30;
        final manzil = p['manzil'] ?? 'Manzil ko\'rsatilmagan';
        final mijoz = p['mijoz'] ?? 'Mijoz belgilanmagan';

        final isDone = status == 'done';

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
              Row(
                children: [
                  Expanded(child: Text(name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14))),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: (isDone ? AppColors.green : AppColors.accent).withOpacity(0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      isDone ? 'Yakunlangan' : 'Faol',
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: isDone ? AppColors.green : AppColors.accent),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text('${tr("client")}: $mijoz • ${tr("duration_days")}: $muddat', style: const TextStyle(fontSize: 11, color: AppColors.text2)),
              Text('${tr("location")}: $manzil', style: const TextStyle(fontSize: 11, color: AppColors.muted)),
              const SizedBox(height: 10),
              const Divider(color: AppColors.border, height: 1),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tr('income'), style: const TextStyle(fontSize: 10, color: AppColors.muted)),
                        Text(formatUzsToDisplay(kirim), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.green)),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tr('expense'), style: const TextStyle(fontSize: 10, color: AppColors.muted)),
                        Text(formatUzsToDisplay(chiqim), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.red)),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tr('balance'), style: const TextStyle(fontSize: 10, color: AppColors.muted)),
                        Text(formatUzsToDisplay(kirim - chiqim), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: (kirim - chiqim) >= 0 ? AppColors.green : AppColors.red)),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildMembersTab() {
    if (_members.isEmpty) return Center(child: Text(tr('no_workers')));
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _members.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, i) {
        final m = _members[i];
        final profile = m['profiles'] as Map<String, dynamic>?;
        final ob = m['ob'] as Map<String, dynamic>?;

        final userName = profile?['full_name'] ?? 'Noma\'lum';
        final obName = ob?['nomi'] ?? 'Noma\'lum Loyiha';
        final role = m['role'] ?? 'member';
        final ishaqi = m['ishaqi'] ?? 0;
        final olingan = m['olingan'] ?? 0;
        final balance = ishaqi - olingan;

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
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(userName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                        Text('${tr("nav_projects")}: $obName', style: const TextStyle(fontSize: 11, color: AppColors.text2)),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: (role == 'owner' ? AppColors.orange : AppColors.accent).withOpacity(0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      role == 'owner' ? tr('prorab') : tr('xodim_category'),
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: role == 'owner' ? AppColors.orange : AppColors.accent),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              const Divider(color: AppColors.border, height: 1),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tr('salary'), style: const TextStyle(fontSize: 10, color: AppColors.muted)),
                        Text(formatUzsToDisplay(ishaqi), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tr('received'), style: const TextStyle(fontSize: 10, color: AppColors.muted)),
                        Text(formatUzsToDisplay(olingan), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.green)),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(tr('balance'), style: const TextStyle(fontSize: 10, color: AppColors.muted)),
                        Text(formatUzsToDisplay(balance), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: balance > 0 ? AppColors.orange : AppColors.text)),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildTransactionsTab() {
    if (_transactions.isEmpty) return const Center(child: Text('Tranzaksiyalar yo\'q'));
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _transactions.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, i) {
        final tx = _transactions[i];
        final txModel = ProjectTransaction.fromMap(tx);
        final ob = tx['ob'] as Map<String, dynamic>?;

        final obName = ob?['nomi'] ?? 'Noma\'lum Loyiha';
        final tur = tx['tur'] ?? 'spend';
        final kategoriya = tx['kategoriya'] ?? 'Boshqa';
        final izoh = tx['izoh'];
        final dateStr = tx['tx_date'] != null ? tx['tx_date'].toString().substring(0, 10) : '';

        final isIncome = tur == 'income';
        final color = isIncome ? AppColors.green : AppColors.red;

        return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Container(
                width: 36, height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
                child: Icon(isIncome ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded, size: 18, color: color),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(izoh ?? kategoriya, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                    Text('${tr("nav_projects")}: $obName', style: const TextStyle(fontSize: 11, color: AppColors.text2)),
                    Text('$dateStr • ${tr("category")}: $kategoriya', style: const TextStyle(fontSize: 10, color: AppColors.muted)),
                  ],
                ),
              ),
              Text(
                '${isIncome ? '+' : '-'}${formatTransactionAmount(txModel)}',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: color),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSmsTab() {
    if (_smsLogs.isEmpty) {
      return const Center(child: Text('SMS loglari topilmadi.\n(Jadval mavjudligini yoki SMS yuborilganini tekshiring)'));
    }

    final successCount = _smsLogs.where((log) => log['status'] == 'success').length;

    return Column(
      children: [
        Container(
          margin: const EdgeInsets.all(16),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              Column(
                children: [
                  const Text('Jami SMS yuborilgan', style: TextStyle(color: AppColors.muted, fontSize: 13)),
                  const SizedBox(height: 4),
                  Text(
                    '${_smsLogs.length} ${tr("pcs_suffix")}',
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20, color: AppColors.text),
                  ),
                ],
              ),
              Container(width: 1, height: 40, color: AppColors.border),
              Column(
                children: [
                  Text(tr('success'), style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                  const SizedBox(height: 4),
                  Text(
                    '$successCount ta',
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20, color: Color(0xFF16A34A)),
                  ),
                ],
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            itemCount: _smsLogs.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, i) {
              final log = _smsLogs[i];
              final phone = log['phone'] ?? 'Noma\'lum';
              final msg = log['message'] ?? '';
              final status = log['status'] ?? 'failed';
              final createdAtStr = log['created_at'] != null
                  ? DateFormat('dd.MM.yyyy HH:mm').format(DateTime.parse(log['created_at']).toLocal())
                  : '';

              final isSuccess = status == 'success';

              return Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: (isSuccess ? const Color(0xFF16A34A) : const Color(0xFFEF4444)).withOpacity(0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(
                        isSuccess ? Icons.check_circle_outline_rounded : Icons.highlight_off_rounded,
                        color: isSuccess ? const Color(0xFF16A34A) : const Color(0xFFEF4444),
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                phone,
                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                              ),
                              Text(
                                createdAtStr,
                                style: const TextStyle(fontSize: 11, color: AppColors.muted),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            msg,
                            style: const TextStyle(fontSize: 13, color: AppColors.text2),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
