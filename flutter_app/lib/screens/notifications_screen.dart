import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../main.dart';
import '../theme/app_theme.dart';
import '../widgets/shimmer.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  bool _loading = true;
  int _selectedTabIndex = 0; // 0 = Shaxsiy (Personal), 1 = Umumiy (General)
  List<Map<String, dynamic>> _notifs = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) return;
      
      final data = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', ascending: false);

      if (mounted) {
        setState(() {
          _notifs = List<Map<String, dynamic>>.from(data as List);
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${tr("error_prefix").replaceFirst("{}", e.toString())}')));
      }
    }
  }

  Future<void> _markAllAsRead() async {
    try {
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) return;

      final activeList = _selectedTabIndex == 0
          ? _notifs.where((n) => n['type'] != 'general').toList()
          : _notifs.where((n) => n['type'] == 'general').toList();

      final idsToMark = activeList
          .where((n) => n['read'] != true)
          .map((n) => n['id'].toString())
          .toList();

      if (idsToMark.isNotEmpty) {
        await supabase
            .from('notifications')
            .update({'read': true})
            .inFilter('id', idsToMark);
        _load();
      }
    } catch (_) {}
  }

  Future<void> _deleteNotif(String id) async {
    try {
      await supabase.from('notifications').delete().eq('id', id);
      _load();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final personalNotifs = _notifs.where((n) => n['type'] != 'general').toList();
    final generalNotifs = _notifs.where((n) => n['type'] == 'general').toList();

    final personalUnread = personalNotifs.where((n) => n['read'] != true).length;
    final generalUnread = generalNotifs.where((n) => n['read'] != true).length;

    final currentTabNotifs = _selectedTabIndex == 0 ? personalNotifs : generalNotifs;
    final currentTabUnread = _selectedTabIndex == 0 ? personalUnread : generalUnread;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Text(tr('notifications'), style: const TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          if (currentTabUnread > 0)
            IconButton(
              icon: const Icon(Icons.done_all_rounded, color: AppColors.accent),
              onPressed: _markAllAsRead,
              tooltip: tr('mark_all_read'),
            ),
        ],
      ),
      body: Column(
        children: [
          // 2 Tabs: Shaxsiy vs Umumiy
          _buildTabBar(personalUnread, generalUnread),

          Expanded(
            child: _loading
                ? _buildShimmerLoading()
                : currentTabNotifs.isEmpty
                    ? _buildEmptyState()
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                        itemCount: currentTabNotifs.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (_, i) {
                          final n = currentTabNotifs[i];
                          final id = n['id'].toString();
                          final isRu = appLocaleNotifier.value == 'ru';
                          final isEn = appLocaleNotifier.value == 'en';
                          final title = isEn
                              ? (n['title_en'] ?? n['title_uz'] ?? n['title'] ?? tr('notif_default_title'))
                              : isRu
                                  ? (n['title_ru'] ?? n['title'] ?? tr('notif_default_title'))
                                  : (n['title_uz'] ?? n['title'] ?? tr('notif_default_title'));
                          final body = isEn
                              ? (n['body_en'] ?? n['body_uz'] ?? n['body'] ?? '')
                              : isRu
                                  ? (n['body_ru'] ?? n['body'] ?? '')
                                  : (n['body_uz'] ?? n['body'] ?? '');
                          final isRead = n['read'] == true;
                          final dateStr = n['created_at'] != null ? n['created_at'].toString().substring(0, 10) : '';

                          return Dismissible(
                            key: ValueKey(id),
                            direction: DismissDirection.endToStart,
                            background: Container(
                              alignment: Alignment.centerRight,
                              padding: const EdgeInsets.only(right: 20),
                              decoration: BoxDecoration(color: AppColors.red, borderRadius: BorderRadius.circular(16)),
                              child: const Icon(Icons.delete_outline_rounded, color: Colors.white),
                            ),
                            onDismissed: (_) => _deleteNotif(id),
                            child: Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: AppColors.card,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: isRead ? AppColors.border : AppColors.accent.withOpacity(0.25)),
                              ),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Container(
                                    width: 38, height: 38,
                                    decoration: BoxDecoration(
                                      color: (isRead ? AppColors.muted : AppColors.accent).withOpacity(0.1),
                                      shape: BoxShape.circle,
                                    ),
                                    child: Icon(
                                      isRead ? Icons.notifications_none_rounded : Icons.notifications_active_rounded,
                                      size: 18,
                                      color: isRead ? AppColors.muted : AppColors.accent,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Expanded(
                                              child: Text(
                                                title,
                                                style: TextStyle(
                                                  fontWeight: isRead ? FontWeight.w600 : FontWeight.w800,
                                                  fontSize: 13,
                                                  color: AppColors.text,
                                                ),
                                              ),
                                            ),
                                            if (!isRead) ...[
                                              const SizedBox(width: 6),
                                              Container(
                                                width: 6, height: 6,
                                                decoration: const BoxDecoration(color: AppColors.accent, shape: BoxShape.circle),
                                              ),
                                            ]
                                          ],
                                        ),
                                        const SizedBox(height: 3),
                                        Text(body, style: const TextStyle(fontSize: 12, color: AppColors.text2)),
                                        const SizedBox(height: 6),
                                        Text(dateStr, style: const TextStyle(fontSize: 10, color: AppColors.muted)),
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
        ],
      ),
    );
  }

  Widget _buildTabBar(int personalUnread, int generalUnread) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: _buildTabButton(
              index: 0,
              label: tr('notif_personal'),
              unreadCount: personalUnread,
            ),
          ),
          Expanded(
            child: _buildTabButton(
              index: 1,
              label: tr('notif_general'),
              unreadCount: generalUnread,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabButton({
    required int index,
    required String label,
    required int unreadCount,
  }) {
    final isSelected = _selectedTabIndex == index;
    return InkWell(
      onTap: () => setState(() => _selectedTabIndex = index),
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.accent : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
        ),
        alignment: Alignment.center,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 13,
                color: isSelected ? Colors.white : AppColors.text2,
              ),
            ),
            if (unreadCount > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: isSelected ? Colors.white : AppColors.accent,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '$unreadCount',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: isSelected ? AppColors.accent : Colors.white,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 72, height: 72,
            decoration: BoxDecoration(color: AppColors.card, shape: BoxShape.circle, border: Border.all(color: AppColors.border)),
            child: const Icon(Icons.notifications_off_outlined, size: 28, color: AppColors.muted),
          ),
          const SizedBox(height: 16),
          ValueListenableBuilder<String>(
            valueListenable: appLocaleNotifier,
            builder: (_, __, ___) => Column(
              children: [
                Text(tr('notif_empty'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.text)),
                const SizedBox(height: 4),
                Text(tr('notif_empty_sub'), style: const TextStyle(fontSize: 12, color: AppColors.muted)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildShimmerLoading() {
    return Shimmer(
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        itemCount: 5,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, __) => const ShimmerBox(height: 70, borderRadius: 14),
      ),
    );
  }
}
