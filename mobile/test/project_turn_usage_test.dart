import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/dock_client.dart';
import 'package:agent_dock_mobile/project_turn_usage.dart';

class TurnClient extends DockClient {
  final calls = <Map<String, dynamic>>[];
  bool fail = false;
  TurnClient({bool supported = true}) {
    connected = true;
    state = {
      'capabilities': [if (supported) 'usage.turns'],
      'projects': [{'id': 'a', 'name': 'Alpha'}, {'id': 'b', 'name': 'Beta'}],
    };
  }

  @override
  Future<dynamic> request(String method, [Map<String, dynamic> payload = const {}]) async {
    expect(method, 'usage.turns');
    calls.add(Map.of(payload));
    if (fail) throw StateError('Offline');
    final filter = payload['projectId'];
    final rows = [
      {'id': 'a1', 'at': 1000, 'projectId': 'a', 'model': 'Model Alpha', 'usage': {'input': 12345, 'output': 42, 'cached': 1000},
        'quota': [{'minutes': 300, 'changePercent': 3}, {'minutes': 10080, 'changePercent': null}]},
      {'id': 'b1', 'at': 999, 'projectId': 'b', 'model': 'Model Beta', 'source': 'Dock API'},
      {'id': 'none', 'at': 998, 'model': 'Unknown model'},
      {'id': 'a3', 'at': 997, 'projectId': 'a', 'model': 'Another Alpha', 'usage': {'input': 0}},
    ];
    return {
      'turns': payload['before'] != null
        ? [{'id': 'a2', 'at': 997, 'projectId': 'a', 'model': 'Older model'}]
        : rows.where((r) => filter == null || (r['projectId'] ?? 'unassigned') == filter).toList(),
      'before': payload['before'] == null && filter == null ? 'next-page' : null,
      'projects': [{'id': 'a', 'name': 'Alpha'}, {'id': 'b', 'name': 'Beta'}],
    };
  }
}

Future<void> showTurns(WidgetTester tester, TurnClient client, {double scale = 1}) async {
  await tester.pumpWidget(MaterialApp(
    theme: ThemeData.dark(),
    home: MediaQuery(
      data: MediaQueryData(textScaler: TextScaler.linear(scale)),
      child: Scaffold(body: SingleChildScrollView(child: ProjectTurnUsage(client: client))),
    ),
  ));
  await tester.pumpAndSettle();
}

Future<void> selectProject(WidgetTester tester, String name) async {
  final dropdown = find.byType(DropdownButtonFormField<String>);
  await tester.ensureVisible(dropdown);
  await tester.tap(dropdown);
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text(name).last);
  await tester.tap(find.text(name).last);
  await tester.pumpAndSettle();
}

void main() {
  test('token labels keep unknown values distinct from zero', () {
    expect(turnNumber(null), '—');
    expect(turnNumber(double.nan), '—');
    expect(turnNumber(0), '0');
    expect(turnNumber(9999), '9,999');
    expect(turnNumber(10000), '10K');
    expect(turnNumber(1250000), '1.3M');
  });

  testWidgets('groups turns by project and filters on the host including Unassigned', (tester) async {
    final client = TurnClient();
    addTearDown(client.dispose);
    await showTurns(tester, client);
    expect(find.text('Model Alpha'), findsOneWidget);
    expect(find.text('Model Beta'), findsOneWidget);
    expect(find.text('Unassigned'), findsOneWidget);
    expect(find.text('Alpha'), findsOneWidget);
    expect(find.text('Beta'), findsOneWidget);
    expect(tester.getTopLeft(find.text('Another Alpha')).dy,
      lessThan(tester.getTopLeft(find.byKey(const ValueKey('turn-project-b'))).dy));
    await selectProject(tester, 'Alpha');
    expect(client.calls.last, {'projectId': 'a'});
    expect(find.text('Model Alpha'), findsOneWidget);
    expect(find.text('Model Beta'), findsNothing);
    await selectProject(tester, 'Unassigned');
    expect(client.calls.last, {'projectId': 'unassigned'});
    expect(find.text('Unknown model'), findsOneWidget);
    expect(find.text('Model Alpha'), findsNothing);
  });

  testWidgets('shows tokens, individual observed windows, unknown and API rows and caveat', (tester) async {
    final client = TurnClient();
    addTearDown(client.dispose);
    await showTurns(tester, client);
    expect(find.text('Input 12.3K'), findsOneWidget);
    expect(find.text('Output 42'), findsOneWidget);
    expect(find.text('Cache reads 1,000'), findsOneWidget);
    expect(find.text('~3% of 5h'), findsOneWidget);
    expect(find.text('Quota change: — of Weekly'), findsOneWidget);
    expect(find.text('Quota change: —'), findsNWidgets(2));
    expect(find.text('API billing'), findsOneWidget);
    expect(find.text('Input —'), findsNWidgets(2));
    expect(find.text('Quota changes are observed per account and may include other use.'), findsOneWidget);
  });

  testWidgets('load more appends turns and hides the button at the end', (tester) async {
    final client = TurnClient();
    addTearDown(client.dispose);
    await showTurns(tester, client);
    await tester.ensureVisible(find.text('Load more'));
    await tester.tap(find.text('Load more'));
    await tester.pumpAndSettle();
    expect(client.calls.last, {'before': 'next-page'});
    expect(find.text('Older model'), findsOneWidget);
    expect(find.text('Model Alpha'), findsOneWidget);
    expect(find.text('Load more'), findsNothing);
    await selectProject(tester, 'Beta');
    expect(client.calls.last, {'projectId': 'b'});
    expect(find.text('Older model'), findsNothing);
  });

  testWidgets('old hosts hide the section and send no turn requests', (tester) async {
    final client = TurnClient(supported: false);
    addTearDown(client.dispose);
    await showTurns(tester, client);
    expect(find.text('By project'), findsNothing);
    expect(client.calls, isEmpty);
  });

  testWidgets('320 px with large text wraps turns and the filter without overflow', (tester) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final client = TurnClient();
    addTearDown(client.dispose);
    await showTurns(tester, client, scale: 2);
    expect(tester.takeException(), isNull);
    await selectProject(tester, 'Unassigned');
    expect(tester.takeException(), isNull);
    expect(find.text('Unknown model'), findsOneWidget);
  });

  testWidgets('failed reads can be retried', (tester) async {
    final client = TurnClient()..fail = true;
    addTearDown(client.dispose);
    await showTurns(tester, client);
    expect(find.text('Could not load turns. Try again.'), findsOneWidget);
    client.fail = false;
    await tester.ensureVisible(find.text('Retry'));
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Model Alpha'), findsOneWidget);
    expect(find.text('Could not load turns. Try again.'), findsNothing);
  });
}
