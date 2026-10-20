import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/dock_client.dart';
import 'package:agent_dock_mobile/results_page.dart';
import 'package:agent_dock_mobile/console_drafts.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:xterm/xterm.dart';

class FakeDock extends DockClient {
  bool markdown = false;
  final calls = <String>[];
  final inputs = <Map<String, dynamic>>[];
  Future<void> Function(Map<String, dynamic>)? onInput;
  FakeDock({bool paired = true, ConsoleDrafts? drafts})
    : super(
        consoleDrafts:
            drafts ??
            ConsoleDrafts(read: () async => null, write: (_) async {}),
      ) {
    if (!paired) return;
    pairing = {'name': 'Test PC'};
    connected = true;
    selected = 'one';
    state = {
      'sessions': [
        {
          'id': 'one',
          'name': 'Trader',
          'provider': 'Codex',
          'slot': 1,
          'state': 'ready',
        },
      ],
      'unreadResults': 1,
    };
    screens['one'] = makeScreen('one')..terminal.write('Ready');
  }
  @override
  Future<dynamic> request(
    String method, [
    Map<String, dynamic> payload = const {},
  ]) async {
    calls.add(method);
    if (method == 'input') {
      inputs.add(Map.of(payload));
      await onInput?.call(payload);
    }
    if (method == 'results.list') {
      return [
        {
          'id': 'r1',
          'title': 'Changed code',
          'kind': 'code',
          'size': 100,
          'at': 1700000000000,
          'consoleKey': 'one',
          'consoleName': 'Trader',
          'groupId': 'turn1',
          'seenAt': null,
        },
      ];
    }
    if (method == 'results.preview') {
      if (markdown) {
        return {
          'text': '# Review ready\n\n**Checked** changes.\n\n| Check | Result |\n| --- | --- |\n| Pairing | Passed |\n\n```js\nconst ready = true;\n```\n\n![Remote](https://example.invalid/tracker.png)',
        };
      }
      return {
        'diff': {
          'notes': <dynamic>[],
          'changes': [
            {'file': 'app.js', 'type': 'modified', 'patch': '-old\n+new'},
          ],
        },
      };
    }
    if (method == 'usage') {
      return {
        'limits': <dynamic>[],
        'summary': {'cost': 0, 'unpriced': 1, 'requests': 1},
      };
    }
    return true;
  }
}

Future<void> enterChat(WidgetTester tester) async {
  final handle = find.byKey(const ValueKey('enter-chat'));
  if (handle.evaluate().isNotEmpty) {
    await tester.ensureVisible(handle);
    await tester.tap(handle);
    await tester.pumpAndSettle();
  }
}

Future<void> consoleAction(WidgetTester tester, String action) async {
  await tester.tap(find.byTooltip('More options'));
  await tester.pumpAndSettle();
  await tester.tap(find.text(action));
  await tester.pumpAndSettle();
}

Future<void> useGrid(WidgetTester tester) async {
  await consoleAction(tester, 'Text & display');
  await tester.tap(find.text('Grid'));
  await tester.pumpAndSettle();
  // Dismiss only the display sheet.
  await tester.tapAt(const Offset(10, 30));
  await tester.pumpAndSettle();
}

