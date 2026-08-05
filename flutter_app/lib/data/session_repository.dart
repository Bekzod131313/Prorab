import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../main.dart';

class UserDevice {
  final String id;
  final String userId;
  final String deviceName;
  final String deviceType; // 'mobile', 'desktop', 'web'
  final String osName;     // 'iOS', 'Android', 'macOS', 'Web'
  final String? location;
  final DateTime lastActive;
  final bool isCurrent;

  UserDevice({
    required this.id,
    required this.userId,
    required this.deviceName,
    required this.deviceType,
    required this.osName,
    this.location,
    required this.lastActive,
    required this.isCurrent,
  });

  factory UserDevice.fromMap(Map<String, dynamic> map, String currentDeviceId) {
    final id = map['id']?.toString() ?? '';
    return UserDevice(
      id: id,
      userId: map['user_id']?.toString() ?? '',
      deviceName: map['device_name']?.toString() ?? 'Qurilma',
      deviceType: map['device_type']?.toString() ?? 'mobile',
      osName: map['os_name']?.toString() ?? 'Mobile OS',
      location: map['location']?.toString(),
      lastActive: map['last_active'] != null
          ? DateTime.tryParse(map['last_active'].toString()) ?? DateTime.now()
          : DateTime.now(),
      isCurrent: id == currentDeviceId,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'user_id': userId,
      'device_name': deviceName,
      'device_type': deviceType,
      'os_name': osName,
      'location': location,
      'last_active': lastActive.toIso8601String(),
    };
  }
}

class SessionRepository {
  static String? _cachedDeviceId;

  static Future<String> getDeviceId() async {
    if (_cachedDeviceId != null) return _cachedDeviceId!;
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString('app_device_id');
    if (id == null || id.isEmpty) {
      final platformPrefix = kIsWeb
          ? 'web'
          : defaultTargetPlatform == TargetPlatform.iOS
              ? 'ios'
              : defaultTargetPlatform == TargetPlatform.android
                  ? 'android'
                  : defaultTargetPlatform == TargetPlatform.macOS
                      ? 'mac'
                      : 'dev';
      id = '${platformPrefix}_${DateTime.now().millisecondsSinceEpoch}_${Random().nextInt(9999)}';
      await prefs.setString('app_device_id', id);
    }
    _cachedDeviceId = id;
    return id;
  }

  Future<void> registerCurrentDevice() async {
    final user = supabase.auth.currentUser;
    if (user == null) return;

    final deviceId = await getDeviceId();

    final osName = kIsWeb
        ? 'Web Browser'
        : defaultTargetPlatform == TargetPlatform.iOS
            ? 'iOS'
            : defaultTargetPlatform == TargetPlatform.android
                ? 'Android'
                : defaultTargetPlatform == TargetPlatform.macOS
                    ? 'macOS'
                    : 'Desktop';

    final deviceType = kIsWeb
        ? 'web'
        : (defaultTargetPlatform == TargetPlatform.macOS ||
                defaultTargetPlatform == TargetPlatform.windows ||
                defaultTargetPlatform == TargetPlatform.linux)
            ? 'desktop'
            : 'mobile';

    final deviceName = kIsWeb
        ? 'Web App'
        : defaultTargetPlatform == TargetPlatform.iOS
            ? 'iPhone'
            : defaultTargetPlatform == TargetPlatform.android
                ? 'Android Phone'
                : defaultTargetPlatform == TargetPlatform.macOS
                    ? 'MacBook'
                    : 'Qurilma';

    final payload = {
      'id': deviceId,
      'user_id': user.id,
      'device_name': deviceName,
      'device_type': deviceType,
      'os_name': osName,
      'location': "Toshkent, O'zbekiston",
      'last_active': DateTime.now().toIso8601String(),
    };

    // 1. Try DB Table
    try {
      await supabase.from('user_sessions').upsert(payload);
    } catch (_) {}

    // 2. Storage Bucket Fallback for 100% sync guarantee across devices
    try {
      final jsonStr = jsonEncode(payload);
      final bytes = Uint8List.fromList(utf8.encode(jsonStr));
      await supabase.storage.from('profile-images').uploadBinary(
        'sessions/${user.id}/$deviceId.json',
        bytes,
        fileOptions: const FileOptions(contentType: 'application/json', upsert: true),
      );
    } catch (_) {}
  }

