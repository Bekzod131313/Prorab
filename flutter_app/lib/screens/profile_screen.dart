import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/profile_repository.dart';
import '../l10n/strings.dart';
import '../models/profile.dart';
import '../theme/app_theme.dart';
import '../widgets/project_card.dart' show formatUzsToDisplay;
import '../widgets/shimmer.dart';
import 'settings_screen.dart';
import 'edit_profile_screen.dart';
import '../utils/phone_formatter.dart';
import '../utils/haptics.dart';
import '../widgets/app_cached_image.dart';

class ProfileScreen extends StatefulWidget {
  final String? userId;
  const ProfileScreen({super.key, this.userId});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _repo = ProfileRepository();
  Profile? _profile;
  ProfileStats? _stats;
  List<String> _portfolio = [];
  bool _loading = true;
  bool _avatarUploading = false;
  bool _portfolioUploading = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _loadSilent() async {
    try {
      final currentUserId = Supabase.instance.client.auth.currentUser?.id ?? '';
      final targetUserId = widget.userId ?? currentUserId;
      final isOwnProfile = widget.userId == null || widget.userId == currentUserId;

      final results = await Future.wait([
        isOwnProfile ? _repo.loadCurrent() : _repo.loadById(targetUserId),
        isOwnProfile ? _repo.loadStats() : Future.value(null),
        _repo.loadPortfolio(targetUserId),
      ]);
      if (!mounted) return;
      setState(() {
        _profile = results[0] as Profile?;
        _stats = results[1] as ProfileStats?;
        _portfolio = results[2] as List<String>;
      });
    } catch (_) {}
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent && _profile == null) {
      setState(() => _loading = true);
    }
    await _loadSilent();
    if (mounted) {
      setState(() => _loading = false);
    }
  }

  Future<void> _pickAvatar() async {
    try {
      final picker = ImagePicker();
      final file = await picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
      if (file == null) return;
      final bytes = await file.readAsBytes();
      final userId = Supabase.instance.client.auth.currentUser?.id ?? '';
      setState(() => _avatarUploading = true);
      final url = await _repo.uploadAvatar(userId, bytes);
      await _repo.updateProfile(
        fullName: _profile?.fullName ?? '',
        phone: _profile?.phone ?? '',
        staj: _profile?.staj ?? 0,
        kasb: _profile?.kasb,
        avatarUrl: url,
      );
      await _loadSilent();
      setState(() => _avatarUploading = false);
    } catch (e) {
      if (mounted) {
        setState(() => _avatarUploading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('error_short').replaceFirst('{}', e.toString()))),
        );
      }
    }
  }

  void _openFullScreenAvatar(String url) {
    AppHaptics.light();
    showDialog(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.95),
      builder: (ctx) => Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.close, color: Colors.white, size: 28),
            onPressed: () => Navigator.of(ctx).pop(),
          ),
        ),
        body: Center(
          child: InteractiveViewer(
            minScale: 0.5,
            maxScale: 4.0,
            child: AppCachedImage(
              imageUrl: url,
              fit: BoxFit.contain,
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _pickPortfolioPhoto() async {
    try {
      final picker = ImagePicker();
      final file = await picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
      if (file == null) return;
      final bytes = await file.readAsBytes();
      final userId = Supabase.instance.client.auth.currentUser?.id ?? '';
      setState(() => _portfolioUploading = true);
      await _repo.uploadPortfolioImage(userId, bytes);
      await _loadSilent();
      setState(() => _portfolioUploading = false);
    } catch (e) {
      if (mounted) {
        setState(() => _portfolioUploading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('error_short').replaceFirst('{}', e.toString()))),
        );
      }
    }
  }

  Future<void> _openEditProfile() async {
    final updated = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => EditProfileScreen(profile: _profile),
      ),
    );
    if (updated == true) {
      _load();
    }
  }

  Widget _buildShimmerLoading() {
    return Shimmer(
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        children: [
          const SizedBox(height: 12),
          // Avatar & user info skeleton
          const Center(
            child: Column(
              children: [
                ShimmerBox(
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                ),
                SizedBox(height: 14),
                ShimmerBox(
                  width: 140,
                  height: 22,
                  borderRadius: 8,
                ),
                SizedBox(height: 8),
                ShimmerBox(
                  width: 180,
                  height: 14,
                  borderRadius: 6,
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          // Stats & Balance skeleton
          const ShimmerBox(
            height: 110,
            borderRadius: 16,
          ),
          const SizedBox(height: 16),
          // Portfolio section skeleton
          const ShimmerBox(
            height: 160,
            borderRadius: 16,
          ),
          const SizedBox(height: 16),
          // Settings entry tile skeleton
          const ShimmerBox(
            height: 56,
            borderRadius: 16,
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = Supabase.instance.client.auth.currentUser;
    final email = user?.email ?? '';
    final isOwnProfile = widget.userId == null || widget.userId == user?.id;

    return ValueListenableBuilder<String>(
      valueListenable: appLocaleNotifier,
      builder: (_, lang, ___) => Scaffold(
        backgroundColor: AppColors.bg,
        appBar: AppBar(
          backgroundColor: AppColors.bg,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          leading: !isOwnProfile && Navigator.of(context).canPop()
              ? IconButton(
                  icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: AppColors.text),
                  onPressed: () => Navigator.of(context).pop(),
                )
              : null,
          title: Text(
            tr('profile'),
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.text),
          ),
          centerTitle: true,
          actions: !isOwnProfile
              ? null
              : [
                  IconButton(
                    icon: const Icon(Icons.edit_rounded, color: AppColors.accent, size: 22),
                    onPressed: _openEditProfile,
                    tooltip: tr('edit_profile'),
                  ),
                ],
        ),
        body: _loading
            ? _buildShimmerLoading()
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.symmetric(horizontal: 0, vertical: 8),
                  children: [
                    // ── Telegram Header (Avatar + Name + Subtitle) ──────────
                    const SizedBox(height: 8),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Column(
                        children: [
                          GestureDetector(
                            onTap: () {
                              if (_profile?.avatarUrl != null && _profile!.avatarUrl!.isNotEmpty) {
                                _openFullScreenAvatar(_profile!.avatarUrl!);
                              } else if (isOwnProfile && !_avatarUploading) {
                                _pickAvatar();
                              }
                            },
                            child: Stack(
                              alignment: Alignment.center,
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(3),
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                      color: AppColors.accent.withOpacity(0.3),
                                      width: 2.5,
                                    ),
                                  ),
                                  child: CircleAvatar(
                                    radius: 46,
                                    backgroundColor: AppColors.accent,
                                    backgroundImage: _profile?.avatarUrl != null ? AppCachedImage.provider(_profile!.avatarUrl!) : null,
                                    child: _avatarUploading
                                        ? const SizedBox(
                                            width: 28,
                                            height: 28,
                                            child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                                          )
                                        : _profile?.avatarUrl == null
                                            ? Text(
                                                _profile?.initial ?? '?',
                                                style: const TextStyle(fontSize: 36, fontWeight: FontWeight.bold, color: Colors.white),
                                              )
                                            : null,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            _profile?.displayName ?? (isOwnProfile ? email : ''),
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w700,
                              color: AppColors.text,
                              letterSpacing: -0.3,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _profile?.phone.isNotEmpty == true
                                ? '${PhoneFormatter.format(_profile!.phone)}${_profile?.kasb?.isNotEmpty == true ? " • ${_profile!.kasb}" : ""}'
                                : (email.isNotEmpty ? email : ''),
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: AppColors.muted,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 20),

                    // ── Card 1: Stats & Balance ──────────────────────────────
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: _TelegramGroupCard(
                        children: [
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
                            child: Row(
                              children: [
                                _StatCol(label: tr('projects_count'), value: '${_stats?.obsCount ?? 0}'),
                                _Divider(),
                                _StatCol(label: tr('workers'), value: '${_stats?.peopleCount ?? 0}'),
                                _Divider(),
                                _StatCol(label: tr('experience_label'), value: '${_profile?.staj ?? 0} ${tr('years_suffix')}'),
                              ],
                            ),
                          ),
                          if (_stats != null)
                            _TelegramTile(
                              leading: const _TelegramIconBadge(
                                icon: Icons.account_balance_wallet_rounded,
                                color: Color(0xFF007AFF),
                              ),
                              title: tr('balance'),
                              trailing: Text(
                                formatUzsToDisplay(_stats!.totalBalance),
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                  color: _stats!.totalBalance >= 0 ? AppColors.green : AppColors.red,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 16),

                    // ── Card 2: Sozlamalar (Settings Screen Entry) ───────────
                    if (isOwnProfile) ...[
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: _TelegramGroupCard(
                          children: [
                            _TelegramTile(
                              leading: const _TelegramIconBadge(
                                icon: Icons.settings_rounded,
                                color: Color(0xFF6366F1),
                              ),
                              title: tr('settings'),
                              subtitle: tr('settings_sub'),
                              trailing: const Icon(Icons.chevron_right_rounded, size: 20, color: AppColors.muted),
                              onTap: () async {
                                final changed = await Navigator.of(context).push<bool>(
                                  MaterialPageRoute(builder: (_) => SettingsScreen(profile: _profile)),
                                );
                                if (changed == true) {
                                  _loadSilent();
                                }
                              },
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],

                    // ── Portfolio Section (Edge-to-Edge Telegram Grid) ─────
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                      child: Row(
                        children: [
                          const Icon(Icons.photo_library_rounded, size: 20, color: Color(0xFF34C759)),
                          const SizedBox(width: 8),
                          Text(
                            tr('portfolio'),
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.text),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '(${_portfolio.length})',
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.muted),
                          ),
                          const Spacer(),
                          if (isOwnProfile)
                            InkWell(
                              onTap: _pickPortfolioPhoto,
                              borderRadius: BorderRadius.circular(8),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: AppColors.accent.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(Icons.add_photo_alternate_outlined, size: 16, color: AppColors.accent),
                                    const SizedBox(width: 4),
                                    Text(
                                      tr('portfolio_add'),
                                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.accent),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),

                    if (_portfolio.isEmpty && !_portfolioUploading)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 24),
                        child: Center(
                          child: Text(
                            tr('portfolio_empty'),
                            style: const TextStyle(color: AppColors.muted, fontSize: 13),
                          ),
                        ),
                      )
                    else
                      GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        padding: EdgeInsets.zero,
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 3,
                          crossAxisSpacing: 1.5,
                          mainAxisSpacing: 1.5,
                        ),
                        itemCount: _portfolio.length + (_portfolioUploading ? 1 : 0),
                        itemBuilder: (ctx, i) {
                          if (_portfolioUploading && i == 0) {
                            return Container(
                              color: AppColors.border.withValues(alpha: 0.3),
                              child: const Center(
                                child: SizedBox(
                                  width: 24,
                                  height: 24,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                ),
                              ),
                            );
                          }
                          final idx = _portfolioUploading ? i - 1 : i;
                          final url = _portfolio[idx];
                          return GestureDetector(
                            onTap: () {
                              AppHaptics.light();
                              _openGalleryViewer(idx);
                            },
                            onLongPress: !isOwnProfile
                                ? null
                                : () async {
                                    AppHaptics.medium();
                                    final confirm = await showDialog<bool>(
                                      context: context,
                                      builder: (ctx) => AlertDialog(
                                        title: Text(tr('confirm_delete')),
                                        actions: [
                                          TextButton(
                                            onPressed: () => Navigator.of(ctx).pop(false),
                                            child: Text(tr('cancel')),
                                          ),
                                          ElevatedButton(
                                            style: ElevatedButton.styleFrom(backgroundColor: AppColors.red),
                                            onPressed: () => Navigator.of(ctx).pop(true),
                                            child: Text(tr('delete')),
                                          ),
                                        ],
                                      ),
                                    );
                                    if (confirm == true) {
                                      final userId = Supabase.instance.client.auth.currentUser?.id ?? '';
                                      await _repo.deletePortfolioImage(userId, url);
                                      _load();
                                    }
                                  },
                            child: AppCachedImage(
                              imageUrl: url,
                              fit: BoxFit.cover,
                            ),
                          );
                        },
                      ),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
        );
  }

  void _openGalleryViewer(int initialIndex) {
    final user = Supabase.instance.client.auth.currentUser;
    final isOwn = widget.userId == null || widget.userId == user?.id;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (ctx) => _PortfolioGalleryViewer(
          images: _portfolio,
          initialIndex: initialIndex,
          isOwnProfile: isOwn,
          onDelete: (url) async {
            final userId = Supabase.instance.client.auth.currentUser?.id ?? '';
            await _repo.deletePortfolioImage(userId, url);
            _load();
          },
        ),
      ),
    );
  }
}

class _PortfolioGalleryViewer extends StatefulWidget {
  final List<String> images;
  final int initialIndex;
  final bool isOwnProfile;
  final Future<void> Function(String url) onDelete;

  const _PortfolioGalleryViewer({
    required this.images,
    required this.initialIndex,
    required this.isOwnProfile,
    required this.onDelete,
  });

  @override
  State<_PortfolioGalleryViewer> createState() =>
      _PortfolioGalleryViewerState();
}

class _PortfolioGalleryViewerState extends State<_PortfolioGalleryViewer> {
  late PageController _controller;
  late int _currentIndex;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    _controller = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text(
          '${_currentIndex + 1} / ${widget.images.length}',
          style: const TextStyle(
              color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
        ),
        actions: [
          if (widget.isOwnProfile)
            IconButton(
              icon: const Icon(Icons.delete_outline_rounded,
                  color: AppColors.red),
              onPressed: () async {
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (d) => AlertDialog(
                    title: Text(tr('confirm_delete')),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.of(d).pop(false),
                          child: Text(tr('cancel'))),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.red),
                        onPressed: () => Navigator.of(d).pop(true),
                        child: Text(tr('delete')),
                      ),
                    ],
                  ),
                );
                if (confirm == true) {
                  final urlToDelete = widget.images[_currentIndex];
                  await widget.onDelete(urlToDelete);
                  if (mounted) Navigator.of(context).pop();
                }
              },
            ),
        ],
      ),
      body: PageView.builder(
        controller: _controller,
        itemCount: widget.images.length,
        onPageChanged: (i) => setState(() => _currentIndex = i),
        itemBuilder: (ctx, i) {
          return InteractiveViewer(
            child: Center(
              child: AppCachedImage(
                imageUrl: widget.images[i],
                fit: BoxFit.contain,
              ),
            ),
          );
        },
      ),
    );
  }
}