Future<void> chooseFile(WidgetTester tester) async {
  await enterChat(tester);
  await tester.tap(find.byTooltip('Attach'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Files'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('slow terminal swipes scroll without opening the keyboard', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(393, 852);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final c = FakeDock();
    addTearDown(c.dispose);
    c.screen!.terminal.write(
      List.generate(400, (i) => 'History line $i\r\n').join(),
    );
    await tester.pumpWidget(DockApp(client: c));
    await useGrid(tester);
    await tester.pumpAndSettle();
    final terminal = find.byType(TerminalView);
    final scroll = tester
        .state<ScrollableState>(
          find
              .descendant(of: terminal, matching: find.byType(Scrollable))
              .first,
        )
        .position;
    scroll.jumpTo(scroll.maxScrollExtent);
    await tester.pump();
    final before = scroll.pixels;
    final gesture = await tester.startGesture(
      tester.getRect(terminal).topLeft + const Offset(160, 180),
      kind: PointerDeviceKind.touch,
    );
    // xterm's tap-down callback runs before a slow touch becomes a drag.
    await tester.pump(const Duration(milliseconds: 150));
    expect(tester.testTextInput.isVisible, isFalse);
    expect(tester.widget<TerminalView>(terminal).focusNode!.hasFocus, isFalse);
    await gesture.moveBy(const Offset(0, 24));
    await tester.pump(const Duration(milliseconds: 20));
    await gesture.moveBy(const Offset(0, 106));
    await tester.pump(const Duration(milliseconds: 100));
    await gesture.up();
    await tester.pumpAndSettle();
    expect(scroll.pixels, lessThan(before));
    expect(tester.testTextInput.isVisible, isFalse);
    expect(c.inputs, isEmpty);

    await tester.dragFrom(
      tester.getRect(terminal).topLeft + const Offset(220, 150),
      const Offset(-140, 0),
      kind: PointerDeviceKind.touch,
    );
    await tester.pumpAndSettle();
    expect(tester.testTextInput.isVisible, isFalse);
    expect(c.inputs, isEmpty);
  });

  testWidgets('terminal taps and long presses do not start typing', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await useGrid(tester);
    await tester.pumpAndSettle();
    final terminal = find.byType(TerminalView);
    await tester.tap(terminal);
    await tester.pumpAndSettle();
    expect(tester.testTextInput.isVisible, isFalse);
    await tester.longPress(terminal);
    await tester.pumpAndSettle();
    expect(tester.testTextInput.isVisible, isFalse);
    expect(c.inputs, isEmpty);
  });

  testWidgets('direct typing is explicit and scrolling closes its keyboard', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(393, 852);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final c = FakeDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    final keyboardButton = tester.getRect(find.byTooltip('More options'));
    expect(keyboardButton.right, lessThanOrEqualTo(393));
    await consoleAction(tester, 'Type directly in terminal');
    await tester.pumpAndSettle();
    expect(tester.testTextInput.isVisible, isTrue);
    tester.testTextInput.enterText('  hello');
    await tester.pump();
    expect(c.inputs, [
      {'id': 'one', 'data': 'hello'},
    ]);

    final readingPoint =
        tester.getTopLeft(find.byType(TerminalView)) + const Offset(150, 150);
    await tester.dragFrom(readingPoint, const Offset(0, 100));
    await tester.pumpAndSettle();
    expect(tester.testTextInput.isVisible, isFalse);
    await tester.tapAt(readingPoint);
    await tester.pumpAndSettle();
    expect(tester.testTextInput.isVisible, isFalse);
    expect(c.inputs, hasLength(1));

    await consoleAction(tester, 'Type directly in terminal');
    await tester.pumpAndSettle();
    expect(tester.testTextInput.isVisible, isTrue);
  });

  testWidgets(
    'reading the terminal dismisses the composer and keeps its draft',
    (tester) async {
      final c = FakeDock();
      addTearDown(c.dispose);
      await tester.pumpWidget(DockApp(client: c));
      await enterChat(tester);
      await tester.enterText(find.byType(TextField).last, 'keep this draft');
      await tester.drag(
        find.byKey(const ValueKey('terminal-reading-scroll')),
        const Offset(0, 100),
      );
      await tester.pumpAndSettle();
      expect(tester.testTextInput.isVisible, isFalse);
      expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        'keep this draft',
      );
      expect(c.inputs, isEmpty);
    },
  );

  testWidgets('dismissing the direct keyboard does not let touches reopen it', (
    tester,
  ) async {
    addTearDown(tester.view.resetViewInsets);
    final c = FakeDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await consoleAction(tester, 'Type directly in terminal');
    await tester.pumpAndSettle();
    expect(tester.testTextInput.isVisible, isTrue);
    tester.view.viewInsets = const FakeViewPadding(bottom: 150);
    await tester.pumpAndSettle();
    tester.testTextInput.hide();
    tester.view.viewInsets = FakeViewPadding.zero;
    await tester.pumpAndSettle();
    await tester.tap(find.byType(TerminalView));
    await tester.pumpAndSettle();
    expect(tester.testTextInput.isVisible, isFalse);
    await consoleAction(tester, 'Type directly in terminal');
    await tester.pumpAndSettle();
    expect(tester.testTextInput.isVisible, isTrue);
  });

  test(
    'plain shells receive text and Enter separately without paste markers',
    () async {
      final c = FakeDock();
      addTearDown(c.dispose);
      await c.submit('Write-Host ready');
      expect(c.inputs, [
        {'id': 'one', 'data': 'Write-Host ready'},
        {'id': 'one', 'data': '\r'},
      ]);
    },
  );
  for (final change in ['console', 'connection', 'background', 'reconnect']) {
    test('submission does not send Enter after $change changes', () async {
      final c = FakeDock();
      addTearDown(c.dispose);
      c.onInput = (_) async {
        switch (change) {
          case 'console':
            c.selected = 'two';
          case 'connection':
            c.connected = false;
          case 'background':
            c.foreground = false;
          case 'reconnect':
            c.generation++;
        }
      };
      await expectLater(c.submit('keep this draft'), throwsStateError);
      expect(c.inputs, [
        {'id': 'one', 'data': 'keep this draft'},
      ]);
    });
  }
  testWidgets('a failed Send keeps the draft and does not send Enter', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    c.onInput = (_) async => throw StateError(
      'Connection lost. Check the console before sending again.',
    );
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    await tester.enterText(find.byType(TextField).last, 'keep my message');
    await tester.pump();
    await tester.tap(find.byTooltip('Send to console'));
    await tester.pumpAndSettle();
    expect(c.inputs, hasLength(1));
    expect(
      tester.widget<TextField>(find.byType(TextField).last).controller!.text,
      'keep my message',
    );
    expect(find.textContaining('Connection lost.'), findsOneWidget);
  });
  testWidgets('Send pastes a message, then submits with a separate Enter', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    c.screen!.terminal.write('\x1b[?2004h');
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    await tester.enterText(
      find.byType(TextField).last,
      'first line\nsecond line',
    );
    await tester.pump();
    await tester.tap(find.byTooltip('Send to console'));
    await tester.pump();
    expect(c.inputs, [
      {'id': 'one', 'data': '\x1b[200~first line\nsecond line\x1b[201~'},
    ]);
    await tester.pump(const Duration(milliseconds: 100));
    expect(c.inputs, hasLength(1));
    await tester.pump(const Duration(milliseconds: 150));
    await tester.pumpAndSettle();
    expect(c.inputs.last, {'id': 'one', 'data': '\r'});
    expect(c.inputs, hasLength(2));
    expect(
      tester.widget<TextField>(find.byType(TextField).last).controller!.text,
      isEmpty,
    );
  });

  test(
    'a resize checkpoint replaces old screen contents and terminal modes',
    () {
      final c = FakeDock();
      addTearDown(c.dispose);
      void frame(String data, int cols, int rows, int epoch) => c.handleMessage(
        jsonEncode({
          'type': 'terminal',
          'id': 'one',
          'data': data,
          'cols': cols,
          'rows': rows,
          'sequence': epoch,
          'epoch': epoch,
          'reset': true,
        }),
      );
      frame('\x1b[?1049h\x1b[?2004hSTALE SCREEN\x1b[6;1HOLD FOOTER', 80, 24, 1);
      frame('Fresh screen', 40, 12, 2);
      expect(c.screen!.terminal.buffer.getText().trim(), 'Fresh screen');
      expect(c.screen!.terminal.bracketedPasteMode, false);
      expect(c.screen!.terminal.viewWidth, 40);
      expect(c.screen!.terminal.viewHeight, 12);
      expect(
        c.inputs,
        isEmpty,
        reason:
            'screen restoration must never send terminal replies as user input',
      );
    },
  );

  test('removed consoles release their phone scrollback', () {
    final client = FakeDock();
    client.handleMessage(
      jsonEncode({
        'type': 'state',
        'state': {'sessions': [], 'unreadResults': 0},
      }),
    );
    expect(client.screens, isEmpty);
    expect(client.selected, isEmpty);
    client.dispose();
  });
  testWidgets(
    'Markdown reports render native headings, tables and code without remote images',
    (tester) async {
      tester.view.physicalSize = const Size(393, 852);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = FakeDock()..markdown = true;
      addTearDown(c.dispose);
      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.dark(),
          home: ResultDetail(
            client: c,
            item: const {'id': 'r1', 'title': 'Verification', 'ext': '.md'},
            ids: const ['r1'],
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(MarkdownBody), findsOneWidget);
      expect(
        find.textContaining('Review ready', findRichText: true),
        findsWidgets,
      );
      expect(find.byType(Table), findsOneWidget);
      expect(find.byType(Image), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  test('pairing rejects public hosts, expired codes and malformed pins', () {
    Map<String, dynamic> invite() => {
      'v': 1,
      'url': 'https://100.64.0.2:47831',
      'pin': 'a' * 64,
      'secret': 'b' * 43,
      'expires': DateTime.now().millisecondsSinceEpoch + 60000,
    };
    String code(Map<String, dynamic> data) =>
        'agentdock:${base64Url.encode(utf8.encode(jsonEncode(data)))}';
    expect(DockClient.parseInvite(code(invite()))['v'], 1);
    expect(
      () => DockClient.parseInvite(
        code(invite()..['url'] = 'https://public.example:47831'),
      ),
      throwsFormatException,
    );
    expect(
      () => DockClient.parseInvite(code(invite()..['expires'] = 1)),
      throwsFormatException,
    );
    expect(
      () => DockClient.parseInvite(code(invite()..['pin'] = 'wrong')),
      throwsFormatException,
    );
    expect(
      () => DockClient.parseInvite(
        code(invite()..['url'] = 'http://100.64.0.2:47831'),
      ),
      throwsFormatException,
    );
  });
  testWidgets(
    'pairing screen fits a narrow phone and keeps pasted codes after errors',
    (tester) async {
      tester.view.physicalSize = const Size(360, 780);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = FakeDock(paired: false);
      addTearDown(c.dispose);
      await tester.pumpWidget(DockApp(client: c));
      expect(find.text('Scan QR code'), findsOneWidget);
      await tester.enterText(
        find.widgetWithText(TextField, 'Or paste a pairing code'),
        'not a code',
      );
      await tester.ensureVisible(find.text('Connect'));
      await tester.tap(find.text('Connect'));
      await tester.pumpAndSettle();
      expect(find.text('not a code'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  test('internet invitations require explicit version and pin, with a private local fallback', () {
    final invite = <String, dynamic>{
      'v': 2,
      'mode': 'internet',
      'url': 'https://dock-demo.duckdns.org:47831',
      'localUrl': 'https://192.168.1.5:47831',
      'pin': 'a' * 64,
      'secret': 'b' * 43,
      'expires': DateTime.now().millisecondsSinceEpoch + 60000,
    };
    String code(Map<String, dynamic> data) =>
        'agentdock:${base64Url.encode(utf8.encode(jsonEncode(data)))}';
    expect(DockClient.parseInvite(code(invite))['mode'], 'internet');
    expect(DockClient.endpoints(invite), [
      'https://192.168.1.5:47831',
      'https://dock-demo.duckdns.org:47831',
    ]);
    for (final url in [
      'http://host.com:47831',
      'https://user@host.com:47831',
      'https://host.com:47831/path',
      'https://host.local:47831',
      'https://127.0.0.1:47831',
      'https://169.254.169.254:47831',
      'https://host.com:47831?token=bad',
    ]) {
      expect(
        () => DockClient.parseInvite(code({...invite, 'url': url})),
        throwsFormatException,
      );
    }
    expect(
      () => DockClient.parseInvite(
        code({...invite, 'localUrl': 'https://other.com:47831'}),
      ),
      throwsFormatException,
    );
    expect(
      () => DockClient.parseInvite(code({...invite, 'v': 1})),
      throwsFormatException,
    );
    expect(
      () => DockClient.parseInvite(code({...invite, 'mode': 'local'})),
      throwsFormatException,
    );
    expect(
      () => DockClient.parseInvite(code({...invite, 'pin': ''})),
      throwsFormatException,
    );
  });
  testWidgets(
    'Results loads code on demand, and console drafts survive page changes',
    (tester) async {
      tester.view.physicalSize = const Size(393, 852);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = FakeDock();
      addTearDown(c.dispose);
      await tester.pumpWidget(DockApp(client: c));
      await enterChat(tester);
      await tester.enterText(
        find.byType(TextField).last,
        'inspect this project',
      );
      await tester.tap(find.text('Results').last);
      await tester.pumpAndSettle();
      expect(find.text('Changed code'), findsOneWidget);
      expect(c.calls.contains('results.preview'), false);
      await tester.tap(find.text('Changed code'));
      await tester.pumpAndSettle();
      expect(find.text('app.js'), findsOneWidget);
      expect(find.text('+new'), findsOneWidget);
      expect(c.calls.contains('results.seen'), true);
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Console').last);
      await tester.pumpAndSettle();
      expect(find.text('inspect this project'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
