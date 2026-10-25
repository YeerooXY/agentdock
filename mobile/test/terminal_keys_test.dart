import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/terminal_keys.dart';

import 'widget_test.dart' show FakeDock, enterChat;

Future<void> openKeys(WidgetTester tester, FakeDock c) async {
  await tester.pumpWidget(DockApp(client: c));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Terminal keys'));
  await tester.pumpAndSettle();
}

void main() {
  for (final provider in ['claude', 'codex', 'gemini', 'opencode', 'shell']) {
    testWidgets(
      '$provider folder trust can be navigated, confirmed and cancelled without chat input',
      (tester) async {
        final c = FakeDock();
        addTearDown(c.dispose);
        c.sessions.first['provider'] = provider;
        c.sessions.first['state'] =
            'open'; // Startup trust can precede status hooks.
        c.sessions.first['cwd'] = '/test/project';
        final terminal = c.screen!.terminal;
        terminal.write(
          '\x1b[2J\x1b[HDo you trust this folder?\r\n/test/project\r\n> 1. Trust folder\r\n  2. Cancel\r\nEnter to confirm, Esc to cancel',
        );
        await openKeys(tester, c);
        expect(
          find.descendant(
            of: find.byType(TerminalKeys),
            matching: find.textContaining('Do you trust this folder?'),
          ),
          findsOneWidget,
        );
        expect(c.inputs, isEmpty);
        await tester.tap(find.text('Down'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Enter'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Esc'));
        await tester.pumpAndSettle();
        expect(c.inputs.map((x) => x['data']), ['\x1b[B', '\r', '\x1b']);
        expect(c.inputs.every((x) => x['id'] == 'one'), isTrue);
        expect(
          terminal.viewWidth,
          80,
          reason: 'The phone does not resize the PC',
        );
        await tester.tap(find.byTooltip('Close terminal keys'));
        await tester.pumpAndSettle();
        expect(c.inputs.length, 3);
      },
    );
  }

  testWidgets(
    'raw replies preserve the draft and send no paste markers or extra Enter',
    (tester) async {
      final c = FakeDock();
      addTearDown(c.dispose);
      c.screen!.terminal.write('\x1b[?2004hAllow access? [y/n]');
      await tester.pumpWidget(DockApp(client: c));
      await enterChat(tester);
      await tester.enterText(find.byType(TextField).last, 'Keep my draft');
      await tester.tap(find.byTooltip('Terminal keys'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'Reply text'), 'y');
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Type text'));
      await tester.tap(find.text('Type text'));
      await tester.pumpAndSettle();
      expect(c.inputs, [
        {'id': 'one', 'data': 'y'},
      ]);
      await tester.tap(find.byTooltip('Close terminal keys'));
      await tester.pumpAndSettle();
      expect(find.text('Keep my draft'), findsOneWidget);
    },
  );

  for (final change in [
    'console',
    'computer',
    'generation',
    'provider',
    'chat',
    'ended',
    'background',
  ]) {
    testWidgets('$change invalidates an open key sheet without replay', (
      tester,
    ) async {
      final c = FakeDock();
      addTearDown(c.dispose);
      await openKeys(tester, c);
      if (change == 'console') c.selected = 'other';
      if (change == 'computer') {
        c.pairing = {'pin': 'other', 'name': 'Other PC'};
      }
      if (change == 'generation') c.generation++;
      if (change == 'provider') c.sessions.first['provider'] = 'claude';
      if (change == 'chat') c.sessions.first['providerSessionId'] = 'other';
      if (change == 'ended') c.sessions.first['alive'] = false;
      if (change == 'background') c.foreground = false;
      c.notifyListeners();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Enter'));
      await tester.pumpAndSettle();
      expect(c.inputs, isEmpty);
      expect(
        find.textContaining('Connection or console changed'),
        findsOneWidget,
      );
    });
  }

  testWidgets(
    'delivery failures do not replay and pending input blocks double presses',
    (tester) async {
      final c = FakeDock();
      addTearDown(c.dispose);
      final done = Completer<void>();
      c.onInput = (_) => done.future;
      await openKeys(tester, c);
      await tester.tap(find.text('Enter'));
      await tester.pump();
      await tester.tap(find.text('Enter'));
      expect(c.inputs.length, 1);
      done.completeError(StateError('Disconnected'));
      await tester.pumpAndSettle();
      expect(c.inputs.length, 1);
      expect(find.textContaining('Could not confirm delivery'), findsOneWidget);
    },
  );

  testWidgets(
    'terminal application cursor mode and live prompt updates are retained',
    (tester) async {
      final c = FakeDock();
      addTearDown(c.dispose);
      await openKeys(tester, c);
      c.screen!.terminal.write('\x1b[?1h\r\nPermission changed');
      await tester.pumpAndSettle();
      expect(
        find.descendant(
          of: find.byType(TerminalKeys),
          matching: find.textContaining('Permission changed'),
        ),
        findsOneWidget,
      );
      await tester.tap(find.text('Up'));
      await tester.pumpAndSettle();
      expect(c.inputs.single['data'], '\x1bOA');
    },
  );

  for (final size in [const Size(320, 740), const Size(852, 393)]) {
    testWidgets('key sheet reflows with large text and keyboard at $size', (
      tester,
    ) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      tester.view.viewInsets = FakeViewPadding(
        bottom: size.width < 400 ? 300 : 140,
      );
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetViewInsets);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final c = FakeDock();
      addTearDown(c.dispose);
      await openKeys(tester, c);
      for (final text in ['Enter', 'Esc', 'Type text']) {
        await tester.ensureVisible(find.text(text));
        await tester.pumpAndSettle();
        final rect = tester.getRect(find.text(text));
        expect(rect.right, lessThanOrEqualTo(size.width));
        expect(
          rect.bottom,
          lessThanOrEqualTo(size.height - tester.view.viewInsets.bottom),
        );
      }
      expect(tester.takeException(), isNull);
      expect(c.inputs, isEmpty);
    });
  }
}
