import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/tasks_page.dart';

import 'widget_test.dart' show FakeDock, enterChat;

void main() {
  testWidgets('Plan this sends the typed message from the open console', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    c.state['capabilities'] = [
      ...(c.state['capabilities'] as List? ?? const []),
      'tasks.plan',
    ];
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    await tester.tap(find.byTooltip('More actions').last);
    await tester.pumpAndSettle();
    final empty = tester.widget<ListTile>(
      find.byKey(const ValueKey('composer-plan')),
    );
    expect(empty.enabled, isFalse, reason: 'nothing typed yet');
    expect(find.text('Type what you want done first'), findsOneWidget);
    await tester.tapAt(const Offset(10, 30));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).last, 'Split the refactor');
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('More actions').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Plan this'));
    await tester.pumpAndSettle();
    final payload = c.payloads[c.calls.indexOf('tasks.plan')];
    expect(payload['text'], 'Split the refactor');
    expect(payload['consoleId'], isNotEmpty);
    expect(tester.widget<TextField>(find.byType(TextField).last).controller!.text, isEmpty);
    expect(find.text('Planning. Approve the plan in Tasks.'), findsOneWidget);
  });

  testWidgets('a ready plan lists its items and Approve sends the task id', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    c.state['capabilities'] = ['tasks.actions'];
    c.state['tasks'] = [
      {
        'id': 'p1',
        'title': 'Download priority',
        'state': 'plan-ready',
        'kind': 'plan',
        'startedAt': 1700000000000,
        'plan': {
          'contracts': 'Keep worker limits.',
          'items': [
            {
              'id': 'queue',
              'title': 'Pause one background download',
              'kind': 'build',
              'size': 'medium',
              'criteria': 'Pause exactly one background song.',
              'worker': {'label': 'Codex', 'model': 'gpt-6.1-sol'},
            },
            {
              'id': 'why',
              'title': 'Can a paused song lose progress?',
              'kind': 'question',
              'answer': 'No, partial files are kept.',
            },
          ],
        },
      },
    ];
    await tester.pumpWidget(MaterialApp(home: TasksPage(client: c)));
    await tester.pumpAndSettle();
    expect(find.text('Plan: 1 task'), findsOneWidget, reason: 'questions are not tasks');
    expect(find.text('Pause one background download'), findsOneWidget);
    expect(find.text('Build, medium, Codex, gpt-6.1-sol'), findsOneWidget);
    await tester.tap(find.text('Can a paused song lose progress?'));
    await tester.pumpAndSettle();
    expect(find.text('No, partial files are kept.'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('approve-p1')));
    await tester.pumpAndSettle();
    expect(c.payloads[c.calls.indexOf('tasks.approve')], {'id': 'p1'});
  });
}
