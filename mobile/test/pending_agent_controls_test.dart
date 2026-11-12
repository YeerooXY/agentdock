import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/live_agent_controls.dart';

import 'widget_test.dart' show FakeDock;

class SettingsDock extends FakeDock {
  bool settingsSupported = true;
  List<Map<String, dynamic>>? choices;
  @override
  Future<dynamic> request(
    String method, [
    Map<String, dynamic> payload = const {},
  ]) async {
    final value = await super.request(method, payload);
    if (method == 'console.models') {
      return {
        ...(value as Map),
        'settingsSupported': settingsSupported,
        if (choices != null) 'models': choices,
      };
    }
    if (method == 'console.settings') {
      return {
        'launchId': 'replacement',
        'requestedSettings': {
          'model': payload['model'],
          'effort': payload['effort'],
          'status': 'awaiting-provider',
        },
      };
    }
    return value;
  }
}

Future<void> open(WidgetTester tester, SettingsDock c) async {
  c.state['sessions'][0].addAll({
    'model': 'test-model-a',
    'effort': 'low',
    'launchId': 'launch-a',
    'accountId': 'account-a',
    'consoleKey': 'console-a',
    'providerSessionId': 'chat-a',
  });
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              builder: (_) => LiveAgentControls(client: c, action: 'Effort'),
            ),
            child: const Text('Choose settings'),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Choose settings'));
  await tester.pumpAndSettle();
}

Future<void> effort(WidgetTester tester, [String label = 'High']) async {
  await tester.tap(find.byType(DropdownButtonFormField<String>).last);
  await tester.pumpAndSettle();
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle();
}

