import 'package:flutter/material.dart';

import '../data/session_repository.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../widgets/shimmer.dart';

class ActiveDevicesScreen extends StatefulWidget {
  const ActiveDevicesScreen({super.key});

  @override
  State<ActiveDevicesScreen> createState() => _ActiveDevicesScreenState();
}

class _ActiveDevicesScreenState extends State<ActiveDevicesScreen> {
  final _sessionRepo = SessionRepository();
  bool _loading = true;
  List<UserDevice> _devices = [];

  @override
  void initState() {
    super.initState();
    _loadDevices();
  }

  Future<void> _loadDevices() async {
    setState(() => _loading = true);
    await _sessionRepo.registerCurrentDevice();
    final list = await _sessionRepo.getActiveDevices();
    if (mounted) {
      setState(() {
        _devices = list;
        _loading = false;
      });
    }
  }

  IconData _getDeviceIcon(String osName, String deviceType) {
    if (deviceType == 'web') return Icons.language_rounded;
    if (osName.contains('iOS') || osName.contains('iPhone')) return Icons.phone_iphone_rounded;
    if (osName.contains('Android')) return Icons.phone_android_rounded;
    if (osName.contains('macOS') || osName.contains('Mac')) return Icons.laptop_mac_rounded;
    return Icons.devices_other_rounded;
  }

  @override
  Widget build(BuildContext context) {
    final currentDevice = _devices.firstWhere(
      (d) => d.isCurrent,
      orElse: () => UserDevice(
        id: 'curr',
        userId: '',
        deviceName: 'Joriy qurilma',
        deviceType: 'mobile',
        osName: 'Mobile App',
        lastActive: DateTime.now(),
        isCurrent: true,
      ),
    );

    final otherDevices = _devices.where((d) => !d.isCurrent).toList();

    return ValueListenableBuilder<String>(
      valueListenable: appLocaleNotifier,
      builder: (_, __, ___) => Scaffold(
        backgroundColor: AppColors.bg,
        appBar: AppBar(
          backgroundColor: AppColors.bg,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: AppColors.text),
            onPressed: () => Navigator.of(context).pop(),
          ),
          title: Text(
            tr('active_devices'),
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.text),
          ),
          centerTitle: true,
        ),
        body: SafeArea(
          child: _loading
              ? const Padding(
                  padding: EdgeInsets.all(16),
                  child: Column(
                    children: [
                      ShimmerBox(height: 100, borderRadius: 16),
                      SizedBox(height: 20),
                      ShimmerBox(height: 160, borderRadius: 16),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadDevices,
                  child: ListView(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    children: [
                      // ── Current Device Section ─────────────────────────────
                      Padding(
                        padding: const EdgeInsets.only(left: 4, bottom: 8),
                        child: Text(
                          tr('current_device').toUpperCase(),
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: AppColors.muted,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: AppColors.card,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: AppColors.border, width: 1),
                        ),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: AppColors.accent.withValues(alpha: 0.12),
                                shape: BoxShape.circle,
                              ),
                              child: Icon(
                                _getDeviceIcon(currentDevice.osName, currentDevice.deviceType),
                                color: AppColors.accent,
                                size: 24,
                              ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          currentDevice.deviceName,
                                          style: const TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.w700,
                                            color: AppColors.text,
                                          ),
                                        ),
                                      ),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFF34C759).withValues(alpha: 0.12),
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            Container(
                                              width: 6,
                                              height: 6,
                                              decoration: const BoxDecoration(
                                                color: Color(0xFF34C759),
                                                shape: BoxShape.circle,
                                              ),
                                            ),
                                            const SizedBox(width: 5),
                                            Text(
                                              tr('currently_active'),
                                              style: const TextStyle(
                                                fontSize: 11,
                                                fontWeight: FontWeight.w700,
                                                color: Color(0xFF34C759),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${currentDevice.osName}${currentDevice.location != null ? ' • ${currentDevice.location}' : ''}',
                                    style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w500,
                                      color: AppColors.muted,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 24),

                      // ── Other Devices Section ──────────────────────────────
                      Padding(
                        padding: const EdgeInsets.only(left: 4, bottom: 8),
                        child: Text(
                          tr('other_devices').toUpperCase(),
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: AppColors.muted,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),

                      if (otherDevices.isEmpty)
                        Container(
                          padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 20),
                          decoration: BoxDecoration(
                            color: AppColors.card,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: AppColors.border, width: 1),
                          ),
                          child: Column(
                            children: [
                              Icon(
                                Icons.phonelink_off_rounded,
                                size: 40,
                                color: AppColors.muted.withValues(alpha: 0.6),
                              ),
                              const SizedBox(height: 10),
                              Text(
                                tr('no_other_devices'),
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.muted,
                                ),
                                textAlign: TextAlign.center,
                              ),
                            ],
                          ),
                        )
                      else
                        Container(
                          decoration: BoxDecoration(
                            color: AppColors.card,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: AppColors.border, width: 1),
                          ),
                          child: ListView.separated(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            itemCount: otherDevices.length,
                            separatorBuilder: (_, __) => Divider(
                              height: 1,
                              color: AppColors.border.withValues(alpha: 0.6),
                              indent: 52,
                            ),
                            itemBuilder: (ctx, idx) {
                              final dev = otherDevices[idx];
                              return ListTile(
                                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                                leading: Container(
                                  padding: const EdgeInsets.all(10),
                                  decoration: const BoxDecoration(
                                    color: AppColors.bg,
                                    shape: BoxShape.circle,
                                  ),
                                  child: Icon(
                                    _getDeviceIcon(dev.osName, dev.deviceType),
                                    color: AppColors.muted,
                                    size: 20,
                                  ),
                                ),
                                title: Text(
                                  dev.deviceName,
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.text,
                                  ),
                                ),
                                subtitle: Text(
                                  '${dev.osName}${dev.location != null ? ' • ${dev.location}' : ''}',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.muted,
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                    ],
                  ),
                ),
        ),
      ),
    );
  }
}
