import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/state_models.dart';
import 'package:agent_dock_mobile/tasks_page.dart';

import 'widget_test.dart' show FakeDock;

Map<String, dynamic> task(String id, String state, {int started = 1700000000000, int? finished, String title = '', String error = '', int? acknowledged, String? supersededBy}) => {
  'id': id, 'title': title.isEmpty ? 'Task $id' : title, 'state': state, 'startedAt': started, 'finishedAt': finished,
  'implementer': {'accountId': 'kiro:default', 'provider': 'kiro', 'label': 'Kiro'},
  'reviewer': {'accountId': 'cursor:default', 'provider': 'cursor', 'label': 'Cursor'},
  'error': error, 'acknowledgedAt': acknowledged, 'dismissedAt': null, 'supersededBy': supersededBy,
};

FakeDock dock(List<Map<String, dynamic>> tasks) {
  final client = FakeDock();
  client.state['capabilities'] = ['tasks.actions'];
  client.state['tasks'] = tasks;
  return client;
}

void main() {
  test('attention follows the desktop rule', () {
    Task t(Map<String, dynamic> j) => Task.fromJson(j);
    expect(taskNeedsAttention(t(task('a', 'needs-you'))), isTrue);
    expect(taskNeedsAttention(t(task('b', 'plan-ready'))), isTrue);
    expect(taskNeedsAttention(t(task('c', 'failed', acknowledged: 5))), isFalse, reason: 'seen');
    expect(taskNeedsAttention(t(task('d', 'failed', supersededBy: 'e'))), isFalse, reason: 'replaced');
    expect(taskNeedsAttention(t(task('f', 'interrupted', error: 'Paddock closed before this task finished.'))), isFalse, reason: 'app closed');
    expect(taskNeedsAttention(t(task('g', 'passed'))), isFalse);
    expect(taskStateLabel('implementing'), 'Running');
    expect(taskStateLabel('plan-ready'), 'Waiting for approval');
    final now = DateTime.fromMillisecondsSinceEpoch(1700000000000 + 65 * 60000);
    expect(taskElapsed(t(task('h', 'implementing')), now), '1h 5m');
    expect(taskElapsed(t(task('i', 'passed', finished: 1700000000000 + 12 * 60000)), now), '12m');
    expect(taskElapsed(t(task('j', 'passed', finished: 1700000000000 + 20000)), now), 'less than a minute');
  });

  testWidgets('lists tasks newest first with plain states and no Close on a running task', (tester) async {
    final client = dock([task('old', 'failed', started: 1), task('new', 'implementing', started: 3), task('mid', 'needs-you', started: 2)]);
    addTearDown(client.dispose);
    await tester.pumpWidget(MaterialApp(home: TasksPage(client: client)));
    await tester.pumpAndSettle();
    final titles = tester.widgetList<Text>(find.textContaining('Task ')).map((w) => w.data).toList();
    expect(titles, ['Task new', 'Task mid', 'Task old']);
    expect(find.text('Running'), findsOneWidget);
    expect(find.text('Needs you'), findsOneWidget);
    expect(find.text('Worker: Kiro'), findsNWidgets(3));
    expect(find.text('Close'), findsNWidgets(2), reason: 'not on the running task');
    expect(find.text('Mark as seen'), findsNWidgets(2));
  });

  testWidgets('Mark as seen and Close send the task id; Close needs a reason', (tester) async {
    final client = dock([task('t1', 'needs-you')]);
    addTearDown(client.dispose);
    await tester.pumpWidget(MaterialApp(home: TasksPage(client: client)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mark as seen'));
    await tester.pumpAndSettle();
    expect(client.payloads[client.calls.indexOf('tasks.seen')], {'id': 't1'});
    await tester.tap(find.text('Close'));
    await tester.pumpAndSettle();
    final closeButton = find.widgetWithText(FilledButton, 'Close task');
    expect(tester.widget<FilledButton>(closeButton).onPressed, isNull, reason: 'empty reason');
    await tester.enterText(find.byType(TextField), 'Replaced by a newer task');
    await tester.pumpAndSettle();
    await tester.tap(closeButton);
    await tester.pumpAndSettle();
    expect(client.payloads[client.calls.indexOf('tasks.close')], {'id': 't1', 'reason': 'Replaced by a newer task'});
  });

  testWidgets('empty state and no actions without the PC capability', (tester) async {
    final empty = dock([]);
    addTearDown(empty.dispose);
    await tester.pumpWidget(MaterialApp(home: TasksPage(client: empty)));
    await tester.pumpAndSettle();
    expect(find.text('No delegated tasks.'), findsOneWidget);
    final old = dock([task('x', 'failed')])..state['capabilities'] = <String>[];
    addTearDown(old.dispose);
    await tester.pumpWidget(MaterialApp(home: TasksPage(client: old)));
    await tester.pumpAndSettle();
    expect(find.text('Close'), findsNothing);
  });

  testWidgets('the main screen chip counts tasks that need you and opens the page', (tester) async {
    final client = dock([task('a', 'needs-you'), task('b', 'passed'), task('c', 'failed', acknowledged: 9)]);
    addTearDown(client.dispose);
    await tester.pumpWidget(DockApp(client: client));
    await tester.pumpAndSettle();
    expect(find.text('Tasks: 1 need you'), findsOneWidget);
    await tester.tap(find.text('Tasks: 1 need you'));
    await tester.pumpAndSettle();
    expect(find.byType(TasksPage), findsOneWidget);
  });

  testWidgets('fits 320 px with large text', (tester) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final client = dock([task('long', 'needs-you', title: 'A long task title that has to wrap across several lines on a narrow phone', error: 'Checks failed (exit 1).')]);
    addTearDown(client.dispose);
    await tester.pumpWidget(MediaQuery(
      data: const MediaQueryData(size: Size(320, 640), textScaler: TextScaler.linear(1.6)),
      child: MaterialApp(home: TasksPage(client: client)),
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
