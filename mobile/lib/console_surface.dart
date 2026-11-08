import 'package:flutter/material.dart';

import 'console_theme.dart';
import 'features/appearance/effect_contract.dart';
export 'features/appearance/effect_contract.dart';
import 'features/appearance/console_geometry.dart';
import 'features/appearance/console_frame.dart';
import 'features/appearance/console_atmosphere.dart';
import 'features/appearance/console_opening.dart';
export 'features/appearance/console_geometry.dart';
export 'features/appearance/console_frame.dart';
export 'features/appearance/console_atmosphere.dart';
export 'features/appearance/console_opening.dart';

bool consoleMotionReduced(BuildContext context) =>
    MediaQuery.disableAnimationsOf(context) ||
    WidgetsBinding
        .instance
        .platformDispatcher
        .accessibilityFeatures
        .reduceMotion;

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

class _ConsoleClipper extends CustomClipper<Path> {
  final ConsoleTheme theme;
  _ConsoleClipper(this.theme);
  @override
  Path getClip(Size size) => consoleOutline(Offset.zero & size, theme);
  @override
  bool shouldReclip(_ConsoleClipper old) => old.theme != theme;
}