void main() {
  for (final exit in ['Cancel', 'Close chooser', 'barrier', 'back']) {
    testWidgets('pending choices and $exit leave the console untouched', (
      tester,
    ) async {
      final c = SettingsDock();
      addTearDown(c.dispose);
      await open(tester, c);
      await effort(tester);
      if (exit == 'Close chooser') {
        await tester.tap(find.byTooltip(exit));
      } else if (exit == 'barrier') {
        await tester.tapAt(const Offset(5, 5));
      } else if (exit == 'back') {
        await tester.binding.handlePopRoute();
      } else {
        await tester.tap(find.text(exit));
      }
      await tester.pumpAndSettle();
      expect(c.inputs, isEmpty);
      expect(c.calls.where((x) => x == 'console.settings'), isEmpty);
      expect(c.agentSelection('one').effort, 'low');
    });
  }
  testWidgets('unchanged choices close without applying', (tester) async {
    final c = SettingsDock();
    addTearDown(c.dispose);
    await open(tester, c);
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(c.calls.where((x) => x == 'console.settings'), isEmpty);
    expect(c.inputs, isEmpty);
  });
  for (final provider in ['Codex', 'Claude']) {
    testWidgets(
      '$provider sends a pinned idle settings RPC without terminal input',
      (tester) async {
        final c = SettingsDock();
        addTearDown(c.dispose);
        c.state['sessions'][0]['provider'] = provider;
        await open(tester, c);
        expect(
          find.textContaining('reloads its saved conversation'),
          findsOneWidget,
        );
        await effort(tester);
        await tester.tap(find.text('Apply'));
        await tester.pumpAndSettle();
        final at = c.calls.indexOf('console.settings');
        expect(at, greaterThanOrEqualTo(0));
        expect(c.payloads[at], {
          'id': 'one',
          'launchId': 'launch-a',
          'accountId': 'account-a',
          'consoleKey': 'console-a',
          'model': 'test-model-a',
          'effort': 'high',
          'confirmConversationReload': true,
        });
        expect(c.inputs, isEmpty);
        expect(find.byType(LiveAgentControls), findsNothing);
        expect(
          c.agentSelection('one').effort,
          'low',
          reason: 'Launch flags do not establish effective inference settings',
        );
      },
    );
  }
  testWidgets('busy state blocks Apply despite idle-looking output', (
    tester,
  ) async {
    final c = SettingsDock();
    addTearDown(c.dispose);
    c.state['sessions'][0]['state'] = 'active';
    await open(tester, c);
    await effort(tester);
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Apply'))
          .onPressed,
      isNull,
    );
    expect(
      find.text('Wait until this chat is idle before applying settings.'),
      findsOneWidget,
    );
    expect(c.inputs, isEmpty);
  });
  for (final completionMissing in [true, false, null]) {
    testWidgets('attention blocks settings with legacy completion flag: '
        '$completionMissing', (tester) async {
      final c = SettingsDock();
      addTearDown(c.dispose);
      c.state['sessions'][0]['state'] = 'attention';
      if (completionMissing != null) {
        c.state['sessions'][0]['completionMissing'] = completionMissing;
      }
      await open(tester, c);
      await effort(tester);
      expect(
        find.text('Wait until this chat is idle before applying settings.'),
        findsOneWidget,
      );
      final button = find.widgetWithText(FilledButton, 'Apply');
      expect(tester.widget<FilledButton>(button).onPressed, isNull);
      expect(c.calls.where((x) => x == 'console.settings'), isEmpty);
      expect(c.inputs, isEmpty);
    });
  }
  testWidgets('failed resume preserves pending choices and permits recovery', (
    tester,
  ) async {
    final c = SettingsDock();
    addTearDown(c.dispose);
    c.onRequest = (method, _) async {
      if (method == 'console.settings') {
        throw StateError('Original chat is still open.');
      }
    };
    await open(tester, c);
    await effort(tester);
    await tester.tap(find.text('Apply'));
    await tester.pumpAndSettle();
    expect(find.text('Original chat is still open.'), findsOneWidget);
    expect(find.text('High'), findsOneWidget);
    expect(c.inputs, isEmpty);
    expect(c.agentSelection('one').effort, 'low');
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Apply'))
          .onPressed,
      isNotNull,
    );
  });
  testWidgets('changed launch invalidates chooser', (tester) async {
    final c = SettingsDock();
    addTearDown(c.dispose);
    await open(tester, c);
    await effort(tester);
    c.state['sessions'][0]['launchId'] = 'another';
    c.notifyListeners();
    await tester.pumpAndSettle();
    expect(
      find.text('Connection or chat changed. Reopen the chooser.'),
      findsOneWidget,
    );
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Apply'))
          .onPressed,
      isNull,
    );
    expect(c.inputs, isEmpty);
  });
  testWidgets('older PC support never falls back to terminal automation', (
    tester,
  ) async {
    final c = SettingsDock()..settingsSupported = false;
    addTearDown(c.dispose);
    await open(tester, c);
    await effort(tester);
    expect(
      find.text('Update Paddock on your PC to apply model settings.'),
      findsOneWidget,
    );
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Apply'))
          .onPressed,
      isNull,
    );
    expect(c.inputs, isEmpty);
  });
  testWidgets(
    'unavailable current models are not inserted into offered choices',
    (tester) async {
      final c = SettingsDock()
        ..choices = [
          {'id': 'test-model-b', 'name': 'Test Model B', 'efforts': <String>[]},
        ];
      addTearDown(c.dispose);
      await open(tester, c);
      await tester.tap(find.byType(DropdownButtonFormField<String>).first);
      await tester.pumpAndSettle();
      expect(find.text('Test Model A'), findsNothing);
      expect(find.text('Test Model B'), findsWidgets);
      expect(c.inputs, isEmpty);
    },
  );
  testWidgets('agent default effort is sent as null', (tester) async {
    final c = SettingsDock();
    addTearDown(c.dispose);
    await open(tester, c);
    await effort(tester, 'Agent default');
    await tester.tap(find.text('Apply'));
    await tester.pumpAndSettle();
    expect(c.payloads[c.calls.indexOf('console.settings')]['effort'], isNull);
    expect(c.inputs, isEmpty);
  });
  testWidgets('in-flight Apply cannot submit twice', (tester) async {
    final c = SettingsDock();
    addTearDown(c.dispose);
    final gate = Completer<void>();
    c.onRequest = (method, _) async {
      if (method == 'console.settings') await gate.future;
    };
    await open(tester, c);
    await effort(tester);
    await tester.tap(find.text('Apply'));
    await tester.pump();
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Applying…'))
          .onPressed,
      isNull,
    );
    expect(c.calls.where((x) => x == 'console.settings').length, 1);
    gate.complete();
    await tester.pumpAndSettle();
    expect(c.inputs, isEmpty);
  });
  testWidgets('keyboard focus survives effort update and Tab traversal', (
    tester,
  ) async {
    final c = SettingsDock();
    addTearDown(c.dispose);
    await open(tester, c);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    await effort(tester);
    expect(
      FocusManager.instance.primaryFocus,
      isNot(FocusManager.instance.rootScope),
    );
    await tester.sendKeyEvent(LogicalKeyboardKey.space);
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    await tester.sendKeyDownEvent(LogicalKeyboardKey.shiftLeft);
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.shiftLeft);
    await tester.pump();
    expect(
      FocusManager.instance.primaryFocus,
      isNot(FocusManager.instance.rootScope),
    );
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(c.inputs, isEmpty);
  });
}
