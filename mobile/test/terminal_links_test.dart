import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/terminal_links.dart';
import 'package:xterm/xterm.dart';

import 'widget_test.dart' show FakeDock, enterChat, consoleAction;

const loginLink =
    'https://claude.com/cai/oauth/authorize?code=true&client_id=test-client'
    '&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com'
    '%2Foauth%2Fcode%2Fcallback&scope=user%3Aprofile+user%3Ainference'
    '&code_challenge=example_-0123456789&code_challenge_method=S256'
    '&state=fixture-only';

void main() {
  test('full login URL survives terminal soft wrapping and ANSI styling', () {
    final terminal = Terminal()..resize(40, 30);
    terminal.write('\x1b[4m$loginLink\x1b[0m\r\n\r\nPaste code here > ');
    expect(terminalLinks(terminal), [loginLink]);
  });

  test('full-width CLI hard wraps preserve every query parameter', () {
    final terminal = Terminal()..resize(80, 30);
    for (var i = 0; i < loginLink.length; i += 80) {
      final end = (i + 80).clamp(0, loginLink.length);
      terminal.write('${loginLink.substring(i, end)}\r\n');
    }
    terminal.write('\r\nPaste code here > ');
    expect(terminalLinks(terminal), [loginLink]);
  });

  test(
    'ordinary newlines stay separate and duplicate links show newest first',
    () {
      final terminal = Terminal()..resize(100, 30);
      terminal.write(
        'See [docs](https://example.com/docs).\r\n'
        'https://example.com/a_(b)\r\n'
        'Do not append this sentence\r\n'
        'https://example.com/docs\r\n',
      );
      expect(terminalLinks(terminal), [
        'https://example.com/docs',
        'https://example.com/a_(b)',
      ]);
    },
  );

  test(
    'only valid HTTP links without credentials or control characters open',
    () {
      for (final value in [
        'file:///C:/private',
        'javascript:alert(1)',
        'intent://open',
        'https://user:password@example.com/',
        'https://example.com\\@other.example/',
        'https://example.com/\u202ehidden',
        'https://example.com/\nsecond',
        'https:///no-host',
        'https://example.com:99999/',
        'https://example.com/broken%2',
        'https://example.com/${'x' * 8200}',
      ]) {
        expect(terminalLinkUri(value), isNull, reason: value);
      }
      expect(terminalLinkUri(loginLink)?.host, 'claude.com');
      expect(terminalLinkUri('http://localhost:3000/'), isNotNull);
    },
  );

  testWidgets('Open and Copy use the complete URL only after a user action', (
    tester,
  ) async {
    final opened = <String>[], copied = <String>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: TerminalLinksSheet(
            links: const [loginLink],
            consoleName: 'Claude trial',
            open: (uri) async {
              opened.add(uri.toString());
              return true;
            },
            copy: (value) async {
              copied.add(value);
            },
          ),
        ),
      ),
    );
    expect(opened, isEmpty);
    expect(copied, isEmpty);
    await tester.tap(find.text('Copy'));
    await tester.pumpAndSettle();
    expect(copied, [loginLink]);
    expect(find.text('Link copied'), findsOneWidget);
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(opened, [loginLink]);
  });

  testWidgets('browser failure offers Copy and keeps the URL available', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: TerminalLinksSheet(
            links: const [loginLink],
            consoleName: 'Claude trial',
            open: (_) async => false,
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(find.text('Could not open the browser. Try Copy.'), findsOneWidget);
    expect(
      tester
          .widget<TextButton>(find.widgetWithText(TextButton, 'Copy'))
          .onPressed,
      isNotNull,
    );
  });

  testWidgets('opening links preserves the draft and never types into the PC', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    c.screen!.terminal.write('\r\n$loginLink\r\n');
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    await tester.enterText(find.byType(TextField), 'Unsent work');
    await consoleAction(tester, 'Console links');
    await tester.pumpAndSettle();
    expect(find.byType(TerminalLinksSheet), findsOneWidget);
    expect(find.text('claude.com'), findsOneWidget);
    expect(c.inputs, isEmpty);
    // Switching to a different PC cannot leave an actionable stale link sheet.
    c.pairing = {'pin': 'different-pc', 'name': 'Other PC'};
    c.notifyListeners();
    await tester.pumpAndSettle();
    expect(find.text('Console changed. Reopen Links.'), findsOneWidget);
    expect(
      tester
          .widget<TextButton>(find.widgetWithText(TextButton, 'Open'))
          .onPressed,
      isNull,
    );
  });

  for (final size in [const Size(320, 740), const Size(852, 393)]) {
    testWidgets('links sheet scrolls at $size with doubled text', (
      tester,
    ) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TerminalLinksSheet(
              links: const [loginLink],
              consoleName: 'Claude trial',
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('Full link'), 100);
      await tester.tap(find.text('Full link'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('Copy'), 100);
      expect(tester.getRect(find.text('Copy')).right, lessThan(size.width));
      expect(tester.takeException(), isNull);
    });
  }
}
