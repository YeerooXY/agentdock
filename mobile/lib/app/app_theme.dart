import 'package:flutter/material.dart';

import '../dock_style.dart';

/// Material theme for the active console theme's accents.
ThemeData buildDockTheme() => ThemeData(
  brightness: Brightness.dark,
  useMaterial3: true,
  scaffoldBackgroundColor: ink,
  colorScheme: ColorScheme.dark(
    primary: blue,
    secondary: pink,
    surface: Color(0xff0b0c14),
    error: Color(0xffffa7bc),
  ),
  appBarTheme: const AppBarTheme(backgroundColor: ink, centerTitle: false),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: const Color(0xff11131e),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide(color: blue.withValues(alpha: .55)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide(color: pink, width: 1.5),
    ),
  ),
  filledButtonTheme: FilledButtonThemeData(
    style: FilledButton.styleFrom(minimumSize: const Size(48, 48)),
  ),
  outlinedButtonTheme: OutlinedButtonThemeData(
    style: OutlinedButton.styleFrom(
      minimumSize: const Size(48, 48),
      side: BorderSide(color: blue.withValues(alpha: .55)),
    ),
  ),
  textButtonTheme: TextButtonThemeData(
    style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
  ),
  iconButtonTheme: IconButtonThemeData(
    style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
  ),
  navigationBarTheme: const NavigationBarThemeData(
    backgroundColor: Color(0xff090a11),
    indicatorColor: Color(0xff2b2847),
  ),
  badgeTheme: const BadgeThemeData(
    backgroundColor: Color(0xffdc3249),
    textColor: Colors.white,
  ),
);
