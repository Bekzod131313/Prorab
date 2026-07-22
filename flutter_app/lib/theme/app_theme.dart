import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  // Light theme colors with high contrast for maximum senior readability
  static const bg = Color(0xFFF1F5F9);
  static const card = Colors.white;
  static const border = Color(0xFFCBD5E1);
  static const text = Color(0xFF0F172A);
  static const text2 = Color(0xFF334155);
  static const muted = Color(0xFF64748B);
  static const accent = Color(0xFF1D4ED8);
  static const accent2 = Color(0xFF1E40AF);
  static const accentTeal = Color(0xFF0D9488);
  static const accentTeal2 = Color(0xFF0F766E);
  static const green = Color(0xFF16A34A);
  static const red = Color(0xFFDC2626);
  static const orange = Color(0xFFD97706);

  static const gradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [accent, accentTeal],
  );
}

class AppTheme {
  static ThemeData get light {
    final base = ThemeData.light(useMaterial3: true);
    final rawTextTheme = GoogleFonts.montserratTextTheme(base.textTheme);

    final textTheme = rawTextTheme.copyWith(
      displayLarge: rawTextTheme.displayLarge?.copyWith(fontWeight: FontWeight.w800, color: AppColors.text),
      displayMedium: rawTextTheme.displayMedium?.copyWith(fontWeight: FontWeight.w800, color: AppColors.text),
      displaySmall: rawTextTheme.displaySmall?.copyWith(fontWeight: FontWeight.w700, color: AppColors.text),
      headlineLarge: rawTextTheme.headlineLarge?.copyWith(fontWeight: FontWeight.w800, color: AppColors.text),
      headlineMedium: rawTextTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700, color: AppColors.text),
      headlineSmall: rawTextTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700, color: AppColors.text),
      titleLarge: rawTextTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800, fontSize: 20, color: AppColors.text),
      titleMedium: rawTextTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700, fontSize: 17, color: AppColors.text),
      titleSmall: rawTextTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700, fontSize: 15, color: AppColors.text2),
      bodyLarge: rawTextTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600, fontSize: 17, color: AppColors.text),
      bodyMedium: rawTextTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600, fontSize: 15, color: AppColors.text),
      bodySmall: rawTextTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.muted),
      labelLarge: rawTextTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700, fontSize: 15, color: AppColors.text),
      labelMedium: rawTextTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.text2),
      labelSmall: rawTextTheme.labelSmall?.copyWith(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.muted),
    );

    return base.copyWith(
      scaffoldBackgroundColor: AppColors.bg,
      textTheme: textTheme,
      colorScheme: base.colorScheme.copyWith(
        primary: AppColors.accent,
        secondary: AppColors.accentTeal,
        surface: Colors.white,
        onSurface: AppColors.text,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.text,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: TextStyle(
          color: AppColors.text,
          fontSize: 20,
          fontWeight: FontWeight.w800,
        ),
        iconTheme: IconThemeData(color: AppColors.text, size: 24),
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.border, width: 1.2),
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: Colors.white,
        selectedItemColor: AppColors.accent,
        unselectedItemColor: AppColors.muted,
        selectedLabelStyle: TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
        unselectedLabelStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.bg,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.border, width: 1.2),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.border, width: 1.2),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.accent, width: 2),
        ),
        hintStyle: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w500, fontSize: 15),
        labelStyle: const TextStyle(color: AppColors.text2, fontWeight: FontWeight.w700, fontSize: 15),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.accent,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
          elevation: 0,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.accent,
          side: const BorderSide(color: AppColors.border, width: 1.5),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          padding: const EdgeInsets.symmetric(vertical: 16),
          textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
        ),
      ),
      dividerTheme:
          const DividerThemeData(color: AppColors.border, thickness: 1.2),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.bg,
        selectedColor: AppColors.accent.withOpacity(0.12),
        labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.text),
        side: const BorderSide(color: AppColors.border, width: 1.2),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      popupMenuTheme: const PopupMenuThemeData(
        color: Colors.white,
        elevation: 4,
        shadowColor: Color(0x1A000000),
      ),
      dialogTheme: const DialogThemeData(
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(20)),
        ),
        actionsPadding: EdgeInsets.fromLTRB(16, 0, 16, 16),
      ),
      dropdownMenuTheme: const DropdownMenuThemeData(
        menuStyle:
            MenuStyle(backgroundColor: WidgetStatePropertyAll(Colors.white)),
      ),
    );
  }

  // Keep dark as alias for backwards compat
  static ThemeData get dark => light;
}
