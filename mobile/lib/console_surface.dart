import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'console_theme.dart';

bool consoleMotionReduced(BuildContext context) =>
    MediaQuery.disableAnimationsOf(context) ||
    WidgetsBinding
        .instance
        .platformDispatcher
        .accessibilityFeatures
        .reduceMotion;

Duration openingDuration(ConsoleOpening opening) => Duration(
  milliseconds: switch (opening) {
    ConsoleOpening.soft => 380,
    ConsoleOpening.explosion => 1600,
    ConsoleOpening.frost || ConsoleOpening.implode => 1500,
    ConsoleOpening.portal ||
    ConsoleOpening.neon ||
    ConsoleOpening.spectrum => 1400,
    ConsoleOpening.glitch => 1200,
    _ => 1100,
  },
);

/// Decoration has its own paint layers. Terminal layout, selection and input do
/// not rebuild on animation ticks. Ambient effects sit behind the terminal
/// text; an opening plays over it for under two seconds and ignores touches.
class ConsoleSurface extends StatefulWidget {
  final ConsoleAppearance appearance;
  final Object openingKey;
  final int connectionGeneration;
  final bool connected;
  final bool playOpening;
  final Object? openingRequest;
  final String? sessionState;
  final int stateEffectSequence;
  final String? stateEffectKind;
  final bool emptyPanel;

  /// Advances for accepted live output; drives reactive frame lighting.
  final Object? activity;

  /// Advances after a 900 ms output gap; drives Cyber bursts.
  final Object? outputBurst;
  final Widget child;
  const ConsoleSurface({
    super.key,
    required this.appearance,
    required this.openingKey,
    this.connectionGeneration = 0,
    this.connected = true,
    this.playOpening = false,
    this.openingRequest,
    this.sessionState,
    this.stateEffectSequence = 0,
    this.stateEffectKind,
    this.emptyPanel = false,
    this.activity,
    this.outputBurst,
    required this.child,
  });

  @override
  State<ConsoleSurface> createState() => _ConsoleSurfaceState();
}

