import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../console_theme.dart';

Path consoleOutline(Rect r, ConsoleTheme theme) {
  if (!theme.chamfered) {
    return Path()..addRRect(
      RRect.fromRectAndRadius(r, Radius.circular(theme.plain ? 8 : 12)),
    );
  }
  final cut = math.min(10.0, r.shortestSide / 4);
  return Path()
    ..moveTo(r.left + cut, r.top)
    ..lineTo(r.right - cut, r.top)
    ..lineTo(r.right, r.top + cut)
    ..lineTo(r.right, r.bottom - cut)
    ..lineTo(r.right - cut, r.bottom)
    ..lineTo(r.left + cut, r.bottom)
    ..lineTo(r.left, r.bottom - cut)
    ..lineTo(r.left, r.top + cut)
    ..close();
}
