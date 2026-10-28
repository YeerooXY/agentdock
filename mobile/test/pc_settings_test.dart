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

Future<void> showTools(
  WidgetTester tester,
  SettingsDock client,
  Map<String, dynamic> summary, {
  bool capable = true,
  double textScale = 1,
}) async {
  client.state['capabilities'] = capable ? ['tools.status'] : <String>[];
  await tester.pumpWidget(
    MaterialApp(
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: TextScaler.linear(textScale),
        ),
        child: child!,
      ),
      home: Scaffold(body: PCSettingsPage(client: client, category: 'Tools')),
    ),
  );
  client.replies.single.complete(summary);
  await tester.pumpAndSettle();
}

void main() {
  for (final status in [
    'Connected', 'Not checked', 'Needs setup', 'Key missing', 'Failing', 'Off',
  ]) {
    testWidgets('Tools shows the $status chip and PC action', (tester) async {
      final c = SettingsDock();
      addTearDown(c.dispose);
      await showTools(tester, c, {
        'tools': [
          {
            'name': 'Meshy', 'enabled': status != 'Off', 'status': status,
            'error': status == 'Failing' ? 'Connection refused' : '',
            'action': 'On your PC: Open Settings → Tools and review Meshy.',
          },
        ],
      });
      expect(find.widgetWithText(Chip, status), findsOneWidget);
      expect(find.text('Meshy'), findsOneWidget);
      expect(find.text('On your PC: Open Settings → Tools and review Meshy.'), findsOneWidget);
      expect(find.text('Connection refused'), status == 'Failing' ? findsOneWidget : findsNothing);
      expect(find.text('Edit these settings in Paddock on your PC.'), findsNothing);
    });
  }

  testWidgets('setup requests appear before Tools with agent, request and action', (tester) async {
    final semantics = tester.ensureSemantics();
    final c = SettingsDock();
    addTearDown(c.dispose);
    await showTools(tester, c, {
      'setupRequests': [
        {
          'agent': 'Agent Ada', 'name': 'Meshy key', 'kind': 'Key entry',
          'action': 'On your PC: Open Settings → Tools and paste the key on the request card.',
        },
      ],
      'tools': [
        {'name': 'Meshy', 'status': 'Key missing', 'action': 'On your PC: Open Settings → Tools and paste the Meshy key.'},
      ],
    });
    expect(find.text('Agent Ada: Meshy key'), findsOneWidget);
    expect(find.text('Key entry'), findsOneWidget);
    expect(find.text('On your PC: Open Settings → Tools and paste the key on the request card.'), findsOneWidget);
    expect(tester.getTopLeft(find.text('Waiting for you')).dy,
        lessThan(tester.getTopLeft(find.text('Tools')).dy));
    expect(tester.getTopLeft(find.text('Agent Ada: Meshy key')).dy,
        lessThan(tester.getTopLeft(find.text('Meshy')).dy));
    for (final heading in ['Waiting for you', 'Tools', 'Meshy']) {
      expect(tester.getSemantics(find.text(heading)),
          matchesSemantics(label: heading, isHeader: true));
    }
    final requestHeading = find.byWidgetPredicate((widget) => widget is Semantics &&
        widget.properties.label == 'Request: Meshy key. From Agent Ada.');
    expect(requestHeading, findsOneWidget);
    expect(tester.getSemantics(requestHeading), matchesSemantics(
      label: 'Request: Meshy key. From Agent Ada.', isHeader: true,
    ));
    semantics.dispose();
  });

  testWidgets('capable host with no tools and no setupRequests shows the Tools empty state', (tester) async {
    final c = SettingsDock();
    addTearDown(c.dispose);
    await showTools(tester, c, {'tools': <dynamic>[]});
    expect(find.text('Tools'), findsOneWidget);
    expect(find.text('None configured.'), findsOneWidget);
    expect(find.text('Waiting for you'), findsNothing);
    expect(find.text('Edit these settings in Paddock on your PC.'), findsNothing);
    expect(find.byType(Chip), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('old hosts keep enabled flags and hide status and requests', (tester) async {
    final c = SettingsDock();
    addTearDown(c.dispose);
    await showTools(tester, c, {
      'tools': [
        {'id': 'one', 'name': 'First tool', 'enabled': true, 'status': 'Connected', 'error': 'Hidden error', 'action': 'Hidden action'},
        {'id': 'two', 'name': 'Second tool', 'enabled': false},
      ],
      'setupRequests': [{'agent': 'Hidden agent', 'name': 'Hidden request'}],
    }, capable: false);
    expect(find.text('Enabled'), findsOneWidget);
    expect(find.text('Disabled'), findsOneWidget);
    expect(find.text('Edit these settings in Paddock on your PC.'), findsOneWidget);
    expect(find.byType(Chip), findsNothing);
    for (final text in ['Waiting for you', 'Hidden error', 'Hidden action', 'Hidden agent: Hidden request']) {
      expect(find.text(text), findsNothing);
    }
  });

  testWidgets('pull to refresh reloads a short Tools list', (tester) async {
    final c = SettingsDock();
    addTearDown(c.dispose);
    await showTools(tester, c, {'tools': <dynamic>[]});
    // Arm the indicator, then start and advance its snap animation. The
    // pending settings reply prevents pumpAndSettle until refresh completes.
    final scrollable = find.descendant(
      of: find.byType(RefreshIndicator), matching: find.byType(ListView),
    );
    await tester.fling(scrollable, const Offset(0, 1400), 2500);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
    expect(c.replies.length, 2);
    c.replies.last.complete({
      'tools': [{'name': 'Updated tool', 'status': 'Connected', 'action': 'On your PC: Review the tool.'}],
    });
    await tester.pumpAndSettle();
    expect(find.text('Updated tool'), findsOneWidget);
    expect(find.widgetWithText(Chip, 'Connected'), findsOneWidget);
  });

  testWidgets('new hosts direct key inspection to the PC', (tester) async {
    final c = SettingsDock();
    addTearDown(c.dispose);
    c.state['capabilities'] = ['tools.status'];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: PCSettingsPage(client: c, category: 'Keys')),
    ));
    c.replies.single.complete({'keys': [{'name': 'Saved keys: 2'}]});
    await tester.pumpAndSettle();
    expect(find.text('View saved keys in Paddock on your PC.'), findsOneWidget);
    expect(find.text('Saved keys: 2'), findsOneWidget);
    expect(find.text('null'), findsNothing);
    expect(find.text('None configured.'), findsNothing);
  });

  testWidgets('Tools and requests fit 320 px at 200 percent text size', (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final c = SettingsDock();
    addTearDown(c.dispose);
    final error = List.filled(10, 'Connection refused. ').join();
    await showTools(tester, c, {
      'setupRequests': [
        {
          'agent': 'Agent with a long console name',
          'name': 'Requested image generator', 'kind': 'Image generator',
          'action': 'On your PC: Open Settings → Tools and review and apply the request.',
        },
      ],
      'tools': [
        for (final status in ['Connected', 'Not checked', 'Needs setup', 'Key missing', 'Failing', 'Off'])
          {
            'name': 'Tool with a long name: $status', 'status': status,
            'error': error,
            'action': 'On your PC: Open Settings → Tools and review the connection.',
          },
      ],
    }, textScale: 2);
    expect(tester.takeException(), isNull);
    for (final status in ['Connected', 'Not checked', 'Needs setup', 'Key missing', 'Failing', 'Off']) {
      await tester.scrollUntilVisible(find.widgetWithText(Chip, status), 250,
          scrollable: find.byType(Scrollable));
      expect(tester.takeException(), isNull);
    }
    await tester.drag(find.byType(ListView), const Offset(0, -600));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

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
