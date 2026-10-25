import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/console_surface.dart';
import 'package:agent_dock_mobile/console_theme.dart';
import 'package:agent_dock_mobile/main.dart';

import 'widget_test.dart' show FakeDock, enterChat;

ConsoleOpeningPainter reactionPainter(WidgetTester tester) =>
    tester
            .widget<CustomPaint>(
              find.byKey(const ValueKey('console-opening')).first,
            )
            .painter!
        as ConsoleOpeningPainter;

void statePacket(FakeDock client, String status) {
  client.handleMessage(
    jsonEncode({
      'type': 'state',
      'state': {
        ...client.state,
        'sessions': [
          {...client.sessions.single, 'alive': true, 'state': status},
        ],
        'capabilities': <String>[],
        'alerts': <dynamic>[],
      },
    }),
  );
}

void terminalPacket(FakeDock client, int sequence, {bool reset = false}) {
  client.handleMessage(
    jsonEncode({
      'type': 'terminal',
      'id': 'one',
      'data': reset ? 'Restored history\r\n' : 'Live output $sequence\r\n',
      'cols': 80,
      'rows': 24,
      'sequence': sequence,
      'epoch': 1,
      'reset': reset,
    }),
  );
}

void main() {
  testWidgets(
    'phone history checkpoints never replay output or completion effects',
    (tester) async {
      tester.platformDispatcher.accessibilityFeaturesTestValue =
          const FakeAccessibilityFeatures();
      addTearDown(
        tester.platformDispatcher.clearAccessibilityFeaturesTestValue,
      );
      final client = FakeDock();
      addTearDown(client.dispose);
      client.appearance = const ConsoleAppearance(
        themeId: 'cyber',
        ambientMotion: false,
      );
      statePacket(client, 'active');
      await tester.pumpWidget(DockApp(client: client));
      await enterChat(tester);
      expect(reactionPainter(tester).reaction.value, 1);

      terminalPacket(client, 0, reset: true);
      await tester.pump();
      expect(
        reactionPainter(tester).reaction.value,
        1,
        reason: 'The first history checkpoint is not live output starting.',
      );

      // Two actual quiet intervals create prior live activity before replacement.
      // DateTime.now in the transport uses wall time, not the widget-test clock.
      for (var sequence = 1; sequence <= 2; sequence++) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 1700)),
        );
        terminalPacket(client, sequence);
        expect(client.consoleOutputBurstSequence('one'), sequence);
        await tester.pump();
        final surface = tester.widget<ConsoleSurface>(
          find.byType(ConsoleSurface).first,
        );
        expect(surface.sessionState, 'active');
        expect(surface.outputBurst, sequence);
        expect(surface.appearance.themeId, 'cyber');
        expect(surface.connected, isTrue);
        expect(surface.appearance.openingAnimations, isTrue);
        final context = tester.element(find.byType(ConsoleSurface).first);
        expect(TickerMode.valuesOf(context).enabled, isTrue);
        expect(consoleMotionReduced(context), isFalse);
        expect(ModalRoute.isCurrentOf(context), isNot(false));
        expect(
          reactionPainter(tester).reaction.value,
          lessThan(1),
          reason: 'Live output after a quiet interval should produce a Cyber reaction.',
        );
        await tester.pump(const Duration(milliseconds: 500));
        expect(reactionPainter(tester).reaction.value, 1);
      }

      terminalPacket(client, 3, reset: true);
      await tester.pump();
      expect(
        reactionPainter(tester).reaction.value,
        1,
        reason: 'Replacing the terminal parser within one connection must preserve the event baseline.',
      );

      client.connected = false;
      client.notifyListeners();
      await tester.pump();
      client.generation++;
      client.connected = true;
      client.notifyListeners();
      await tester.pump();
      statePacket(client, 'ready');
      await tester.pump();
      expect(
        reactionPainter(tester).reaction.value,
        1,
        reason: 'The first state after reconnect is a baseline, not a completion event.',
      );
      statePacket(client, 'active');
      await tester.pump();
      terminalPacket(client, 4, reset: true);
      await tester.pump();
      expect(
        reactionPainter(tester).reaction.value,
        1,
        reason: 'A later reconnect checkpoint must stay silent on the already mounted screen.',
      );
      expect(client.inputs, isEmpty);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
