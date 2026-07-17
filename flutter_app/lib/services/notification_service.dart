import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import '../main.dart';
import '../l10n/strings.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  print("Background message received: ${message.messageId}");
}

class NotificationService {
  static final _messaging = FirebaseMessaging.instance;

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
    }
  }

  static Future<void> updateTopicSubscriptions(String lang) async {
    try {
      if (lang == 'uz') {
        await _messaging.subscribeToTopic('all_uz');
        await _messaging.unsubscribeFromTopic('all_ru');
        print("Subscribed to all_uz, unsubscribed from all_ru");
      } else if (lang == 'ru') {
        await _messaging.subscribeToTopic('all_ru');
        await _messaging.unsubscribeFromTopic('all_uz');
        print("Subscribed to all_ru, unsubscribed from all_uz");
      }
    } catch (e) {
      print("Error updating topic subscriptions: $e");
    }
  }

  static Future<void> _refreshToken() async {
    try {
      final token = await _messaging.getToken();
      print("FCM Token: $token");

      final userId = supabase.auth.currentUser?.id;
      if (userId != null && token != null) {
        // Update fcm_token in profiles table (wrapped in try/catch to fail gracefully if column is missing)
        await supabase.from('profiles').update({'fcm_token': token}).eq('id', userId);
        print("FCM Token successfully saved to profile.");
      }
    } catch (e) {
      print("Error refreshing FCM token: $e (This is expected if 'fcm_token' column is not yet added to 'profiles')");
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