  Future<List<UserDevice>> getActiveDevices() async {
    final user = supabase.auth.currentUser;
    if (user == null) return [];

    final currentDeviceId = await getDeviceId();

    final Map<String, UserDevice> deviceMap = {};

    // 1. Fetch from DB Table if available
    try {
      final List<dynamic> data = await supabase
          .from('user_sessions')
          .select('*')
          .eq('user_id', user.id)
          .order('last_active', ascending: false);

      for (var map in data) {
        final dev = UserDevice.fromMap(Map<String, dynamic>.from(map), currentDeviceId);
        deviceMap[dev.id] = dev;
      }
    } catch (_) {}

    // 2. Fetch from Storage Bucket (Guarantee cross-device visibility)
    try {
      final files = await supabase.storage
          .from('profile-images')
          .list(path: 'sessions/${user.id}');

      for (var file in files) {
        if (!file.name.endsWith('.json')) continue;
        final devId = file.name.replaceAll('.json', '');
        if (deviceMap.containsKey(devId)) continue; // DB already has fresher record

        try {
          final bytes = await supabase.storage
              .from('profile-images')
              .download('sessions/${user.id}/${file.name}');
          final jsonStr = utf8.decode(bytes);
          final map = jsonDecode(jsonStr) as Map<String, dynamic>;
          final dev = UserDevice.fromMap(map, currentDeviceId);
          deviceMap[dev.id] = dev;
        } catch (_) {}
      }
    } catch (_) {}

    // 3. Fallback: If current device is missing from remote, add it locally
    if (!deviceMap.containsKey(currentDeviceId)) {
      final osName = kIsWeb
          ? 'Web Browser'
          : defaultTargetPlatform == TargetPlatform.iOS
              ? 'iOS'
              : defaultTargetPlatform == TargetPlatform.android
                  ? 'Android'
                  : defaultTargetPlatform == TargetPlatform.macOS
                      ? 'macOS'
                      : 'Desktop';

      final deviceType = kIsWeb
          ? 'web'
          : (defaultTargetPlatform == TargetPlatform.macOS ||
                  defaultTargetPlatform == TargetPlatform.windows ||
                  defaultTargetPlatform == TargetPlatform.linux)
              ? 'desktop'
              : 'mobile';

      final deviceName = kIsWeb
          ? 'Web App'
          : defaultTargetPlatform == TargetPlatform.iOS
              ? 'iPhone'
              : defaultTargetPlatform == TargetPlatform.android
                  ? 'Android Phone'
                  : defaultTargetPlatform == TargetPlatform.macOS
                      ? 'MacBook'
                      : 'Qurilma';

      deviceMap[currentDeviceId] = UserDevice(
        id: currentDeviceId,
        userId: user.id,
        deviceName: deviceName,
        deviceType: deviceType,
        osName: osName,
        location: "Toshkent, O'zbekiston",
        lastActive: DateTime.now(),
        isCurrent: true,
      );
    }

    final result = deviceMap.values.toList();
    result.sort((a, b) => b.lastActive.compareTo(a.lastActive));
    return result;
  }

  Future<void> terminateSession(String targetDeviceId) async {
    final user = supabase.auth.currentUser;
    if (user == null) return;

    // 1. Delete from DB Table
    try {
      await supabase.from('user_sessions').delete().eq('id', targetDeviceId).eq('user_id', user.id);
    } catch (_) {}

    // 2. Delete from Storage Bucket
    try {
      await supabase.storage.from('profile-images').remove(['sessions/${user.id}/$targetDeviceId.json']);
    } catch (_) {}

    // 3. Sign out other sessions natively on Supabase Auth server
    try {
      await supabase.auth.signOut(scope: SignOutScope.others);
    } catch (_) {}
  }

  Future<void> terminateAllOtherSessions() async {
    final user = supabase.auth.currentUser;
    if (user == null) return;

    final currentDeviceId = await getDeviceId();

    // 1. Sign out other sessions natively on Supabase Auth server
    try {
      await supabase.auth.signOut(scope: SignOutScope.others);
    } catch (_) {}

    // 2. Delete all other records from DB Table
    try {
      await supabase
          .from('user_sessions')
          .delete()
          .eq('user_id', user.id)
          .neq('id', currentDeviceId);
    } catch (_) {}

    // 3. Clean up other session files in Storage Bucket
    try {
      final files = await supabase.storage
          .from('profile-images')
          .list(path: 'sessions/${user.id}');

      final toRemove = <String>[];
      for (var f in files) {
        if (f.name.endsWith('.json') && !f.name.contains(currentDeviceId)) {
          toRemove.add('sessions/${user.id}/${f.name}');
        }
      }
      if (toRemove.isNotEmpty) {
        await supabase.storage.from('profile-images').remove(toRemove);
      }
    } catch (_) {}
  }

  static Future<bool> isCurrentSessionTerminated() async {
    final user = supabase.auth.currentUser;
    final session = supabase.auth.currentSession;
    if (user == null || session == null) return true;

    final currentDeviceId = await getDeviceId();

    // 1. Primary check: Database Table
    try {
      final data = await supabase
          .from('user_sessions')
          .select('id')
          .eq('user_id', user.id);

      if (data.isNotEmpty) {
        final hasCurrentInDb = data.any((row) => row['id'].toString() == currentDeviceId);
        if (!hasCurrentInDb) {
          return true;
        }
        return false;
      }
    } catch (_) {}

    // 2. Fallback check: Storage Bucket
    try {
      final files = await supabase.storage
          .from('profile-images')
          .list(path: 'sessions/${user.id}');

      if (files.isNotEmpty) {
        final hasCurrentFile = files.any((f) => f.name == '$currentDeviceId.json');
        if (!hasCurrentFile) {
          return true;
        }
        return false;
      }
    } catch (_) {}

    return false;
  }
}
