import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../console_theme.dart';

import 'dart:ui' as ui;

final _particles = List.generate(420, (i) {
  final random = math.Random(617 + i * 997);
  return (
    x: random.nextDouble(),
    y: random.nextDouble(),
    depth: .25 + random.nextDouble() * .75,
    radius: .6 + random.nextDouble() * 1.4,
    phase: random.nextDouble() * math.pi * 2,
    speed: .6 + random.nextDouble() * 1.8,
    bright: random.nextDouble() < .14,
    tone: i % 3,
  );
});
const _density = [0, 22, 48, 90, 150];

class ConsoleAtmospherePainter extends CustomPainter {
  final ConsoleAppearance appearance;
  final Animation<double> phase, opening;
  final bool emptyPanel;
  ConsoleAtmospherePainter(
    this.appearance,
    this.phase,
    this.opening,
    Listenable repaint, {
    this.emptyPanel = false,
  }) : super(repaint: repaint);

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    final theme = appearance.theme, rect = Offset.zero & size;
    canvas.save();
    canvas.clipRect(rect);
    if (!theme.plain) {
      canvas.drawRect(
        rect,
        Paint()
          ..shader = RadialGradient(
            center: theme.id == 'fiery'
                ? Alignment.bottomCenter
                : Alignment.topRight,
            radius: 1.1,
            colors: [
              theme.primary.withValues(alpha: theme.id == 'void' ? .04 : .075),
              theme.secondary.withValues(alpha: .018),
              Colors.transparent,
            ],
          ).createShader(rect),
      );
    }
    if (emptyPanel && theme.id == 'void') _blackHole(canvas, size);
    if (appearance.stars && !theme.solid) _sky(canvas, size, theme);
    canvas.restore();
  }

  void _sky(Canvas canvas, Size size, ConsoleTheme theme) {
    final level = appearance.starLevel, t = phase.value * 60;
    final count = (size.width * size.height / 100000 * _density[level])
        .round()
        .clamp(8, _particles.length);
    final prominence = .55 + level * .14;
    final w = size.width + 12, h = size.height + 12;
    for (var i = 0; i < count; i++) {
      final p = _particles[i];
      var x = p.x * w, y = p.y * h;
      final v = p.depth * t;
      switch (theme.sky) {
        case SkyKind.snow:
          y += v * 14;
          x += math.sin(t * .8 + p.phase) * 6;
        case SkyKind.embers:
          y -= v * 16;
          x += math.sin(t * 1.3 + p.phase) * 8;
        case SkyKind.data:
          y += v * 22;
        case SkyKind.streaks:
          x -= v * 40;
        case SkyKind.glitter when p.tone == 1:
          y -= v * 7;
          x += math.sin(t * .9 + p.phase) * 4;
        default:
          x += v * 3.2;
          y -= v * 1.1;
      }
      x = x % w - 6;
      y = y % h - 6;
      if (emptyPanel && theme.id == 'void') {
        final center = Offset(size.width / 2, size.height / 2),
            delta = Offset(x, y) - center,
            radius = delta.distance;
        if (radius > 9 && radius < 94) {
          final bend = .2 * (1 - (radius - 9) / 85),
              cosine = math.cos(bend),
              sine = math.sin(bend);
          x = center.dx + delta.dx * cosine - delta.dy * sine;
          y = center.dy + delta.dx * sine + delta.dy * cosine;
        }
      }
      final twinkle = .55 + .45 * math.sin(t * p.speed + p.phase);
      final alpha = math.min(
        1.0,
        (p.bright ? .95 : .45 + p.depth * .35) * twinkle * prominence,
      );
      final color = switch (theme.sky) {
        SkyKind.rainbow => HSVColor.fromAHSV(
          1,
          (x / size.width * 360 + t * 40) % 360,
          .6,
          1,
        ).toColor(),
        _ =>
          p.tone == 2
              ? Colors.white
              : p.tone == 0
              ? theme.primary
              : theme.secondary,
      };
      final paint = Paint()..color = color.withValues(alpha: alpha);
      if (theme.sky == SkyKind.data) {
        canvas.drawRect(Rect.fromLTWH(x, y, 1.5, 3 + p.depth * 4), paint);
        continue;
      }
      if (theme.sky == SkyKind.streaks) {
        canvas.drawRect(Rect.fromLTWH(x, y, 6 + p.depth * 18, 1), paint);
        continue;
      }
      // Hot pink: every other pink particle is a small floating heart.
      if (theme.sky == SkyKind.glitter && p.tone == 1) {
        final h = (2.2 + p.radius * 1.6) * (p.bright ? 1.5 : 1);
        canvas.drawPath(
          Path()
            ..moveTo(x, y + h)
            ..cubicTo(
              x - h * 1.6,
              y - h * .2,
              x - h * .6,
              y - h * 1.4,
              x,
              y - h * .4,
            )
            ..cubicTo(
              x + h * .6,
              y - h * 1.4,
              x + h * 1.6,
              y - h * .2,
              x,
              y + h,
            ),
          Paint()..color = theme.primary.withValues(alpha: alpha),
        );
        continue;
      }
      final r =
          p.radius *
          (theme.sky == SkyKind.dust ? .6 : 1) *
          (p.bright ? 1.3 : .8);
      if (p.bright) {
        canvas.drawCircle(
          Offset(x, y),
          r * 3.2,
          Paint()..color = color.withValues(alpha: alpha * .18),
        );
      }
      canvas.drawCircle(Offset(x, y), r, paint);
      if (p.bright && theme.sky == SkyKind.glitter) {
        final s = 2 + p.radius * 2 * twinkle;
        final line = Paint()
          ..color = color.withValues(alpha: alpha * .8)
          ..strokeWidth = 1;
        canvas.drawLine(Offset(x - s, y), Offset(x + s, y), line);
        canvas.drawLine(Offset(x, y - s), Offset(x, y + s), line);
      }
    }
    // A shooting star crosses starry skies every so often.
    if ([
          SkyKind.stars,
          SkyKind.dust,
          SkyKind.glitter,
          SkyKind.rainbow,
        ].contains(theme.sky) &&
        level > 1) {
      final age = t % 11;
      if (age < .9) {
        final seed = (t / 11).floor();
        final random = math.Random(seed);
        final sx = random.nextDouble() * size.width * .6;
        final sy = random.nextDouble() * size.height * .4;
        final angle = (20 + random.nextDouble() * 15) * math.pi / 180,
            speed = 220 + random.nextDouble() * 100;
        final direction = Offset(math.cos(angle), math.sin(angle));
        final head = Offset(sx, sy) + direction * (speed * age);
        final tail = head - direction * 80;
        final fade = 1 - age / .9;
        canvas.drawLine(
          tail,
          head,
          Paint()
            ..strokeWidth = 2.2
            ..strokeCap = StrokeCap.round
            ..shader = ui.Gradient.linear(
              tail,
              head,
              [
                Colors.transparent,
                theme.primary.withValues(alpha: .68 * fade),
                Colors.white.withValues(alpha: fade),
              ],
              const [0, .68, 1],
            ),
        );
        canvas.drawCircle(
          head,
          5,
          Paint()
            ..color = theme.primary.withValues(alpha: .55 * fade)
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5),
        );
        canvas.drawCircle(
          head,
          2.4,
          Paint()..color = Colors.white.withValues(alpha: fade),
        );
      }
    }
  }

  void _blackHole(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    canvas.drawCircle(
      center,
      15,
      Paint()
        ..color = const Color(0xff080610).withValues(alpha: .42)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5),
    );
    canvas.drawCircle(
      center,
      6,
      Paint()..color = const Color(0xff010103).withValues(alpha: .72),
    );
  }

  @override
  bool shouldRepaint(ConsoleAtmospherePainter old) =>
      old.appearance != appearance || old.emptyPanel != emptyPanel;
}