class _ConsoleSurfaceState extends State<ConsoleSurface>
    with TickerProviderStateMixin, WidgetsBindingObserver {
  // One minute of ambient time; drift and lighting are computed from it.
  late final _ambient = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 60),
  );
  late final _opening = AnimationController(
    vsync: this,
    duration: openingDuration(widget.appearance.theme.opening),
    value: 1,
    // Reduced motion is handled in _sync, so the opening keeps its length.
    animationBehavior: AnimationBehavior.preserve,
  );
  late final _react = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
    value: 1,
  );
  late final _stateEffect = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 720),
    value: 1,
  );
  late final _repaint = Listenable.merge([
    _ambient,
    _opening,
    _react,
    _stateEffect,
  ]);
  bool _foreground = true, _opened = false, _enabled = true;
  String? _effectKind;
  DateTime? _lastOutputEffect;
  // An opening requested while the route is still transitioning in plays once
  // the console becomes visible.
  bool _pendingOpen = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _foreground = lifecycle == null || lifecycle == AppLifecycleState.resumed;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync(open: !_opened && widget.playOpening);
    _opened = true;
  }

  @override
  void didUpdateWidget(ConsoleSurface oldWidget) {
    super.didUpdateWidget(oldWidget);
    _opening.duration = openingDuration(widget.appearance.theme.opening);
    final sameConsole = oldWidget.openingKey == widget.openingKey;
    final sameConnection =
        oldWidget.connectionGeneration == widget.connectionGeneration &&
        oldWidget.connected &&
        widget.connected;
    if (!sameConsole || !sameConnection || !widget.connected) {
      _opening.value = 1;
      _react.value = 1;
      _stateEffect.value = 1;
      _effectKind = null;
      _pendingOpen = false;
      _lastOutputEffect = null;
    }
    _sync(
      open:
          (widget.playOpening && (!sameConsole || !oldWidget.playOpening)) ||
          oldWidget.openingRequest != widget.openingRequest,
    );
    if (sameConsole &&
        sameConnection &&
        widget.connected &&
        oldWidget.stateEffectSequence != widget.stateEffectSequence &&
        widget.stateEffectKind != null) {
      _playStateEffect(widget.stateEffectKind!);
    }
    if (sameConsole &&
        sameConnection &&
        widget.connected &&
        oldWidget.outputBurst != widget.outputBurst &&
        widget.sessionState == 'active') {
      final now = DateTime.now();
      final freshBurst =
          _lastOutputEffect == null ||
          now.difference(_lastOutputEffect!) >
              const Duration(milliseconds: 1500);
      if (freshBurst) {
        _lastOutputEffect = now;
        if (widget.appearance.themeId == 'cyber') _playStateEffect('output');
      }
    }
    if (sameConsole &&
        sameConnection &&
        widget.connected &&
        oldWidget.activity != widget.activity &&
        widget.appearance.lighting == 'reactive' &&
        _enabled &&
        !_react.isAnimating) {
      _react.duration = Duration(
        milliseconds: (900 * widget.appearance.speed).round(),
      );
      _react.forward(from: 0);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final wasEnabled = _enabled;
    _foreground = state == AppLifecycleState.resumed;
    _sync();
    if (mounted && wasEnabled != _enabled) setState(() {});
  }

  @override
  void didChangeAccessibilityFeatures() {
    final wasEnabled = _enabled;
    _sync();
    if (mounted && wasEnabled != _enabled) setState(() {});
  }

  void _playStateEffect(String kind) {
    if (!_enabled || !widget.appearance.openingAnimations) return;
    _effectKind = kind;
    _stateEffect.duration = Duration(
      milliseconds: switch (kind) {
        'output' => 360,
        'error' => 520,
        _ => 720,
      },
    );
    _stateEffect.forward(from: 0);
  }

  void _sync({bool open = false}) {
    _enabled =
        _foreground &&
        widget.connected &&
        TickerMode.valuesOf(context).enabled &&
        !consoleMotionReduced(context) &&
        ModalRoute.isCurrentOf(context) != false;
    final a = widget.appearance;
    final lit = !['static', 'reactive'].contains(a.lighting);
    final ambient = _enabled && a.ambientMotion && (a.stars || lit);
    if (ambient && !_ambient.isAnimating) {
      _ambient.repeat();
    }
    if (!ambient && _ambient.isAnimating) _ambient.stop();
    if (!a.openingAnimations) {
      _pendingOpen = false;
      _opening.value = 1;
    } else if (!_enabled) {
      _pendingOpen =
          widget.connected &&
          (_pendingOpen || open) &&
          !consoleMotionReduced(context);
      _opening.value = 1;
    } else if (open || _pendingOpen) {
      _pendingOpen = false;
      _opening.forward(from: 0);
    }
    if (!_enabled) _react.value = 1;
    if (!_enabled || !a.openingAnimations) {
      _stateEffect.value = 1;
      _effectKind = null;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ambient.dispose();
    _opening.dispose();
    _react.dispose();
    _stateEffect.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.appearance, theme = a.theme;
    return RepaintBoundary(
      child: Stack(
        fit: StackFit.expand,
        children: [
          Positioned.fill(
            child: IgnorePointer(
              child: ExcludeSemantics(
                child: RepaintBoundary(
                  child: CustomPaint(
                    key: const ValueKey('console-frame'),
                    painter: ConsoleFramePainter(
                      a,
                      _ambient,
                      _react,
                      _repaint,
                      sessionState: widget.sessionState,
                      effectsEnabled: _enabled && a.openingAnimations,
                      motionEnabled: _enabled && a.ambientMotion,
                    ),
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(6),
            child: ClipPath(
              clipper: _ConsoleClipper(theme),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // Painted theme texture under a dark veil for readable text.
                  if (a.textures && !theme.solid)
                    Positioned.fill(
                      child: IgnorePointer(
                        child: ExcludeSemantics(
                          child: Opacity(
                            opacity: .5,
                            child: Image.asset(
                              'assets/textures/${theme.id}.webp',
                              key: const ValueKey('console-texture'),
                              fit: BoxFit.cover,
                              gaplessPlayback: true,
                              errorBuilder: (_, _, _) => const SizedBox(),
                            ),
                          ),
                        ),
                      ),
                    ),
                  if (theme.id == 'icy')
                    Positioned.fill(
                      child: IgnorePointer(
                        child: ExcludeSemantics(
                          child: CustomPaint(
                            key: const ValueKey('console-frost-corners'),
                            painter: ConsoleFrostPainter(theme),
                          ),
                        ),
                      ),
                    ),
                  Positioned.fill(
                    child: IgnorePointer(
                      child: ExcludeSemantics(
                        child: RepaintBoundary(
                          child: CustomPaint(
                            key: const ValueKey('console-atmosphere'),
                            painter: ConsoleAtmospherePainter(
                              a,
                              _ambient,
                              _opening,
                              _repaint,
                              emptyPanel: widget.emptyPanel,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  widget.child,
                  Positioned.fill(
                    child: IgnorePointer(
                      child: ExcludeSemantics(
                        child: CustomPaint(
                          key: const ValueKey('console-opening'),
                          painter: ConsoleOpeningPainter(
                            theme,
                            _opening,
                            _stateEffect,
                            _effectKind,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

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

class _ConsoleClipper extends CustomClipper<Path> {
  final ConsoleTheme theme;
  _ConsoleClipper(this.theme);
  @override
  Path getClip(Size size) => consoleOutline(Offset.zero & size, theme);
  @override
  bool shouldReclip(_ConsoleClipper old) => old.theme != theme;
}

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
