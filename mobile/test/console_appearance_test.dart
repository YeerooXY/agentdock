import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'dart:convert';

import 'package:xterm/xterm.dart';

import 'package:agent_dock_mobile/console_appearance_controls.dart';
import 'package:agent_dock_mobile/console_surface.dart';
import 'package:agent_dock_mobile/console_theme.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/terminal_reading.dart';
import 'package:agent_dock_mobile/terminal_styles.dart';
import 'package:agent_dock_mobile/terminal_viewport.dart';

import 'widget_test.dart' show FakeDock, useGrid, enterChat;

ConsoleAtmospherePainter atmosphere(WidgetTester tester) =>
    tester
            .widget<CustomPaint>(
              find.byKey(const ValueKey('console-atmosphere')).first,
            )
            .painter!
        as ConsoleAtmospherePainter;

ConsoleOpeningPainter openingPainter(WidgetTester tester) =>
    tester
            .widget<CustomPaint>(
              find.byKey(const ValueKey('console-opening')).first,
            )
            .painter!
        as ConsoleOpeningPainter;

Widget surface(
  ConsoleAppearance a, {
  Object openingKey = 'one',
  int connectionGeneration = 0,
  bool connected = true,
  bool reduced = false,
  bool enabled = true,
  bool playOpening = false,
  Object? openingRequest,
  String? sessionState,
  int stateEffectSequence = 0,
  String? stateEffectKind,
  Object? activity,
  Object? outputBurst,
  bool emptyPanel = false,
  String text = 'Terminal output',
}) => MaterialApp(
  home: MediaQuery(
    data: MediaQueryData(disableAnimations: reduced),
    child: TickerMode(
      enabled: enabled,
      child: SizedBox(
        width: 320,
        height: 500,
        child: ConsoleSurface(
          appearance: a,
          openingKey: openingKey,
          connectionGeneration: connectionGeneration,
          connected: connected,
          playOpening: playOpening,
          openingRequest: openingRequest,
          sessionState: sessionState,
          stateEffectSequence: stateEffectSequence,
          stateEffectKind: stateEffectKind,
          activity: activity,
          outputBurst: outputBurst,
          emptyPanel: emptyPanel,
          child: Text(
            text,
            style: const TextStyle(
              fontFamily: 'Roboto',
              fontSize: 14,
              color: Color(0xffe6e8f1),
              decoration: TextDecoration.none,
            ),
          ),
        ),
      ),
    ),
  ),
);

