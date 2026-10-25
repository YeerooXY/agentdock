import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/pc_settings_page.dart';
import 'package:agent_dock_mobile/main.dart';

import 'widget_test.dart' show FakeDock, enterChat;

class SettingsDock extends FakeDock {
  final replies = <Completer<dynamic>>[];
  @override
  Future<dynamic> request(
    String method, [
    Map<String, dynamic> payload = const {},
  ]) {
    if (method != 'settings.summary') return super.request(method, payload);
    final reply = Completer<dynamic>();
    replies.add(reply);
    return reply.future;
  }
}

void main() {
  testWidgets('PC settings discard previous-PC data and late replies', (
    tester,
  ) async {
    final c = SettingsDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PCSettingsPage(client: c, category: 'API'),
        ),
      ),
    );
    c.replies[0].complete({
      'apis': [
        {'id': 'old', 'name': 'Previous PC API'},
      ],
    });
    await tester.pumpAndSettle();
    expect(find.text('Previous PC API'), findsOneWidget);
    c.generation++;
    c.notifyListeners();
    await tester.pump();
    expect(find.text('Previous PC API'), findsNothing);
    c.generation++;
    c.notifyListeners();
    await tester.pump();
    c.replies[1].complete({
      'apis': [
        {'id': 'late', 'name': 'Late API'},
      ],
    });
    await tester.pump();
    expect(find.text('Late API'), findsNothing);
    c.replies[2].complete({
      'apis': [
        {'id': 'current', 'name': 'Current PC API'},
      ],
    });
    await tester.pumpAndSettle();
    expect(find.text('Current PC API'), findsOneWidget);
    expect(
      find.text('Edit these settings in Paddock on your PC.'),
      findsOneWidget,
    );
  });

  testWidgets('console bottom row shows the confirmed model and effort', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    c.state['sessions'][0].addAll({'model': 'gpt-6.1-sol', 'effort': 'medium'});
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    await tester.pumpAndSettle();
    expect(find.text('6.1 Sol'), findsOneWidget);
    expect(find.text('Medium'), findsOneWidget);
    c.state['sessions'][0]['effort'] = 'max';
    c.notifyListeners();
    await tester.pumpAndSettle();
    expect(find.text('6.1 Sol'), findsOneWidget);
    expect(find.text('Max'), findsOneWidget);
    expect(c.inputs, isEmpty);
  });
}
