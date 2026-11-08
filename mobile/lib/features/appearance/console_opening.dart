import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../console_theme.dart';
import 'console_geometry.dart';
import 'effect_contract.dart';

double _ease(double t) => 1 - math.pow(1 - t.clamp(0, 1), 3).toDouble();

/// Procedural, theme-colored openings. Particles are seeded so every frame of
/// an opening is deterministic. At most two brief flashes per effect.
class ConsoleOpeningPainter extends CustomPainter {
  final ConsoleTheme theme;
  final Animation<double> opening, reaction;
  final String? reactionKind;
  ConsoleOpeningPainter(
    this.theme,
    this.opening,
    this.reaction,
    this.reactionKind,
  ) : super(repaint: Listenable.merge([opening, reaction]));

  @override
  void paint(Canvas canvas, Size s) {
    final t = opening.value;
    if (s.isEmpty) return;
    canvas.save();
    canvas.clipRect(Offset.zero & s);
    if (t < 1) {
      final seconds = t * openingDuration(theme.opening).inMilliseconds / 1000;
      switch (theme.opening) {
        case ConsoleOpening.soft:
          _fill(canvas, s, theme.primary.withValues(alpha: (1 - t) * .2));
        case ConsoleOpening.bloom:
          _bloom(canvas, s, t);
        case ConsoleOpening.explosion:
          _explosion(canvas, s, t, seconds);
        case ConsoleOpening.frost:
          _frost(canvas, s, t, seconds);
        case ConsoleOpening.lightning:
          _lightning(canvas, s, t);
        case ConsoleOpening.portal:
          _portal(canvas, s, t);
        case ConsoleOpening.implode:
          _implode(canvas, s, t);
        case ConsoleOpening.neon:
          _neon(canvas, s, t);
        case ConsoleOpening.redline:
          _redline(canvas, s, t);
        case ConsoleOpening.glitch:
          _glitch(canvas, s, t);
        case ConsoleOpening.spectrum:
          _spectrumBurst(canvas, s, t, seconds);
      }
    }
    if (reaction.value < 1 && reactionKind != null) {
      _paintReaction(canvas, s, reaction.value, reactionKind!);
    }
    canvas.restore();
  }

