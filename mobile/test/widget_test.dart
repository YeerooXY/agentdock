import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/dock_client.dart';
import 'package:agent_dock_mobile/results_page.dart';
import 'package:agent_dock_mobile/console_drafts.dart';
import 'package:agent_dock_mobile/console_theme.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:xterm/xterm.dart';

class FakeDock extends DockClient {
  bool markdown = false;
  final calls = <String>[];
  final payloads = <Map<String, dynamic>>[];
  final inputs = <Map<String, dynamic>>[];
  Future<void> Function(Map<String, dynamic>)? onInput;
  Future<void> Function(String, Map<String, dynamic>)? onRequest;
  FakeDock({
    bool paired = true,
    ConsoleDrafts? drafts,
    ConsoleAppearanceStore? appearanceStore,
  }) : super(
         consoleAppearanceStore:
             appearanceStore ??
             ConsoleAppearanceStore(
               read: () async => null,
               write: (_) async {},
             ),
         consoleDrafts:
             drafts ??
             ConsoleDrafts(read: () async => null, write: (_) async {}),
       ) {
    // Interaction tests settle after finite animations; motion has its own
    // deterministic lifecycle tests in console_appearance_test.dart.
    appearance = const ConsoleAppearance(ambientMotion: false);
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
    payloads.add(Map.of(payload));
    await onRequest?.call(method, payload);
    if (method == 'input') {
      inputs.add(Map.of(payload));
      await onInput?.call(payload);
    }
    if (method == 'console.models') {
      return {
        'models': [
          {
            'id': 'test-model-a',
            'name': 'Test Model A',
            'efforts': ['low', 'high'],
            'defaultEffort': 'low',
          },
          {
            'id': 'test-model-b',
            'name': 'Test Model B',
            'efforts': ['low', 'high'],
            'defaultEffort': 'low',
          },
        ],
      };
    }
    if (method == 'console.setup') {
      return {'id': 'setup-console', 'cwd': r'C:\Projects\Test'};
    }
    if (method == 'settings.summary') {
      return {'apis': [], 'keys': [], 'tools': [], 'instructions': ''};
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
  test('pairing accepts only codes for a Tailscale address', () {
    final invite = <String, dynamic>{
      'v': 1,
      'url': 'https://192.168.1.5:47831',
      'pin': 'a' * 64,
      'secret': 'b' * 43,
      'expires': DateTime.now().millisecondsSinceEpoch + 60000,
    };
    String code(Map<String, dynamic> data) =>
        'agentdock:${base64Url.encode(utf8.encode(jsonEncode(data)))}';
    // A PC still set up for Wi-Fi or direct internet gets the way forward.
    for (final old in [
      invite,
      {...invite, 'url': 'https://10.0.0.4:47831'},
      {
        ...invite,
        'v': 2,
        'mode': 'internet',
        'url': 'https://dock-demo.duckdns.org:47831',
        'localUrl': 'https://192.168.1.5:47831',
      },
    ]) {
      expect(
        () => DockClient.parseInvite(code(old)),
        throwsA(
          isA<FormatException>().having(
            (e) => e.message,
            'message',
            contains('not set up for Tailscale'),
          ),
        ),
      );
    }
    final tailnet = {...invite, 'url': 'https://100.101.102.103:47831'};
    expect(DockClient.parseInvite(code(tailnet))['v'], 1);
    expect(
      () => DockClient.parseInvite(
        code({...tailnet, 'localUrl': 'https://192.168.1.5:47831'}),
      ),
      throwsFormatException,
    );
    for (final url in [
      'https://127.0.0.1:47831',
      'https://169.254.169.254:47831',
      'https://100.128.0.1:47831',
    ]) {
      expect(
        () => DockClient.parseInvite(code({...tailnet, 'url': url})),
        throwsFormatException,
      );
    }
    expect(
      DockClient.endpoints({
        'url': 'https://192.168.1.5:47831',
        'localUrl': 'https://192.168.1.5:47831',
        'manualUrl': 'https://100.101.102.103:47831',
      }),
      ['https://100.101.102.103:47831'],
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
      expect(find.text('Revision unavailable'), findsNothing);
      expect(find.text('+new'), findsNothing);
      await tester.tap(find.text('app.js'));
      await tester.pumpAndSettle();
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

  testWidgets(
    'account switch stays pinned through rebuild and keeps the phone draft',
    (tester) async {
      final stored = <String>[];
      final drafts = ConsoleDrafts(
        read: () async => null,
        write: (value) async {
          stored.add(value);
        },
      );
      final c = FakeDock(drafts: drafts);
      c.pairing = {'name': 'Test PC', 'pin': 'pc-cert'};
      c.state['sessions'] = [
        {
          'id': 'one',
          'name': 'Trader',
          'provider': 'codex',
          'slot': 1,
          'state': 'ready',
          'consoleKey': 'stable-console',
          'launchId': 'launch-a',
          'accountId': 'codex:alpha',
          'accountLabel': 'Alpha',
          'draftSupported': true,
          'switchTargets': [
            {'id': 'codex:beta', 'label': 'Beta', 'ready': true},
          ],
          'switchOffer': {
            'usedPercent': 91,
            'targetAccountId': 'codex:beta',
            'targetLabel': 'Beta',
          },
        },
      ];
      c.screens['one'] = c.makeScreen('one')..terminal.write('Ready');
      c.onRequest = (method, _) async {
        if (method == 'console.switch') {
          c.state['sessions'] = [
            {
              ...c.sessions.single,
              'launchId': 'launch-b',
              'accountId': 'codex:beta',
            },
          ];
          c.notifyListeners();
        }
      };
      addTearDown(c.dispose);
      await tester.pumpWidget(DockApp(client: c));
      await enterChat(tester);
      const draft = 'First line\nUnicode: café — 🧪\n';
      await tester.enterText(find.byType(TextField).last, draft);
      await tester.pump(const Duration(milliseconds: 250));
      await drafts.flush();
      expect(find.text('Usage reached 91%.'), findsOneWidget);

      await tester.tap(find.byTooltip('More options'));
      await tester.pumpAndSettle();
      c.notifyListeners(); // A usage refresh arrives while the menu is open.
      await tester.pumpAndSettle();
      expect(
        find.widgetWithText(PopupMenuItem<String>, 'Switch to Beta'),
        findsOneWidget,
      );
      await tester.tap(find.text('Switch to Beta').last);
      await tester.pumpAndSettle();
      expect(c.payloads.last, {
        'id': 'one',
        'launchId': 'launch-a',
        'consoleKey': 'stable-console',
        'accountId': 'codex:alpha',
        'targetAccountId': 'codex:beta',
      });
      expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        draft,
      );
      expect(
        jsonDecode(stored.last)[ConsoleDrafts.key('pc-cert', 'stable-console')],
        draft,
      );
      expect(
        c.inputs,
        isEmpty,
        reason: 'account switching does not submit the phone composer',
      );

      c.generation++; // Simulate a phone reconnect after the switch.
      c.notifyListeners();
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        draft,
      );
      expect(c.inputs, isEmpty);
    },
  );

  testWidgets('account switch rejects a menu target after its launch changes', (
    tester,
  ) async {
    final c = FakeDock();
    c.pairing = {'name': 'Test PC', 'pin': 'pc-cert'};
    c.state['sessions'] = [
      {
        'id': 'one',
        'name': 'Trader',
        'provider': 'codex',
        'slot': 1,
        'state': 'ready',
        'consoleKey': 'stable-console',
        'launchId': 'launch-a',
        'accountId': 'codex:alpha',
        'accountLabel': 'Alpha',
        'draftSupported': true,
        'switchTargets': [
          {'id': 'codex:beta', 'label': 'Beta', 'ready': true},
        ],
      },
    ];
    c.screens['one'] = c.makeScreen('one')..terminal.write('Ready');
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await tester.tap(find.byTooltip('More options'));
    await tester.pumpAndSettle();
    c.state['sessions'] = [
      {...c.sessions.single, 'launchId': 'launch-c'},
    ];
    c.notifyListeners();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Switch to Beta').last);
    await tester.pumpAndSettle();
    expect(c.calls, isNot(contains('console.switch')));
  });

  testWidgets('account setup action stays pinned to the phone console', (
    tester,
  ) async {
    final c = FakeDock();
    c.pairing = {'name': 'Test PC', 'pin': 'pc-cert'};
    c.state['sessions'] = [
      {
        'id': 'one',
        'name': 'Trader',
        'provider': 'codex',
        'slot': 1,
        'state': 'ready',
        'consoleKey': 'stable-console',
        'launchId': 'launch-a',
        'accountId': 'codex:alpha',
        'accountLabel': 'Alpha',
        'draftSupported': true,
        'switchTargets': [
          {'id': 'codex:beta', 'label': 'Beta', 'ready': true},
        ],
      },
    ];
    c.screens['one'] = c.makeScreen('one')..terminal.write('Ready');
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await tester.tap(find.byTooltip('More options'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Set up Beta').last);
    await tester.pumpAndSettle();
    expect(c.calls, contains('console.setup'));
    expect(c.payloads.last, {
      'id': 'one',
      'launchId': 'launch-a',
      'consoleKey': 'stable-console',
      'accountId': 'codex:alpha',
      'targetAccountId': 'codex:beta',
    });
    expect(
      c.inputs,
      isEmpty,
      reason: 'setup opens a provider console without submitting phone text',
    );
  });

  for (final width in [320.0, 393.0, 800.0]) {
    testWidgets(
      'account offer and menu wrap long labels at ${width.toInt()}px',
      (tester) async {
        tester.view.physicalSize = Size(width, 1000);
        tester.view.devicePixelRatio = 1;
        tester.platformDispatcher.textScaleFactorTestValue = 2;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        final c = FakeDock();
        addTearDown(c.dispose);
        const label = 'Personal Codex subscription for development and review';
        c.state['sessions'] = [
          {
            ...c.sessions.single,
            'provider': 'codex',
            'accountId': 'codex:alpha',
            'accountLabel': 'Alpha',
            'launchId': 'launch-a',
            'consoleKey': 'stable-console',
            'draftSupported': true,
            'switchTargets': [
              {'id': 'codex:beta', 'label': label, 'ready': true},
            ],
            'switchOffer': {
              'usedPercent': 91,
              'targetAccountId': 'codex:beta',
              'targetLabel': label,
            },
          },
        ];
        await tester.pumpWidget(DockApp(client: c));
        await tester.pumpAndSettle();
        expect(find.text('Usage reached 91%.'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.tap(find.byTooltip('More options'));
        await tester.pumpAndSettle();
        expect(
          find.widgetWithText(PopupMenuItem<String>, 'Switch to $label'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      },
    );
  }
}
