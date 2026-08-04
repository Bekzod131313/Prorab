import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../main.dart';
import '../l10n/strings.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  print("Background message received: ${message.messageId}");
}

class NotificationService {
  static final _messaging = FirebaseMessaging.instance;
  static String? _lastSubscribedUserId;

  static Future<void> initialize() async {
    // 1. Set background message handler
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // 2. Request notification permissions
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    print('User notification permission status: ${settings.authorizationStatus}');

    if (settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional) {
      // Set presentation options for iOS when app is in foreground
      await _messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );

      // 3. Get FCM token
      await _refreshToken();

      // 4. Setup foreground notification listener
      _setupForegroundListener();

      // 5. Handle app opened via notification clicks
      _setupInteractionListeners();

      // 6. Subscribe to topics based on active language
      await updateTopicSubscriptions(appLocaleNotifier.value);

      // Listen for language changes at runtime and update subscriptions
      appLocaleNotifier.addListener(() {
        updateTopicSubscriptions(appLocaleNotifier.value);
      });

      // Also attempt syncing immediately if user is already logged in
      await syncUserTokenAndSubscriptions();

      // 7. Listen for auth state changes to update subscriptions and tokens
      supabase.auth.onAuthStateChange.listen((data) async {
        final event = data.event;
        if (event == AuthChangeEvent.signedOut) {
          await _unsubscribeFromAll();
        } else {
          await syncUserTokenAndSubscriptions();
        }
      });
    }
  }

  static Future<void> syncUserTokenAndSubscriptions() async {
    final userId = supabase.auth.currentUser?.id;
    if (userId != null) {
      await _refreshToken();
      await updateTopicSubscriptions(appLocaleNotifier.value);
    }
  }

  static Future<void> updateTopicSubscriptions(String lang) async {
    try {
      final userId = supabase.auth.currentUser?.id;

      if (lang == 'uz') {
        await _messaging.subscribeToTopic('all_uz');
        await _messaging.unsubscribeFromTopic('all_ru');
        await _messaging.unsubscribeFromTopic('all_en');
        print("Subscribed to all_uz, unsubscribed from all_ru and all_en");

        if (userId != null) {
          await _messaging.subscribeToTopic('user_${userId}_uz');
          await _messaging.unsubscribeFromTopic('user_${userId}_ru');
          await _messaging.unsubscribeFromTopic('user_${userId}_en');
          print("Subscribed to user_${userId}_uz");
          _lastSubscribedUserId = userId;
        }
      } else if (lang == 'ru') {
        await _messaging.subscribeToTopic('all_ru');
        await _messaging.unsubscribeFromTopic('all_uz');
        await _messaging.unsubscribeFromTopic('all_en');
        print("Subscribed to all_ru, unsubscribed from all_uz and all_en");

        if (userId != null) {
          await _messaging.subscribeToTopic('user_${userId}_ru');
          await _messaging.unsubscribeFromTopic('user_${userId}_uz');
          await _messaging.unsubscribeFromTopic('user_${userId}_en');
          print("Subscribed to user_${userId}_ru");
          _lastSubscribedUserId = userId;
        }
      } else if (lang == 'en') {
        await _messaging.subscribeToTopic('all_en');
        await _messaging.unsubscribeFromTopic('all_uz');
        await _messaging.unsubscribeFromTopic('all_ru');
        print("Subscribed to all_en, unsubscribed from all_uz and all_ru");

        if (userId != null) {
          await _messaging.subscribeToTopic('user_${userId}_en');
          await _messaging.unsubscribeFromTopic('user_${userId}_uz');
          await _messaging.unsubscribeFromTopic('user_${userId}_ru');
          print("Subscribed to user_${userId}_en");
          _lastSubscribedUserId = userId;
        }
      }

      // If we have an old user ID tracked and it changed, clean up its old subscriptions
      if (userId != null && _lastSubscribedUserId != null && _lastSubscribedUserId != userId) {
        await _messaging.unsubscribeFromTopic('user_${_lastSubscribedUserId}_uz');
        await _messaging.unsubscribeFromTopic('user_${_lastSubscribedUserId}_ru');
        await _messaging.unsubscribeFromTopic('user_${_lastSubscribedUserId}_en');
        print("Unsubscribed from old user topics for: $_lastSubscribedUserId");
        _lastSubscribedUserId = userId;
      }
    } catch (e) {
      print("Error updating topic subscriptions: $e");
    }
  }

  static Future<void> _unsubscribeFromAll() async {
    try {
      await _messaging.unsubscribeFromTopic('all_uz');
      await _messaging.unsubscribeFromTopic('all_ru');
      await _messaging.unsubscribeFromTopic('all_en');
      print("Unsubscribed from all_uz, all_ru, and all_en");

      if (_lastSubscribedUserId != null) {
        await _messaging.unsubscribeFromTopic('user_${_lastSubscribedUserId}_uz');
        await _messaging.unsubscribeFromTopic('user_${_lastSubscribedUserId}_ru');
        await _messaging.unsubscribeFromTopic('user_${_lastSubscribedUserId}_en');
        print("Unsubscribed from user_${_lastSubscribedUserId}_*");
        _lastSubscribedUserId = null;
      }
    } catch (e) {
      print("Error unsubscribing from topics: $e");
    }
  }

  static Future<void> _refreshToken() async {
    try {
      // On iOS, fetch APNs token first to establish Apple Push Notification registration
      try {
        final apnsToken = await _messaging.getAPNSToken();
        print("APNs Token: $apnsToken");
      } catch (apnsErr) {
        print("APNs Token fetch error: $apnsErr");
      }

      final token = await _messaging.getToken();
      print("FCM Token: $token");

      final userId = supabase.auth.currentUser?.id;
      if (userId != null && token != null) {
        await supabase.from('profiles').update({'fcm_token': token}).eq('id', userId);
        print("FCM Token successfully saved to profile.");
      }
    } catch (e) {
      print("Error refreshing FCM token: $e");
    }
  }

  static void _setupForegroundListener() {
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      print('Foreground message received: ${message.notification?.title}');
      
      final title = message.notification?.title ?? "Bildirishnoma";
      final body = message.notification?.body ?? "";
      
      _showSnackbarNotification(title, body);
    });
  }

  static void _setupInteractionListeners() {
    // Tapped when app was in background (but not terminated)
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      print('Notification tapped (app was backgrounded): ${message.data}');
    });

    // Check if app was opened from a completely terminated state via a notification click
    _messaging.getInitialMessage().then((RemoteMessage? message) {
      if (message != null) {
        print('Notification tapped (app was terminated): ${message.data}');
      }
    });
  }

  static void _showSnackbarNotification(String title, String body) {
    final context = navigatorKey.currentContext;
    if (context != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              const SizedBox(height: 2),
              Text(body, style: const TextStyle(fontSize: 12)),
            ],
          ),
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 4),
        ),
      );
    }
  }
}