  void _paintReaction(Canvas canvas, Size s, double t, String kind) {
    if (kind == 'ready' && theme.id == 'blue') {
      final progress = _ease(t),
          x = s.width * (.08 + .84 * progress),
          y = 5.5 + math.sin(t * 18) * 1.2;
      final arc = Path()
        ..moveTo(x - 18, y + 5)
        ..lineTo(x - 7, y)
        ..lineTo(x, y + 4)
        ..lineTo(x + 10, y - 3)
        ..lineTo(x + 18, y);
      canvas.drawPath(arc, _glow(Colors.white.withValues(alpha: 1 - t), 2, 7));
      canvas.drawPath(
        arc,
        _glow(theme.primary.withValues(alpha: 1 - t), 4, 12),
      );
    } else if (kind == 'ready' && theme.id == 'hot-pink') {
      for (var i = 0; i < 10; i++) {
        final x = s.width * (.12 + (i % 5) * .18) + math.sin(t * 8 + i) * 4,
            y = s.height * (.82 - t * (.2 + (i % 3) * .08)),
            r = 4 + (i % 3) * 1.2;
        final heart = Path()
          ..moveTo(x, y + r)
          ..cubicTo(
            x - r * 1.6,
            y - r * .2,
            x - r * .6,
            y - r * 1.4,
            x,
            y - r * .4,
          )
          ..cubicTo(x + r * .6, y - r * 1.4, x + r * 1.6, y - r * .2, x, y + r);
        canvas.drawPath(
          heart,
          Paint()
            ..color = (i.isEven ? theme.primary : Colors.white).withValues(
              alpha: 1 - t,
            )
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 1),
        );
      }
    } else if (kind == 'ready' && theme.id == 'icy') {
      final fade = math.sin(math.min(1.0, t * 1.45) * math.pi);
      for (var i = 0; i < 3; i++) {
        final x = s.width * (.25 + i * .24),
            y = s.height * (.82 - t * .42),
            radius = s.height * (.08 + t * .11);
        canvas.drawOval(
          Rect.fromCenter(
            center: Offset(x, y),
            width: radius * 3.4,
            height: radius * 1.1,
          ),
          Paint()
            ..shader =
                RadialGradient(
                  colors: [
                    const Color(0xffe0faff).withValues(alpha: fade * .3),
                    const Color(0xffb4edff).withValues(alpha: fade * .12),
                    Colors.transparent,
                  ],
                ).createShader(
                  Rect.fromCircle(center: Offset(x, y), radius: radius * 1.7),
                ),
        );
      }
    } else if (kind == 'error') {
      final inset = 2 + t * 4;
      canvas.drawPath(
        consoleOutline((Offset.zero & s).deflate(inset), theme),
        _glow(
          const Color(0xffff6c78)
              .withValues(alpha: math.sin(t * math.pi) * .85),
          2,
          8,
        ),
      );
    } else if (kind == 'output' && theme.id == 'cyber') {
      final headerHeight = math.min(48.0, s.height * .12),
          y = _ease(t) * headerHeight;
      canvas.drawRect(
        Rect.fromLTWH(0, y, s.width, 2),
        Paint()..color = theme.primary.withValues(alpha: (1 - t) * .9),
      );
      canvas.drawRect(
        Rect.fromLTWH(0, math.max(0, y - 7), s.width, 7),
        Paint()..color = theme.secondary.withValues(alpha: (1 - t) * .12),
      );
    }
  }

  void _fill(Canvas c, Size s, Color color) =>
      c.drawRect(Offset.zero & s, Paint()..color = color);
  Paint _glow(Color color, double width, [double blur = 6]) => Paint()
    ..color = color
    ..style = PaintingStyle.stroke
    ..strokeWidth = width
    ..strokeCap = StrokeCap.round
    ..maskFilter = MaskFilter.blur(BlurStyle.solid, blur);
  void _sparkle(Canvas c, Offset o, double r, Paint p) {
    c.drawPath(
      Path()
        ..moveTo(o.dx, o.dy - r * 2)
        ..lineTo(o.dx + r * .5, o.dy - r * .5)
        ..lineTo(o.dx + r * 2, o.dy)
        ..lineTo(o.dx + r * .5, o.dy + r * .5)
        ..lineTo(o.dx, o.dy + r * 2)
        ..lineTo(o.dx - r * .5, o.dy + r * .5)
        ..lineTo(o.dx - r * 2, o.dy)
        ..lineTo(o.dx - r * .5, o.dy - r * .5)
        ..close(),
      p,
    );
  }

  void _bloom(Canvas c, Size s, double t) {
    final center = s.center(Offset.zero), r = s.longestSide * .6;
    for (var i = 0; i < 3; i++) {
      final k = _ease(t * 1.4 - i * .15);
      if (k <= 0 || k >= 1) continue;
      c.drawCircle(
        center,
        k * r,
        _glow(
          (i.isOdd ? theme.secondary : theme.primary).withValues(
            alpha: (1 - k) * .8,
          ),
          2 + (1 - k) * 5,
        ),
      );
    }
    final random = math.Random(3);
    for (var i = 0; i < 40; i++) {
      final angle = random.nextDouble() * math.pi * 2,
          d = _ease(t) * (.15 + random.nextDouble() * .4) * r;
      _sparkle(
        c,
        center + Offset(math.cos(angle), math.sin(angle)) * d,
        (1 + random.nextDouble() * 2) * (2 - t),
        Paint()
          ..color = (i.isEven ? theme.primary : theme.secondary).withValues(
            alpha: 1 - t,
          ),
      );
    }
  }

  void _explosion(Canvas c, Size s, double t, double sec) {
    final center = Offset(s.width / 2, s.height * .55);
    final scale = math.min(1.6, s.width / 500);
    if (t < .14) {
      _fill(
        c,
        s,
        const Color(0xfffff3d6).withValues(alpha: (1 - t / .14) * .7),
      );
    }
    final ring = _ease(t * 2.2);
    if (ring < 1) {
      c.drawOval(
        Rect.fromCenter(
          center: center,
          width: ring * s.width * 1.5,
          height: ring * s.height * 1.2,
        ),
        _glow(
          const Color(0xffffd59a).withValues(alpha: (1 - ring) * .9),
          3 + 8 * (1 - ring),
          10,
        ),
      );
    }
    final random = math.Random(11);
    // Smoke lingers as the flames cool.
    for (var i = 0; i < 22; i++) {
      final angle = random.nextDouble() * math.pi * 2,
          v = 20 + random.nextDouble() * 90;
      final size = 30 + random.nextDouble() * 40 + 26 * sec;
      final o =
          center +
          Offset(
            math.cos(angle) * v * sec,
            math.sin(angle) * v * .5 * sec - 40 * sec,
          );
      final a = math.max(0.0, math.min(.35, (t - .15) * 1.2) * (1 - t));
      if (a <= 0) continue;
      c.drawCircle(
        o,
        size,
        Paint()
          ..shader = RadialGradient(
            colors: [
              const Color(0xff3a2a24).withValues(alpha: a),
              Colors.transparent,
            ],
          ).createShader(Rect.fromCircle(center: o, radius: size)),
      );
    }
    // Additive fireball.
    for (var i = 0; i < 120; i++) {
      final angle = random.nextDouble() * math.pi * 2;
      final v = (40 + random.nextDouble() * 320) * scale,
          life = .45 + random.nextDouble() * .55;
      final size0 = 10 + random.nextDouble() * 24;
      final age = t / life;
      if (age >= 1) continue;
      final travel = (1 - math.exp(-2.6 * sec)) / 2.6;
      final o =
          center +
          Offset(
            math.cos(angle) * v * travel,
            math.sin(angle) * v * .75 * travel - 25 * sec * sec,
          );
      final color = age < .2
          ? const Color(0xfffff6d0)
          : age < .45
          ? const Color(0xffffc23d)
          : age < .7
          ? const Color(0xffff6a1f)
          : const Color(0xffa8200c);
      final size = size0 * (1 + age * 1.6);
      c.drawCircle(
        o,
        size,
        Paint()
          ..blendMode = BlendMode.plus
          ..shader = RadialGradient(
            colors: [
              color.withValues(alpha: (1 - age) * .55),
              color.withValues(alpha: 0),
            ],
          ).createShader(Rect.fromCircle(center: o, radius: size)),
      );
    }
    // Sparks under gravity.
    for (var i = 0; i < 60; i++) {
      final angle = random.nextDouble() * math.pi * 2,
          v = 260 + random.nextDouble() * 460,
          life = .4 + random.nextDouble() * .55;
      final age = t / life;
      if (age >= 1) continue;
      final vx = math.cos(angle) * v, vy = math.sin(angle) * v - 140;
      final o = center + Offset(vx * sec, vy * sec + 260 * sec * sec);
      c.drawLine(
        o,
        o - Offset(vx, vy + 520 * sec) * .03,
        Paint()
          ..color =
              (age < .4 ? const Color(0xfffff1b8) : const Color(0xffff9a2b))
                  .withValues(alpha: 1 - age)
          ..strokeWidth = 2 - age
          ..strokeCap = StrokeCap.round,
      );
    }
    // A low contrast shimmer follows the fireball; it never samples or masks text.
    if (t > .42 && t < .94) {
      final k = (t - .42) / .52,
          y = center.dy + (t - .42) * s.height * .22,
          path = Path();
      for (var x = 0.0; x <= s.width; x += 12) {
        final yy = y + math.sin(x * .035 + t * 30) * (2 + k * 2);
        if (x == 0) {
          path.moveTo(x, yy);
        } else {
          path.lineTo(x, yy);
        }
      }
      c.drawPath(
        path,
        Paint()
          ..color = const Color(0xffffb24a)
              .withValues(alpha: math.sin(k * math.pi) * .2)
          ..strokeWidth = 1.2
          ..style = PaintingStyle.stroke,
      );
    }
    // Embers reach and glow along the top edge before the launch layer clears.
    if (t > .48) {
      final k = ((t - .48) / .38).clamp(0.0, 1.0);
      for (var i = 0; i < 16; i++) {
        final random = math.Random(301 + i),
            x = s.width * (.06 + random.nextDouble() * .88),
            phase = i * .7,
            y = -18 + _ease(k) * 38 + math.sin(t * 10 + phase) * (1 - k) * 3,
            alpha =
                (t < .9 ? .72 : (1 - t) * 7) *
                (.7 + .3 * math.sin(t * 12 + phase));
        c.drawCircle(
          Offset(x, y),
          1.4 + random.nextDouble() * 1.2,
          Paint()
            ..color = const Color(0xffffd78a).withValues(alpha: alpha)
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
        );
      }
    }
  }

  void _frost(Canvas c, Size s, double t, double sec) {
    c.drawRect(
      Offset.zero & s,
      Paint()
        ..shader = RadialGradient(
          colors: [
            Colors.transparent,
            const Color(
              0xffc9f6ff,
            ).withValues(alpha: math.sin(math.min(1, t * 1.4) * math.pi) * .3),
          ],
          stops: const [.4, 1],
        ).createShader(Offset.zero & s),
    );
    final fade = t < .7 ? 1.0 : 1 - (t - .7) / .3;
    final random = math.Random(5);
    final reach = s.shortestSide * .32;
    final paint = _glow(const Color(0xffe8fcff), 1, 4);
    void grow(Offset from, double angle, double length, int depth) {
      final to = from + Offset(math.cos(angle), math.sin(angle)) * length;
      final at = (4 - depth) * .11 + random.nextDouble() * .06;
      final k = ((t - at) / .18).clamp(0.0, 1.0);
      if (k > 0) {
        c.drawLine(
          from,
          Offset.lerp(from, to, k)!,
          paint
            ..color = const Color(0xffe8fcff)
                .withValues(alpha: fade * (.45 + depth * .12))
            ..strokeWidth = .6 + depth * .45,
        );
      }
      if (depth > 0) {
        for (final turn in [-.55, .55, 0.0]) {
          if (turn != 0 || random.nextDouble() < .5) {
            grow(
              to,
              angle + turn + (random.nextDouble() - .5) * .3,
              length * (.5 + random.nextDouble() * .18),
              depth - 1,
            );
          }
        }
      }
    }

    for (final (x, y, a) in [
      (0.0, 0.0, .78),
      (s.width, 0.0, 2.36),
      (0.0, s.height, -.78),
      (s.width, s.height, -2.36),
    ]) {
      grow(Offset(x, y), a, reach, 4);
    }
    if (t > .62) {
      final k = (t - .62) / .38, shardTime = sec - .62 * 1.5;
      for (var i = 0; i < 40; i++) {
        final o =
            Offset(
              random.nextDouble() * s.width,
              random.nextDouble() * s.height,
            ) +
            Offset(
              (random.nextDouble() - .5) * 120 * shardTime,
              (random.nextDouble() * 130 - 40) * shardTime +
                  100 * shardTime * shardTime,
            );
        final size = 3 + random.nextDouble() * 6;
        c.save();
        c.translate(o.dx, o.dy);
        c.rotate(random.nextDouble() * 6 + shardTime * 6);
        c.drawPath(
          Path()
            ..moveTo(0, -size)
            ..lineTo(size * .45, 0)
            ..lineTo(0, size)
            ..lineTo(-size * .45, 0)
            ..close(),
          Paint()
            ..color = (k < .3 ? Colors.white : theme.primary).withValues(
              alpha: (1 - k) * .9,
            ),
        );
        c.restore();
      }
    }
  }

  void _lightning(Canvas c, Size s, double t) {
    final random = math.Random(7);
    for (var i = 0; i < 4; i++) {
      final at = i * .12 + random.nextDouble() * .05;
      var points = [
        Offset((.15 + random.nextDouble() * .7) * s.width, 0),
        Offset(
          (.2 + random.nextDouble() * .6) * s.width,
          (.55 + random.nextDouble() * .45) * s.height,
        ),
      ];
      for (var depth = 0; depth < 5; depth++) {
        final next = [points.first];
        for (var j = 1; j < points.length; j++) {
          final a = points[j - 1],
              b = points[j],
              spread = (b - a).distance * .28;
          next
            ..add(
              Offset.lerp(a, b, .5)! +
                  Offset(
                    (random.nextDouble() - .5) * 2 * spread,
                    (random.nextDouble() - .5) * .6 * spread,
                  ),
            )
            ..add(b);
        }
        points = next;
      }
      final k = (t - at) / .3;
      if (k < 0 || k > 1) continue;
      if (i == 0 && k < .15) {
        _fill(
          c,
          s,
          const Color(0xffdfefff).withValues(alpha: .18 * (1 - k / .15)),
        );
      }
      final path = Path()..addPolygon(points, false);
      c.drawPath(path, _glow(theme.secondary.withValues(alpha: 1 - k), 5, 10));
      c.drawPath(path, _glow(Colors.white.withValues(alpha: 1 - k), 2, 2));
    }
  }

  void _portal(Canvas c, Size s, double t) {
    final center = s.center(Offset.zero), r = s.shortestSide * .55;
    final pull = t < .55 ? _ease(t / .55) : 1.0,
        burst = t < .55 ? 0.0 : _ease((t - .55) / .45);
    final random = math.Random(9);
    for (var i = 0; i < 90; i++) {
      final radius = .3 + random.nextDouble() * .7,
          angle0 = random.nextDouble() * math.pi * 2;
      final angle = angle0 + pull * 5 * (1.2 - radius),
          d = (radius * (1 - pull * .9) + burst * 1.4) * r;
      c.drawCircle(
        center + Offset(math.cos(angle) * d, math.sin(angle) * d * .7),
        1 + random.nextDouble() * 2,
        Paint()
          ..color = (radius > .6 ? theme.primary : theme.secondary).withValues(
            alpha: (1 - burst) * .9,
          ),
      );
    }
    for (var i = 0; i < 3; i++) {
      final rr = (.18 + i * .1) * r * (t < .55 ? pull : 1 + burst * 3);
      c.save();
      c.translate(center.dx, center.dy);
      c.rotate(t * 4 + i);
      c.drawArc(
        Rect.fromCenter(center: Offset.zero, width: rr * 2, height: rr * 1.4),
        i.toDouble(),
        4.2,
        false,
        _glow(
          (i.isOdd ? theme.secondary : theme.primary).withValues(
            alpha: (t < .55 ? pull : 1 - burst) * .7,
          ),
          2,
          8,
        ),
      );
      c.restore();
    }
  }

  void _implode(Canvas c, Size s, double t) {
    final center = s.center(Offset.zero),
        big = (Offset.zero & s).bottomRight.distance / 2;
    final collapse = math.min(1.0, t / .5),
        wave = t < .5 ? 0.0 : _ease((t - .5) / .5);
    _fill(
      c,
      s,
      Colors.black.withValues(
        alpha: t < .5 ? .75 * collapse : .75 * (1 - wave),
      ),
    );
    final random = math.Random(13);
    for (var i = 0; i < 110; i++) {
      final radius = .45 + random.nextDouble() * .65,
          angle = random.nextDouble() * math.pi * 2 + collapse * 3;
      final rr = radius * big * (1 - _ease(collapse) * .96) + wave * big * 1.2;
      c.drawRect(
        Rect.fromLTWH(
          center.dx + math.cos(angle) * rr,
          center.dy + math.sin(angle) * rr,
          1.5,
          1.5,
        ),
        Paint()
          ..color = (radius > .8 ? theme.primary : const Color(0xffb9b0ff))
              .withValues(alpha: (t < .5 ? collapse : 1 - wave) * .8),
      );
    }
    final hole = (t < .5 ? collapse : 1 - wave) * s.shortestSide * .07;
    c.save();
    c.translate(center.dx, center.dy);
    c.rotate(-.3);
    c.drawOval(
      Rect.fromCenter(
        center: Offset.zero,
        width: hole * 4.4,
        height: hole * 1.6,
      ),
      _glow(theme.primary, 2, 8),
    );
    c.restore();
    c.drawCircle(center, hole, Paint()..color = Colors.black);
    if (wave > 0) {
      c.drawCircle(
        center,
        wave * big,
        Paint()
          ..color = theme.secondary.withValues(alpha: 1 - wave)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 14 * (1 - wave),
      );
    }
  }

  void _neon(Canvas c, Size s, double t) {
    final trace = _ease(t / .45);
    final flicker = t > .45 && t < .62 && t >= .5 && t <= .56 ? .25 : 1.0;
    for (final (inset, color, width) in [
      (4.0, theme.primary, 3.0),
      (9.0, theme.secondary, 1.5),
    ]) {
      final rect = (Offset.zero & s).deflate(inset);
      final metric = (Path()..addRect(rect)).computeMetrics().first;
      c.drawPath(
        metric.extractPath(0, metric.length * trace),
        _glow(color.withValues(alpha: flicker), width, 10),
      );
    }
    if (t > .45) {
      final k = (t - .45) / .55,
          center = s.center(Offset.zero),
          r = s.longestSide * .55;
      if (k < .12) {
        _fill(c, s, theme.primary.withValues(alpha: .2 * (1 - k / .12)));
      }
      final random = math.Random(17);
      for (var i = 0; i < 60; i++) {
        final angle = random.nextDouble() * math.pi * 2,
            d = _ease(k) * (.2 + random.nextDouble() * .5) * r;
        final o =
            center +
            Offset(math.cos(angle) * d, math.sin(angle) * d + k * k * 40);
        final white = random.nextDouble() < .3;
        _sparkle(
          c,
          o,
          1.5 + random.nextDouble() * 2.5,
          Paint()
            ..color =
                (white
                        ? Colors.white
                        : i.isEven
                        ? theme.primary
                        : theme.secondary)
                    .withValues(alpha: 1 - k),
        );
      }
    }
  }

  void _redline(Canvas c, Size s, double t) {
    final sweep = _ease(t / .78),
        border = consoleOutline(Offset.zero & s, theme),
        perimeter = border.computeMetrics().first,
        end = perimeter.length * sweep,
        start = math.max(0.0, end - perimeter.length * .12);
    c.drawPath(
      perimeter.extractPath(start, end),
      Paint()
        ..color = theme.primary.withValues(alpha: 1 - t * .45)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4
        ..strokeCap = StrokeCap.square
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
    );
    if (t >= .5) return;
    final sparks = Paint()
      ..color = const Color(0xffffe6dc).withValues(alpha: .85 * (1 - t * 2));
    for (final corner in [
      const Offset(7, 7),
      Offset(s.width - 7, s.height - 7),
    ]) {
      for (var i = 0; i < 5; i++) {
        final angle = i * math.pi * 2 / 5 + t * 8,
            distance = 14 * (t / .5),
            point =
                corner + Offset(math.cos(angle), math.sin(angle)) * distance;
        c.drawCircle(point, 1.4, sparks);
      }
    }
  }

  void _glitch(Canvas c, Size s, double t) {
    final random = math.Random(23);
    for (double x = 0; x < s.width; x += 14) {
      final speed = .6 + random.nextDouble() * .8,
          offset = -random.nextDouble() * .4;
      final head = (t * speed + offset) * (s.height + 200);
      for (var i = 0; i < 18; i++) {
        final y = head - i * 14;
        if (y < -14 || y > s.height) continue;
        c.drawRect(
          Rect.fromLTWH(x + 3, y, 6, 9),
          Paint()
            ..color = (i == 0 ? Colors.white : theme.primary).withValues(
              alpha: (1 - i / 18) * (1 - t) * .7,
            ),
        );
      }
    }
    for (var i = 0; i < 6; i++) {
      final y = random.nextDouble() * s.height,
          h = 4 + random.nextDouble() * 14,
          at = .1 + random.nextDouble() * .5;
      final k = (t - at) / .12;
      if (k < 0 || k > 1) continue;
      c.drawRect(
        Rect.fromLTWH((random.nextDouble() - .5) * 60, y, s.width, h),
        Paint()
          ..color = (k < .5 ? theme.primary : theme.secondary).withValues(
            alpha: .5,
          ),
      );
    }
    final scan = _ease(t) * s.height;
    c.drawRect(
      Rect.fromLTWH(0, scan, s.width, 2),
      Paint()..color = theme.primary.withValues(alpha: (1 - t) * .9),
    );
  }

  void _spectrumBurst(Canvas c, Size s, double t, double sec) {
    final center = s.center(Offset.zero),
        big = (Offset.zero & s).bottomRight.distance / 2;
    for (var i = 0; i < 6; i++) {
      final k = _ease(t * 1.6 - i * .06);
      if (k <= 0 || k >= 1) continue;
      c.drawCircle(
        center,
        k * big,
        Paint()
          ..color = HSVColor.fromAHSV(
            (1 - k) * .85,
            (i * 60 + t * 200) % 360,
            .75,
            1,
          ).toColor()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 5 * (1 - k) + 1,
      );
    }
    final random = math.Random(29);
    for (var i = 0; i < 90; i++) {
      final angle = random.nextDouble() * math.pi * 2,
          v = 120 + random.nextDouble() * 400,
          hue = random.nextDouble() * 360,
          size = 3 + random.nextDouble() * 4;
      final o =
          center +
          Offset(
            math.cos(angle) * v * sec,
            (math.sin(angle) * v - 120) * sec + 190 * sec * sec,
          );
      c.save();
      c.translate(o.dx, o.dy);
      c.rotate(random.nextDouble() * 6 + sec * 8);
      c.drawRect(
        Rect.fromCenter(center: Offset.zero, width: size, height: size / 2),
        Paint()
          ..color = HSVColor.fromAHSV(
            1 - t,
            (hue + t * 120) % 360,
            .7,
            1,
          ).toColor(),
      );
      c.restore();
    }
  }

  @override
  bool shouldRepaint(ConsoleOpeningPainter old) =>
      old.theme != theme ||
      old.reactionKind != reactionKind ||
      old.opening != opening ||
      old.reaction != reaction;
}