void main() {
  test(
    'phone preferences persist and invalid saved fields recover safely',
    () async {
      String? saved;
      final store = ConsoleAppearanceStore(
        read: () async => saved,
        write: (value) async => saved = value,
      );
      const a = ConsoleAppearance(
        themeId: 'icy',
        starLevel: 0,
        lighting: 'wave',
        lightingSpeed: 'fast',
        ambientMotion: false,
        openingAnimations: false,
      );
      await store.save(a);
      final restored = await store.load();
      expect(restored.encode(), a.encode());
      for (final bad in ['not json', '[]', '{"theme":5,"stars":"false"}']) {
        expect(
          ConsoleAppearance.decode(bad).encode(),
          const ConsoleAppearance().encode(),
        );
      }
      expect(
        ConsoleAppearance.decode('{"theme":"removed"}').themeId,
        'classic',
      );
    },
  );

  test('default backgrounds expose stars; ANSI and inverse backgrounds stay readable', () {
    final terminal = Terminal()
      ..write('plain\x1b[41mred fill\x1b[0m\x1b[7minverse\x1b[0m');
    final theme = ConsoleTheme.named('cyber').terminal;
    final children = terminalReadingSpan(
      terminal,
      theme,
    ).children!.cast<TextSpan>();
    expect(children.first.style!.backgroundColor, Colors.transparent);
    expect(
      children
          .firstWhere((s) => s.text!.contains('red fill'))
          .style!
          .backgroundColor,
      theme.red,
    );
    final inverse = children
        .firstWhere((s) => s.text!.contains('inverse'))
        .style!;
    expect(inverse.color, theme.background);
    expect(inverse.backgroundColor, theme.foreground);
  });

  testWidgets(
    'existing consoles do not replay when mounted, revisited or rethemed',
    (tester) async {
      expect(ConsoleTheme.all.map((t) => t.opening).toSet().length, 11);
      const a = ConsoleAppearance(ambientMotion: false);
      await tester.pumpWidget(surface(a));
      expect(openingPainter(tester).opening.value, 1);
      await tester.pumpWidget(
        surface(a, text: 'New output', sessionState: 'ready'),
      );
      expect(openingPainter(tester).opening.value, 1);
      expect(openingPainter(tester).reaction.value, 1);
      await tester.pumpWidget(
        surface(a.copyWith(themeId: 'gamer'), sessionState: 'ready'),
      );
      expect(openingPainter(tester).opening.value, 1);
      expect(openingPainter(tester).reaction.value, 1);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(surface(a, sessionState: 'ready'));
      expect(openingPainter(tester).opening.value, 1);
      expect(openingPainter(tester).reaction.value, 1);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'new-session event and Replay start one opening without rebuilding the CLI',
    (tester) async {
      const a = ConsoleAppearance(ambientMotion: false);
      await tester.pumpWidget(surface(a, playOpening: true));
      expect(openingPainter(tester).opening.value, 0);
      await tester.pump(const Duration(milliseconds: 300));
      final before = openingPainter(tester).opening.value;
      expect(before, greaterThan(0));
      await tester.pumpWidget(
        surface(a, playOpening: false, text: 'Output changed'),
      );
      expect(openingPainter(tester).opening.value, closeTo(before, .001));
      await tester.pump(const Duration(milliseconds: 1700));
      expect(openingPainter(tester).opening.value, 1);
      await tester.pumpWidget(surface(a, openingRequest: 1));
      expect(openingPainter(tester).opening.value, 0);
      await tester.pump(const Duration(milliseconds: 1700));
      expect(openingPainter(tester).opening.value, 1);
    },
  );

  testWidgets('Ready and error reactions follow event tokens, not rebuilds', (
    tester,
  ) async {
    const a = ConsoleAppearance(ambientMotion: false);
    await tester.pumpWidget(surface(a, sessionState: 'active'));
    expect(openingPainter(tester).reaction.value, 1);
    await tester.pumpWidget(surface(a, sessionState: 'attention'));
    expect(openingPainter(tester).reaction.value, 1);
    await tester.pumpWidget(
      surface(
        a,
        sessionState: 'ready',
        stateEffectSequence: 1,
        stateEffectKind: 'ready',
      ),
    );
    expect(openingPainter(tester).reaction.value, 0);
    await tester.pump(const Duration(milliseconds: 180));
    final moving = openingPainter(tester).reaction.value;
    expect(moving, greaterThan(0));
    await tester.pumpWidget(
      surface(
        a.copyWith(starLevel: 0),
        sessionState: 'ready',
        stateEffectSequence: 1,
        stateEffectKind: 'ready',
      ),
    );
    expect(openingPainter(tester).reaction.value, closeTo(moving, .001));
    await tester.pumpWidget(
      surface(
        a,
        sessionState: 'attention',
        stateEffectSequence: 1,
        stateEffectKind: 'ready',
      ),
    );
    expect(openingPainter(tester).reaction.value, closeTo(moving, .001));
    await tester.pumpWidget(
      surface(
        a,
        sessionState: 'ready',
        stateEffectSequence: 2,
        stateEffectKind: 'ready',
      ),
    );
    expect(openingPainter(tester).reaction.value, 0);
    await tester.pumpWidget(
      surface(
        a,
        sessionState: 'error',
        stateEffectSequence: 3,
        stateEffectKind: 'error',
      ),
    );
    expect(openingPainter(tester).reaction.value, 0);
    await tester.pump(const Duration(milliseconds: 600));
    expect(openingPainter(tester).reaction.value, 1);
  });

  testWidgets('output bursts and connection boundaries stay with the console', (
    tester,
  ) async {
    const a = ConsoleAppearance(themeId: 'cyber', ambientMotion: false);
    await tester.pumpWidget(
      surface(a, sessionState: 'active', activity: 0, outputBurst: 0),
    );
    await tester.pumpWidget(
      surface(a, sessionState: 'active', activity: 1, outputBurst: 1),
    );
    expect(openingPainter(tester).reactionKind, 'output');
    await tester.pump(const Duration(milliseconds: 120));
    final moving = openingPainter(tester).reaction.value;
    await tester.pumpWidget(
      surface(
        a,
        sessionState: 'active',
        activity: 5,
        outputBurst: 1,
        text: 'Continuous output in the same burst',
      ),
    );
    expect(openingPainter(tester).reaction.value, closeTo(moving, .001));
    await tester.pump(const Duration(milliseconds: 300));
    expect(openingPainter(tester).reaction.value, 1);
    await tester.pumpWidget(
      surface(a, sessionState: 'active', activity: 5, outputBurst: 2),
    );
    expect(
      openingPainter(tester).reaction.value,
      1,
      reason: 'a new output burst inside the 1.5 s visual throttle must not restart the effect',
    );
    await tester.pumpWidget(
      surface(
        a,
        sessionState: 'active',
        activity: 5,
        outputBurst: 2,
        connected: false,
        connectionGeneration: 1,
      ),
    );
    expect(openingPainter(tester).reaction.value, 1);
    await tester.pumpWidget(
      surface(
        a,
        sessionState: 'active',
        activity: 6,
        outputBurst: 3,
        connected: true,
        connectionGeneration: 2,
      ),
    );
    expect(
      openingPainter(tester).reaction.value,
      1,
      reason: 'a reconnect checkpoint must not replay Cyber output',
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('Void empty-panel effect remains in the tablet detail pane', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final c = FakeDock();
    addTearDown(c.dispose);
    c.appearance = const ConsoleAppearance(
      themeId: 'void',
      starLevel: 2,
      ambientMotion: false,
    );
    c.state['sessions'] = <dynamic>[];
    c.selected = '';
    await tester.pumpWidget(DockApp(client: c));
    expect(find.text('New console'), findsOneWidget);
    expect(atmosphere(tester).emptyPanel, isTrue);
    final button = tester.widget<FilledButton>(
      find.ancestor(
        of: find.text('New console'),
        matching: find.byType(FilledButton),
      ),
    );
    expect(button.onPressed, isNotNull);
    expect(tester.takeException(), isNull);
  });

  test(
    'new-session and state events ignore initial and reconnect snapshots',
    () {
      final c = FakeDock();
      addTearDown(c.dispose);
      c.pairing = {'pin': 'pc'};
      c.generation = 4;
      Map<String, dynamic> packet(List<Map<String, dynamic>> sessions) => {
        'type': 'state',
        'state': {
          'sessions': sessions,
          'capabilities': <String>[],
          'alerts': <dynamic>[],
        },
      };
      final one = {'id': 'one', 'alive': true, 'state': 'active'};
      c.handleMessage(jsonEncode(packet([one])));
      expect(c.claimConsoleOpening('one'), isFalse);
      expect(c.consoleStateEffectSequence('one'), 0);
      c.handleMessage(
        jsonEncode(
          packet([
            {...one, 'state': 'attention'},
          ]),
        ),
      );
      expect(c.consoleStateEffectSequence('one'), 0);
      c.handleMessage(
        jsonEncode(
          packet([
            {...one, 'state': 'ready'},
          ]),
        ),
      );
      expect(c.consoleStateEffectSequence('one'), 1);
      expect(c.consoleStateEffectKind('one'), 'ready');
      c.handleMessage(
        jsonEncode(
          packet([
            {...one, 'state': 'attention'},
          ]),
        ),
      );
      expect(c.consoleStateEffectSequence('one'), 1);
      c.handleMessage(
        jsonEncode(
          packet([
            {...one, 'state': 'ready'},
          ]),
        ),
      );
      expect(c.consoleStateEffectSequence('one'), 2);
      c.handleMessage(
        jsonEncode(
          packet([
            {...one, 'state': 'ready'},
            {'id': 'two', 'alive': true, 'state': 'active'},
          ]),
        ),
      );
      expect(c.claimConsoleOpening('two'), isTrue);
      expect(c.claimConsoleOpening('two'), isFalse);
      expect(c.consoleStateEffectSequence('two'), 0);
      c.generation++;
      c.handleMessage(
        jsonEncode(
          packet([
            {...one, 'state': 'error'},
            {'id': 'two', 'alive': true, 'state': 'ready'},
          ]),
        ),
      );
      expect(c.consoleStateEffectSequence('one'), 2);
      expect(c.consoleStateEffectSequence('two'), 0);
      expect(c.claimConsoleOpening('two'), isFalse);
    },
  );

  test('live output tokens ignore checkpoints and reconnect history', () async {
    final c = FakeDock();
    addTearDown(c.dispose);
    c.pairing = {'pin': 'pc'};
    c.generation = 4;
    Map<String, dynamic> statePacket(String status) => {
      'type': 'state',
      'state': {
        'sessions': [
          {'id': 'one', 'alive': true, 'state': status},
        ],
        'capabilities': <String, dynamic>{},
        'alerts': <dynamic>[],
      },
    };
    void terminal(String value, int sequence, {bool reset = false}) =>
        c.handleMessage(
          jsonEncode({
            'type': 'terminal',
            'id': 'one',
            'data': value,
            'cols': 80,
            'rows': 24,
            'sequence': sequence,
            'epoch': reset ? sequence : 1,
            'reset': reset,
          }),
        );

    c.handleMessage(jsonEncode(statePacket('active')));
    terminal('checkpoint', 1, reset: true);
    expect(c.consoleOutputSequence('one'), 0);
    expect(c.consoleOutputBurstSequence('one'), 0);
    terminal('first live output', 2);
    expect(c.consoleOutputSequence('one'), 1);
    expect(c.consoleOutputBurstSequence('one'), 1);
    terminal('continuous output', 3);
    expect(c.consoleOutputSequence('one'), 2);
    expect(c.consoleOutputBurstSequence('one'), 1);

    terminal('same-generation parser checkpoint', 4, reset: true);
    expect(c.consoleOutputSequence('one'), 2);
    expect(c.consoleOutputBurstSequence('one'), 1);
    terminal('output after checkpoint', 5);
    expect(c.consoleOutputSequence('one'), 3);
    expect(c.consoleOutputBurstSequence('one'), 1);

    c.generation++;
    c.handleMessage(jsonEncode(statePacket('active')));
    terminal('reconnect history', 6);
    expect(c.consoleOutputSequence('one'), 3);
    expect(c.consoleOutputBurstSequence('one'), 1);
    terminal('reconnect checkpoint', 7, reset: true);
    terminal('immediate resumed output', 8);
    expect(c.consoleOutputSequence('one'), 4);
    expect(c.consoleOutputBurstSequence('one'), 1);

    await Future<void>.delayed(const Duration(milliseconds: 920));
    terminal('new output burst', 9);
    expect(c.consoleOutputSequence('one'), 5);
    expect(c.consoleOutputBurstSequence('one'), 2);
  });

  testWidgets(
    'motion stops for accessibility, background and hidden routes; stars remain',
    (tester) async {
      const a = ConsoleAppearance();
      await tester.pumpWidget(surface(a));
      await tester.pump(const Duration(milliseconds: 200));
      final moving = atmosphere(tester).phase.value;
      expect(moving, greaterThan(0));
      await tester.pumpWidget(surface(a, reduced: true));
      final frozen = atmosphere(tester).phase.value;
      await tester.pump(const Duration(seconds: 1));
      expect(atmosphere(tester).phase.value, frozen);
      expect(atmosphere(tester).opening.value, 1);
      expect(atmosphere(tester).appearance.stars, isTrue);
      await tester.pumpWidget(surface(a));
      await tester.pump(const Duration(milliseconds: 200));
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      final paused = atmosphere(tester).phase.value;
      await tester.pump(const Duration(seconds: 1));
      expect(atmosphere(tester).phase.value, paused);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpWidget(surface(a, enabled: false));
      final hidden = atmosphere(tester).phase.value;
      await tester.pump(const Duration(seconds: 1));
      expect(atmosphere(tester).phase.value, hidden);
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'theme/provider changes preserve stars, terminal, draft and reading position',
    (tester) async {
      final c = FakeDock();
      addTearDown(c.dispose);
      c.screen!.terminal.write(List.generate(80, (i) => '\r\nLine $i').join());
      await tester.pumpWidget(DockApp(client: c));
      await enterChat(tester);
      await tester.enterText(find.byType(TextField), 'Keep this draft');
      await tester.pumpAndSettle();
      final viewState = tester.state(find.byType(TerminalReadingView));
      final original = c.screen!.terminal;
      final text = original.buffer.getText();
      final scroll = tester
          .widget<SingleChildScrollView>(
            find.byKey(const ValueKey('terminal-reading-scroll')),
          )
          .controller!;
      scroll.jumpTo(100);
      await tester.pump();
      for (final theme in ConsoleTheme.all) {
        c.state['sessions'][0]['provider'] = theme.id == 'blue'
            ? 'claude'
            : 'codex';
        await c.setConsoleAppearance(c.appearance.copyWith(themeId: theme.id));
        await tester.pumpAndSettle();
        expect(atmosphere(tester).appearance.stars, isTrue);
        expect(tester.state(find.byType(TerminalReadingView)), same(viewState));
        expect(c.screen!.terminal, same(original));
        expect(original.buffer.getText(), text);
        expect(scroll.offset, 100);
        expect(find.text('Keep this draft'), findsOneWidget);
        expect(
          tester
              .widget<TerminalViewport>(find.byType(TerminalViewport))
              .theme
              .foreground,
          theme.foreground,
        );
      }
      expect(c.inputs, isEmpty);
      await useGrid(tester);
      expect(
        tester
            .widget<TerminalView>(find.byType(TerminalView))
            .backgroundOpacity,
        0,
      );
      expect(atmosphere(tester).appearance.stars, isTrue);
    },
  );

  testWidgets(
    'phone appearance controls fit narrow large text and save without a PC request',
    (tester) async {
      tester.view.physicalSize = const Size(320, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = FakeDock();
      addTearDown(c.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: MediaQuery(
              data: const MediaQueryData(textScaler: TextScaler.linear(2)),
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: ConsoleAppearanceControls(client: c),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(find.byType(Slider));
      await tester.drag(find.byType(Slider), const Offset(-600, 0));
      await tester.pumpAndSettle();
      expect(c.appearance.stars, isFalse);
      expect(c.calls, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'failed storage keeps the saved style and exposes a retryable error',
    (tester) async {
      final c = FakeDock(
        appearanceStore: ConsoleAppearanceStore(
          read: () async => null,
          write: (_) async => throw StateError('unavailable'),
        ),
      );
      addTearDown(c.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: ConsoleAppearanceControls(client: c),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final saved = c.appearance.ambientMotion;
      await tester.ensureVisible(find.text('Ambient motion'));
      await tester.tap(find.text('Ambient motion'));
      await tester.pumpAndSettle();
      expect(c.appearance.ambientMotion, saved);
      expect(
        find.text('Could not save appearance. Try again.'),
        findsOneWidget,
      );
      expect(
        tester
            .widget<SwitchListTile>(
              find.widgetWithText(SwitchListTile, 'Ambient motion'),
            )
            .onChanged,
        isNotNull,
      );
    },
  );
}
