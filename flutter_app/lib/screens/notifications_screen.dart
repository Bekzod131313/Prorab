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
      await supabase
          .from('notifications')
          .update({'read': true})
          .eq('user_id', userId);
      _load();
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
    final unreadCount = _notifs.where((n) => n['read'] != true).length;

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        title: Text(tr('notifications'), style: const TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          if (unreadCount > 0)
            TextButton(
              onPressed: _markAllAsRead,
              child: Text(tr('mark_all_read'), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.accent)),
            ),
          IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: _load),
        ],
      ),
      body: _loading
          ? _buildShimmerLoading()
          : _notifs.isEmpty
              ? _buildEmptyState()
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                  itemCount: _notifs.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final n = _notifs[i];
                    final id = n['id'].toString();
                    final title = n['title'] ?? tr('notif_default_title');
                    final body = n['body'] ?? '';
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
