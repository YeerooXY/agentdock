import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'widget_test.dart' show FakeDock;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('agentdock/background');
  final calls = <MethodCall>[];
  setUp(() {
    calls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async { calls.add(call); return null; });
  });
  tearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(channel, null));

  String state(List<Map<String, Object?>> alerts) => jsonEncode({
    'type': 'state',
    'state': {'sessions': <Object>[], 'capabilities': <String>[], 'alerts': alerts},
  });

  test('alerts carry what the agent said and replace per console', () async {
    final c = FakeDock();
    addTearDown(c.dispose);
    c.stayConnected = true;
    c.foreground = false;
    c.handleMessage(state([
      {'id': 'a1', 'title': 'Robonslaught is ready', 'message': 'All 435 tests pass; merged.', 'sessionId': 's1'},
    ]));
    c.handleMessage(state([
      {'id': 'a1', 'title': 'Robonslaught is ready', 'message': 'All 435 tests pass; merged.', 'sessionId': 's1'},
      {'id': 'a2', 'title': 'Robonslaught needs you', 'message': 'Claude needs your permission to use Bash', 'sessionId': 's1'},
      {'id': 'a3', 'title': 'Old host alert', 'sessionId': null},
    ]));
    await Future<void>.delayed(Duration.zero);
    final posted = calls.where((x) => x.method == 'notify').map((x) => x.arguments as Map).toList();
    expect(posted.map((x) => x['title']), ['Robonslaught is ready', 'Robonslaught needs you', 'Old host alert']);
    expect(posted[0]['text'], 'All 435 tests pass; merged.');
    expect(posted[1]['text'], 'Claude needs your permission to use Bash');
    expect(posted[0]['key'], posted[1]['key'], reason: 'one notification per console');
    expect(posted[2]['key'], isNot(posted[0]['key']));
    expect(posted[2]['text'], '');
  });

  test('opening the app clears posted alerts', () async {
    final c = FakeDock();
    addTearDown(c.dispose);
    c.setForeground(true);
    await Future<void>.delayed(Duration.zero);
    expect(calls.map((x) => x.method), contains('clear'));
  });
}
