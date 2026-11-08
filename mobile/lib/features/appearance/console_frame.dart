import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../console_theme.dart';
import 'console_geometry.dart';

class ConsoleFrostPainter extends CustomPainter {
  final ConsoleTheme theme;
  const ConsoleFrostPainter(this.theme);

  @override
  void paint(Canvas canvas, Size size) {
    if (theme.id != 'icy' || size.isEmpty) return;
    final frost = Paint()
      ..color = const Color(0xffd9f8ff).withValues(alpha: .16)
      ..strokeWidth = 1
      ..strokeCap = StrokeCap.round;
    for (final corner in [
      (Offset.zero, 1.0, 1.0),
      (Offset(size.width, 0), -1.0, 1.0),
      (Offset(0, size.height), 1.0, -1.0),
      (Offset(size.width, size.height), -1.0, -1.0),
    ]) {
      final origin = corner.$1 + Offset(corner.$2 * 5, corner.$3 * 5);
      final x = Offset(corner.$2 * 24, corner.$3 * 10);
      final y = Offset(corner.$2 * 10, corner.$3 * 24);
      canvas.drawLine(origin, origin + x, frost);
      canvas.drawLine(origin, origin + y, frost);
      canvas.drawLine(origin + x * .4, origin + x * .4 + y * .42, frost);
      canvas.drawLine(origin + y * .4, origin + y * .4 + x * .42, frost);
    }
  }

  @override
  bool shouldRepaint(ConsoleFrostPainter old) => old.theme.id != theme.id;
}

const _spectrum = [
  Color(0xffff577f),
  Color(0xffffcd56),
  Color(0xff45ed98),
  Color(0xff00e5ff),
  Color(0xff7b7bff),
  Color(0xffff5db4),
  Color(0xffff577f),
];

class _Shift extends GradientTransform {
  final double dx;
  const _Shift(this.dx);
  @override
  Matrix4 transform(Rect bounds, {TextDirection? textDirection}) =>
      Matrix4.translationValues(dx, 0, 0);
}

/// Keyboard-style lighting on the frame: static, breathing, a travelling
/// wave, a full spectrum cycle or a flash when output arrives.
class ConsoleFramePainter extends CustomPainter {
  final ConsoleAppearance appearance;
  final Animation<double> phase, react;
  final String? sessionState;
  final bool effectsEnabled, motionEnabled;
  ConsoleFramePainter(
    this.appearance,
    this.phase,
    this.react,
    Listenable repaint, {
    required this.sessionState,
    required this.effectsEnabled,
    required this.motionEnabled,
  }) : super(repaint: repaint);
  ConsoleTheme get theme => appearance.theme;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.shortestSide < 16) return;
    final rect = (Offset.zero & size).deflate(5);
    final path = consoleOutline(rect, theme);
    final seconds = phase.value * 60, speed = appearance.speed;
    var a = theme.primary, b = theme.secondary, glow = .25, width = 1.2;
    var colors = theme.id == 'gamer' ? _spectrum : [a, b];
    switch (appearance.lighting) {
      case 'breathe':
        glow =
            .1 +
            .55 * (.5 + .5 * math.sin(seconds * math.pi * 2 / (4 * speed)));
        width = 2;
      case 'spectrum':
        final hue = (seconds * 36 / speed) % 360;
        a = HSVColor.fromAHSV(1, hue, .65, 1).toColor();
        b = HSVColor.fromAHSV(1, (hue + 50) % 360, .7, 1).toColor();
        colors = [a, b];
        glow = .35;
        width = 2;
      case 'wave':
        width = 2;
        glow = .3;
      case 'reactive':
        glow = .15 + .7 * (1 - react.value);
        width = 1.2 + 1.3 * (1 - react.value);
    }
    canvas.save();
    canvas.clipRect(Offset.zero & size);
    if (!theme.plain) {
      canvas.drawPath(
        path,
        Paint()
          ..color = b.withValues(alpha: glow)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 4
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5),
      );
    }
    canvas.drawPath(path, Paint()..color = theme.background);
    final border = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = width;
    if (appearance.lighting == 'wave') {
      final length = size.width * .9;
      final wave = theme.id == 'gamer'
          ? _spectrum
          : [a, Color.lerp(b, Colors.black, .2)!, a];
      border.shader = LinearGradient(
        colors: wave,
        tileMode: TileMode.repeated,
        transform: _Shift((seconds / (5 * speed)) * length % length),
      ).createShader(Rect.fromLTWH(0, 0, length, size.height));
    } else if (theme.id == 'gamer' && appearance.lighting == 'static') {
      border.shader = const SweepGradient(colors: _spectrum).createShader(rect);
    } else {
      final alpha = appearance.lighting == 'breathe'
          ? .35 + glow
          : theme.plain
          ? .32
          : .85;
      border.shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: colors
            .map((c) => c.withValues(alpha: alpha.clamp(0, 1)))
            .toList(),
      ).createShader(rect);
    }
    canvas.drawPath(path, border);
    // Redline: red slashes on the trim, like a weapon skin.
    if (theme.solid) {
      final slash = Paint()
        ..color = theme.primary
        ..strokeWidth = 4;
      final w = rect.width * .3;
      canvas.drawLine(
        rect.topLeft + const Offset(18, 1),
        rect.topLeft + Offset(18 + w, 1),
        slash,
      );
      canvas.drawLine(
        rect.bottomRight - const Offset(18, 1),
        rect.bottomRight - Offset(18 + w, 1),
        slash,
      );
    }
    if (effectsEnabled && theme.id == 'fiery' && sessionState == 'active') {
      final lava = Paint()
        ..shader = LinearGradient(
          colors: [
            Colors.transparent,
            const Color(0xffff5428).withValues(alpha: .8),
            const Color(0xffffc02d).withValues(alpha: .9),
            const Color(0xffff5428).withValues(alpha: .8),
            Colors.transparent,
          ],
        ).createShader(Rect.fromLTWH(rect.left, rect.bottom - 2, rect.width, 3))
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2);
      canvas.drawLine(
        Offset(rect.left + 8, rect.bottom - 1),
        Offset(rect.right - 8, rect.bottom - 1),
        lava,
      );
    }
    if (motionEnabled &&
        effectsEnabled &&
        theme.id == 'gamer' &&
        appearance.lighting == 'wave') {
      final travel = (seconds / (5 * speed)) % 1;
      final sparkle = Offset(rect.left + rect.width * travel, rect.bottom - 1);
      canvas.drawCircle(
        sparkle,
        5,
        Paint()
          ..color = Colors.white.withValues(alpha: .28)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
      );
      canvas.drawCircle(
        sparkle,
        1.8,
        Paint()..color = Colors.white.withValues(alpha: .95),
      );
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(ConsoleFramePainter old) =>
      old.appearance != appearance ||
      old.sessionState != sessionState ||
      old.effectsEnabled != effectsEnabled ||
      old.motionEnabled != motionEnabled;
}

// Fixed normalized positions survive theme changes and resizing.
