import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:xterm/xterm.dart';

import 'widget_test.dart' show FakeDock;

void main() {
  for (final size in [
    const Size(320, 740),
    const Size(393, 852),
    const Size(852, 393),
    const Size(1024, 768),
  ]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('Fit width contains 240 columns at $size / text $scale', (
        tester,
      ) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        tester.platformDispatcher.textScaleFactorTestValue = scale;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        final c = FakeDock();
        addTearDown(c.dispose);
        final screen = c.screen!;
        screen.cols = 240;
        screen.rows = 40;
        screen.terminal.resize(screen.cols, screen.rows);
        screen.terminal.write('\r\n${'a' * 239}Z');
        await tester.pumpWidget(DockApp(client: c));
        await tester.pumpAndSettle();

        await tester.tap(find.byTooltip('Show the original terminal grid'));
        await tester.pumpAndSettle();
        final view = find.byType(TerminalView);
        final render = tester.state<TerminalViewState>(view).renderTerminal;
        // Check the renderer's actual font metrics, not the sizing calculation.
        expect(
          render.cellSize.width * 240,
          lessThanOrEqualTo(render.size.width),
        );
        expect(tester.getRect(view).right, lessThanOrEqualTo(size.width));
        expect(screen.terminal.viewWidth, 240);
        expect(screen.terminal.viewHeight, 40);
        expect(tester.widget<TerminalView>(view).autoResize, isFalse);
        expect(c.inputs, isEmpty);
        expect(c.calls.where((x) => x.contains('resize')), isEmpty);
        expect(tester.takeException(), isNull);
        expect(
          tester.getRect(find.byTooltip('Agent commands')).right,
          lessThanOrEqualTo(size.width),
        );
      });
    }
  }

  testWidgets(
    'narrow phone keeps input and Send inside the keyboard viewport',
    (tester) async {
      tester.view.physicalSize = const Size(320, 740);
      tester.view.devicePixelRatio = 1;
      tester.view.viewInsets = const FakeViewPadding(bottom: 300);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetViewInsets);
      final c = FakeDock();
      addTearDown(c.dispose);
      await tester.pumpWidget(DockApp(client: c));
      await tester.enterText(find.byType(TextField).last, 'A draft');
      await tester.pumpAndSettle();
      final send = tester.getRect(find.byTooltip('Send to console'));
      expect(send.right, lessThanOrEqualTo(320));
      expect(send.bottom, lessThanOrEqualTo(440));
      expect(find.byType(NavigationBar), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('rotation keeps the prompt visible above blank trailing rows', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(393, 852);
    tester.view.devicePixelRatio = 1;
    tester.view.padding = const FakeViewPadding(top: 24, bottom: 24);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPadding);
    final c = FakeDock();
    addTearDown(c.dispose);
    c.screen!.cols = 80;
    c.screen!.terminal.resize(80, 32);
    c.screen!.terminal.write('\r\n${'Output\r\n' * 20}> ');
    await tester.pumpWidget(DockApp(client: c));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Show the original terminal grid'));
    await tester.pumpAndSettle();
    tester.view.physicalSize = const Size(852, 393);
    await tester.pumpAndSettle();
    final render = tester
        .state<TerminalViewState>(find.byType(TerminalView))
        .renderTerminal;
    expect(render.cursorOffset.dy, greaterThanOrEqualTo(0));
    expect(
      render.cursorOffset.dy + render.cellSize.height,
      lessThanOrEqualTo(render.size.height + 0.01),
    );
    expect(c.screen!.terminal.viewWidth, 80);
    expect(
      tester.getRect(find.byTooltip('Send to console')).bottom,
      lessThanOrEqualTo(tester.getRect(find.byType(NavigationBar)).top),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('changing display size preserves a reader in older output', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(393, 852);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final c = FakeDock();
    addTearDown(c.dispose);
    c.screen!.terminal.write('Older output\r\n' * 300);
    await tester.pumpWidget(DockApp(client: c));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Show the original terminal grid'));
    await tester.pumpAndSettle();
    final view = find.byType(TerminalView);
    final controller = tester.widget<TerminalView>(view).scrollController!;
    final render = tester.state<TerminalViewState>(view).renderTerminal;
    controller.jumpTo(render.cellSize.height * 25);
    await tester.pumpAndSettle();
    tester.view.physicalSize = const Size(411, 852);
    await tester.pumpAndSettle();
    final resized = tester.state<TerminalViewState>(view).renderTerminal;
    expect(controller.offset / resized.cellSize.height, closeTo(25, 0.01));
    expect(tester.testTextInput.isVisible, isFalse);
    expect(c.inputs, isEmpty);
  });

  for (final size in [const Size(320, 740), const Size(852, 393)]) {
    testWidgets('large text and keyboard fit at $size', (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      tester.view.viewInsets = FakeViewPadding(
        bottom: size.width < 400 ? 300 : 160,
      );
      tester.view.padding = const FakeViewPadding(top: 24);
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetViewInsets);
      addTearDown(tester.view.resetPadding);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final c = FakeDock();
      addTearDown(c.dispose);
      await tester.pumpWidget(DockApp(client: c));
      await tester.enterText(find.byType(TextField).last, 'Keep this request');
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final send = find.byTooltip('Send to console');
      await tester.ensureVisible(send);
      await tester.pumpAndSettle();
      expect(tester.getRect(send).right, lessThanOrEqualTo(size.width));
      expect(
        tester.getRect(send).bottom,
        lessThanOrEqualTo(size.height - tester.view.viewInsets.bottom),
      );
    });
  }

  testWidgets('commands sheet fits a narrow phone with large text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 740);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final c = FakeDock();
    c.sessions.first['provider'] = 'claude';
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await tester.tap(find.byTooltip('Agent commands'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.ensureVisible(find.text('Model'));
    await tester.tap(find.text('Model'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(c.inputs, isEmpty);
  });

  for (final provider in {
    'Codex': '/model',
    'claude': '/model',
    'opencode': '/models',
    'gemini': '/model manage',
  }.entries) {
    testWidgets('${provider.key} model command waits for Send', (tester) async {
      final c = FakeDock();
      addTearDown(c.dispose);
      c.sessions.first['provider'] = provider.key;
      await tester.pumpWidget(DockApp(client: c));
      await tester.tap(find.byTooltip('Agent commands'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Model'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        provider.value,
      );
      expect(c.inputs, isEmpty);
      expect(tester.testTextInput.isVisible, isFalse);
      await tester.tap(find.byTooltip('Send to console'));
      await tester.pumpAndSettle();
      expect(c.inputs, [
        {'id': 'one', 'data': provider.value},
        {'id': 'one', 'data': '\r'},
      ]);
    });
  }

  testWidgets('choosing a command preserves a draft unless replaced', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    final field = find.byType(TextField).last;
    await tester.enterText(field, 'keep my unfinished request');
    await tester.tap(find.byTooltip('Agent commands'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Model'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Keep draft'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<TextField>(field).controller!.text,
      'keep my unfinished request',
    );
    await tester.tap(find.byTooltip('Agent commands'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Model'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Replace'));
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(field).controller!.text, '/model');
    expect(c.inputs, isEmpty);
  });

  testWidgets('a command menu cannot target a newly selected console', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await tester.tap(find.byTooltip('Agent commands'));
    await tester.pumpAndSettle();
    c.selected = 'two';
    c.notifyListeners();
    await tester.pumpAndSettle();
    expect(
      find.text('Connection or console changed. Reopen this menu.'),
      findsOneWidget,
    );
    await tester.tap(find.text('Model'));
    await tester.pumpAndSettle();
    expect(c.inputs, isEmpty);
    expect(find.text('Codex commands'), findsOneWidget);
    await tester.tap(find.byTooltip('Close commands'));
    await tester.pumpAndSettle();
    expect(find.text('Codex commands'), findsNothing);
  });

  testWidgets('a staged command is not sent after a reconnect', (tester) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await tester.tap(find.byTooltip('Agent commands'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Model'));
    await tester.pumpAndSettle();
    c.generation++;
    await tester.tap(find.byTooltip('Send to console'));
    await tester.pumpAndSettle();
    expect(c.inputs, isEmpty);
    expect(
      find.text('Console changed. Choose the command again.'),
      findsOneWidget,
    );
  });

  for (final provider in ['shell', 'custom', 'unsupported']) {
    testWidgets('$provider has no guessed AI command shortcuts', (
      tester,
    ) async {
      final c = FakeDock();
      addTearDown(c.dispose);
      c.sessions.first['provider'] = provider;
      await tester.pumpWidget(DockApp(client: c));
      expect(find.byTooltip('Agent commands'), findsNothing);
      expect(find.byTooltip('Type directly in terminal'), findsOneWidget);
    });
  }
}
