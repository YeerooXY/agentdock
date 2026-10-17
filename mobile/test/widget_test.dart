import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/dock_client.dart';
import 'package:agent_dock_mobile/results_page.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';

class FakeDock extends DockClient {
  bool markdown = false;
  final calls = <String>[];
  FakeDock({bool paired = true}) {
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

void main() {
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
      await tester.enterText(find.byType(TextField), 'not a code');
      await tester.tap(find.text('Connect'));
      await tester.pumpAndSettle();
      expect(find.text('not a code'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
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
