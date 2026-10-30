import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'widget_test.dart' show FakeDock, enterChat;

FakeDock worker() {
  final client = FakeDock();
  client.state['sessions'][0].addAll({
    'taskId': 'task', 'sliceId': 'slice', 'consoleKey': 'key', 'launchId': 'launch',
    'name': 'Slice A', 'purpose': 'worker', 'alive': true,
    'consoleCapabilities': {'worker': true, 'steering': true, 'stopWorker': true},
  });
  client.state['capabilities'] = ['worker.submit', 'worker.stop', 'console.close', 'console.manage'];
  return client;
}

void main() {
  testWidgets('missing worker capabilities preserve the draft without sending', (tester) async {
    final client = worker(); addTearDown(client.dispose);
    client.state['sessions'][0].remove('consoleCapabilities');
    await tester.pumpWidget(DockApp(client: client));
    await enterChat(tester);
    final field = find.byType(TextField).last;
    await tester.enterText(field, 'Retain this draft');
    await expectLater(client.submit('Retain this draft'), throwsStateError);
    expect(client.calls, isNot(contains('worker.submit')));
    expect(client.inputs, isEmpty);
    expect(tester.widget<TextField>(field).controller!.text, 'Retain this draft');
    expect(find.text('Steering unavailable for this CLI'), findsOneWidget);
  });

  testWidgets('worker composer submits steering with launch identity and preserves a failed draft', (tester) async {
    final client = worker(); addTearDown(client.dispose);
    var fail = true;
    client.onRequest = (method, payload) async {
      if (method == 'worker.submit' && fail) throw StateError('Connection lost');
    };
    await tester.pumpWidget(DockApp(client: client));
    await enterChat(tester);
    final field = find.byType(TextField).last;
    await tester.enterText(field, 'Change the button');
    await client.submit('Change the button').catchError((_) {});
    final first = client.payloads.last;
    expect(first['consoleKey'], 'key'); expect(first['launchId'], 'launch');
    expect(client.inputs, isEmpty);
    expect(tester.widget<TextField>(field).controller!.text, 'Change the button');
    fail = false; await client.submit('Change the button');
    expect(client.payloads.last['submissionId'], first['submissionId']);
    expect(client.calls.where((method) => method == 'input'), isEmpty);
  });

  testWidgets('worker stop names the slice and sends the pinned identity', (tester) async {
    final client = worker(); addTearDown(client.dispose);
    await tester.pumpWidget(DockApp(client: client));
    await enterChat(tester);
    await tester.tap(find.byTooltip('More options'));
    await tester.pumpAndSettle();
    expect(find.text('Rename'), findsNothing);
    await tester.tap(find.text('Stop worker'));
    await tester.pumpAndSettle();
    expect(find.text('Stop worker for Slice A?'), findsOneWidget);
    await tester.tap(find.text('Stop worker').last);
    await tester.pumpAndSettle();
    expect(client.calls, contains('worker.stop'));
    final index = client.calls.indexOf('worker.stop');
    expect(client.payloads[index]['consoleKey'], 'key');
    expect(client.payloads[index]['launchId'], 'launch');
    expect(client.payloads[index]['sliceId'], 'slice');
    expect(client.calls, isNot(contains('console.close')));
  });
}