class _TelegramIconBadge extends StatelessWidget {
  final IconData icon;
  final Color color;

  const _TelegramIconBadge({
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 30,
      height: 30,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(7),
      ),
      child: Icon(
        icon,
        color: Colors.white,
        size: 17,
      ),
    );
  }
}

class _TelegramTile extends StatelessWidget {
  final Widget leading;
  final String title;
  final Color? titleColor;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  const _TelegramTile({
    required this.leading,
    required this.title,
    this.titleColor,
    this.subtitle,
    this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            leading,
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: titleColor ?? AppColors.text,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle!,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.muted,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      ),
    );
  }
}

class _TelegramGroupCard extends StatelessWidget {
  final List<Widget> children;
  final String? headerTitle;

  const _TelegramGroupCard({
    required this.children,
    this.headerTitle,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (headerTitle != null) ...[
          Padding(
            padding: const EdgeInsets.only(left: 16, bottom: 6, top: 4),
            child: Text(
              headerTitle!.toUpperCase(),
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.muted,
                letterSpacing: 0.5,
              ),
            ),
          ),
        ],
        Container(
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            children: [
              for (int i = 0; i < children.length; i++) ...[
                children[i],
                if (i < children.length - 1)
                  const Padding(
                    padding: EdgeInsets.only(left: 60),
                    child: Divider(height: 1, thickness: 0.8, color: AppColors.border),
                  ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _StatCol extends StatelessWidget {
  final String label;
  final String value;
  const _StatCol({required this.label, required this.value});
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(value, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.text)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
        ],
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(width: 1, height: 28, color: AppColors.border);
  }
}


