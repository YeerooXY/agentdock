import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/terminal_keys.dart';

import 'widget_test.dart' show FakeDock, enterChat, composerAction;

Future<void> openKeys(WidgetTester tester, FakeDock c) async {
  await tester.pumpWidget(DockApp(client: c));
  await tester.pumpAndSettle();
  await composerAction(tester, 'Terminal keys');
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
        await tester.tap(find.byTooltip('Down'));
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
      await composerAction(tester, 'Terminal keys');
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'Reply text'), 'y');
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Send text'));
      await tester.tap(find.text('Send text'));
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
      await tester.tap(find.byTooltip('Up'));
      await tester.pumpAndSettle();
      expect(c.inputs.single['data'], '\x1bOA');
    },
  );

  testWidgets('arrows form an inverted T and modifiers apply to one key', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    await openKeys(tester, c);
    final up = tester.getCenter(find.byTooltip('Up')),
        left = tester.getCenter(find.byTooltip('Left')),
        down = tester.getCenter(find.byTooltip('Down')),
        right = tester.getCenter(find.byTooltip('Right'));
    expect(up.dy, lessThan(down.dy));
    expect(left.dy, down.dy);
    expect(right.dy, down.dy);
    expect(left.dx, lessThan(down.dx));
    expect(down.dx, lessThan(right.dx));
    expect((up.dx - down.dx).abs(), lessThan(1));
    await tester.tap(find.text('Ctrl'));
    await tester.tap(find.text('Shift'));
    await tester.pumpAndSettle();
    expect(c.inputs, isEmpty);
    await tester.tap(find.byTooltip('Up'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Up'));
    await tester.pumpAndSettle();
    expect(c.inputs.map((x) => x['data']), ['\x1b[1;6A', '\x1b[A']);
    await tester.tap(find.text('Shift'));
    await tester.tap(find.text('Tab'));
    await tester.pumpAndSettle();
    expect(c.inputs.last['data'], '\x1b[Z');
  });

  testWidgets('phone keycaps align and keep focus through keyboard input', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final c = FakeDock();
    addTearDown(c.dispose);
    final done = Completer<void>();
    c.onInput = (_) => done.future;
    await openKeys(tester, c);

    Rect keyRect(String label) =>
        tester.getRect(find.widgetWithText(OutlinedButton, label));
    for (final (top, bottom) in [
      ('Esc', 'Ctrl'),
      ('Tab', 'Shift'),
      ('Space', 'Alt'),
      ('Enter', 'Ctrl+C'),
    ]) {
      expect(keyRect(top).left, closeTo(keyRect(bottom).left, .01));
      expect(keyRect(top).top, keyRect('Esc').top);
      expect(keyRect(bottom).top, keyRect('Ctrl').top);
      expect(keyRect(top).height, greaterThanOrEqualTo(48));
      expect(keyRect(bottom).width, greaterThanOrEqualTo(48));
    }

    FocusNode focus(String label) => Focus.of(tester.element(find.text(label)));
    focus('Ctrl').requestFocus();
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.space);
    await tester.pumpAndSettle();
    expect(focus('Ctrl').hasPrimaryFocus, isTrue);
    expect(c.inputs, isEmpty);
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pumpAndSettle();
    expect(focus('Shift').hasPrimaryFocus, isTrue);
    await tester.sendKeyDownEvent(LogicalKeyboardKey.shiftLeft);
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.shiftLeft);
    await tester.pumpAndSettle();
    expect(focus('Ctrl').hasPrimaryFocus, isTrue);
    await tester.sendKeyDownEvent(LogicalKeyboardKey.shiftLeft);
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.shiftLeft);
    await tester.pumpAndSettle();
    expect(focus('Enter').hasPrimaryFocus, isTrue);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    expect(focus('Enter').hasPrimaryFocus, isTrue);
    expect(c.inputs.single['data'], '\r');
    done.complete();
    await tester.pumpAndSettle();
    expect(focus('Enter').hasPrimaryFocus, isTrue);
  });

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
      for (final text in ['Enter', 'Esc', 'Send text']) {
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
