import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';

import 'widget_test.dart' show FakeDock, enterChat;

FakeDock queueDock() {
  final c = FakeDock();
  c.state['capabilities'] = ['console.queue', 'prompts'];
  c.state['queues'] = {
    'one': {
      'paused': false,
      'entries': [
        {'id': 'a', 'text': 'First queued'},
        {'id': 'b', 'text': 'Second queued'},
      ],
    },
  };
  c.state['prompts'] = [
    {
      'id': 'p',
      'name': 'Tests first',
      'text': 'Write the test first.',
      'projectId': null,
    },
    {
      'id': 'x',
      'name': 'Elsewhere',
      'text': 'Other project',
      'projectId': 'other',
    },
  ];
  return c;
}

void main() {
  testWidgets(
    'the queue lists, reorders, sends and removes messages for the open console',
    (tester) async {
      final c = queueDock();
      addTearDown(c.dispose);
      await tester.pumpWidget(DockApp(client: c));
      await enterChat(tester);
      expect(
        find.text('2'),
        findsOneWidget,
        reason: 'the queue button shows the count',
      );
      await tester.enterText(find.byType(TextField).last, 'Check the footer');
      await tester.tap(find.byTooltip('Queue'));
      await tester.pumpAndSettle();
      expect(find.text('1. First queued'), findsOneWidget);
      expect(
        find.text('Elsewhere'),
        findsNothing,
        reason: 'prompts for other projects are hidden',
      );
      await tester.tap(find.text('Queue the message box text'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Move message 2 up'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Send now').first);
      await tester.tap(find.text('Send now').first);
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Remove message 2'));
      await tester.pumpAndSettle();
      final queueCalls = [
        for (var i = 0; i < c.calls.length; i++)
          if (c.calls[i].startsWith('queue.')) [c.calls[i], c.payloads[i]],
      ];
      expect(queueCalls, [
        [
          'queue.add',
          {'id': 'one', 'text': 'Check the footer'},
        ],
        [
          'queue.move',
          {'id': 'one', 'entryId': 'b', 'offset': -1},
        ],
        [
          'queue.send',
          {'id': 'one', 'entryId': 'a'},
        ],
        [
          'queue.remove',
          {'id': 'one', 'entryId': 'b'},
        ],
      ]);
      expect(
        c.inputs,
        isEmpty,
        reason: 'the phone never types queued text itself',
      );
      await tester.tap(find.byTooltip('Close queue'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        isEmpty,
        reason: 'a queued draft leaves the message box',
      );
    },
  );

  testWidgets('a saved prompt fills the message box without sending', (
    tester,
  ) async {
    final c = queueDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    await tester.tap(find.byTooltip('Queue'));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Queue the message box text'),
          )
          .onPressed,
      isNull,
    );
    await tester.ensureVisible(find.text('Use'));
    await tester.tap(find.text('Use'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<TextField>(find.byType(TextField).last).controller!.text,
      'Write the test first.',
    );
    expect(
      c.calls.where((x) => x.startsWith('queue.') || x == 'input'),
      isEmpty,
    );
  });

  testWidgets('shells and older PCs show no queue button', (tester) async {
    final c = queueDock();
    addTearDown(c.dispose);
    c.sessions.first['provider'] = 'shell';
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    expect(find.byTooltip('Queue'), findsNothing);
    c.sessions.first['provider'] = 'codex';
    c.state['capabilities'] = <String>[];
    c.notifyListeners();
    await tester.pumpAndSettle();
    expect(find.byTooltip('Queue'), findsNothing);
  });
}
