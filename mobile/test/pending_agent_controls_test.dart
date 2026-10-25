import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/live_agent_controls.dart';
import 'package:agent_dock_mobile/agent_selection.dart';

import 'widget_test.dart' show FakeDock;
import 'agent_menu_test.dart' show menuText, paint;

Future<void> open(WidgetTester tester, FakeDock c) async {
  c.state['sessions'][0]['model'] = 'test-model-a';
  c.state['sessions'][0]['effort'] = 'low';
  paint(c, '› ');
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

Future<void> effort(WidgetTester tester) async {
  await tester.tap(find.byType(DropdownButtonFormField<String>).last);
  await tester.pumpAndSettle();
  await tester.tap(find.text('High').last);
  await tester.pumpAndSettle();
}

void simulate(FakeDock c, {bool interrupt = false, bool confirm = true}) {
  var phase = 0, selected = 0, model = 'test-model-a';
  c.onInput = (input) async {
    final data = input['data'];
    if (data == '/model') return;
    if (phase == 0 && data == '\r') {
      phase = 1;
      paint(c, menuText());
      return;
    }
    if (data == '\x1b[B') {
      selected = 1;
      paint(c, menuText(selected: selected, effort: phase == 2));
      if (interrupt) {
        c.generation++;
        c.notifyListeners();
      }
      return;
    }
    if (data == '\r' && phase == 1) {
      model = selected == 0 ? 'test-model-a' : 'test-model-b';
      phase = 2;
      selected = 0;
      paint(c, menuText(effort: true));
      return;
    }
    if (data == '\r' && phase == 2) {
      paint(
        c,
        confirm
            ? 'Model changed to $model with high reasoning\r\n› '
            : 'Setting failed\r\n› ',
      );
    }
  };
}

void main() {
  for (final exit in ['Cancel', 'Close chooser', 'barrier', 'back']) {
    testWidgets('pending effort and $exit leave the console untouched', (
      tester,
    ) async {
      final c = FakeDock();
      addTearDown(c.dispose);
      await open(tester, c);
      await effort(tester);
      expect(c.inputs, isEmpty);
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
      expect(c.agentSelection('one').effort, 'low');
    });
  }
  testWidgets('unchanged choices close with zero input', (tester) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    await open(tester, c);
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(c.inputs, isEmpty);
  });
  testWidgets('effort-only Apply keeps the model and waits for confirmation', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    simulate(c);
    await open(tester, c);
    await effort(tester);
    expect(c.inputs, isEmpty);
    await tester.tap(find.text('Apply'));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(c.inputs.map((x) => x['data']), [
      '/model',
      '\r',
      '\r',
      '\x1b[B',
      '\r',
    ]);
    expect(c.agentSelection('one').model, 'test-model-a');
    expect(c.agentSelection('one').effort, 'high');
    expect(find.byType(LiveAgentControls), findsNothing);
  });
  testWidgets('model and effort are staged together before Apply', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    simulate(c);
    await open(tester, c);
    await tester.tap(find.byType(DropdownButtonFormField<String>).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Test Model B').last);
    await tester.pumpAndSettle();
    await effort(tester);
    expect(c.inputs, isEmpty);
    await tester.tap(find.text('Apply'));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(c.agentSelection('one').model, 'test-model-b');
    expect(c.agentSelection('one').effort, 'high');
    expect(c.inputs.map((x) => x['data']), [
      '/model',
      '\r',
      '\x1b[B',
      '\r',
      '\x1b[B',
      '\r',
    ]);
  });
  testWidgets('existing prompt input is preserved', (tester) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    await open(tester, c);
    await effort(tester);
    paint(c, '› Unsent draft');
    await tester.tap(find.text('Apply'));
    await tester.pumpAndSettle();
    expect(c.inputs, isEmpty);
    expect(
      find.text('Wait for the agent and clear its terminal input first.'),
      findsOneWidget,
    );
  });
  testWidgets('reconnect during Apply stops before another key', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    simulate(c, interrupt: true);
    await open(tester, c);
    await effort(tester);
    await tester.tap(find.text('Apply'));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(c.inputs.map((x) => x['data']), ['/model', '\r', '\r', '\x1b[B']);
    expect(c.agentSelection('one').effort, 'low');
  });
  testWidgets('unconfirmed changes keep pending fields and show recovery', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    simulate(c, confirm: false);
    await open(tester, c);
    await effort(tester);
    await tester.tap(find.text('Apply'));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(seconds: 7));
    await tester.pumpAndSettle();
    expect(
      find.text(
        'Could not confirm the change. Check the terminal before trying again.',
      ),
      findsOneWidget,
    );
    expect(find.text('High'), findsOneWidget);
    expect(c.agentSelection('one').effort, 'low');
  });
  test('selection confirmations require actual model values', () {
    expect(selectionConfirmation('Select Model and Effort'), isNull);
    expect(
      selectionConfirmation('Model changed to gpt-6.1-sol with max reasoning')
          ?.effort,
      'max',
    );
    expect(
      selectionConfirmation('Model changed to test-model-a with high reasoning')
          ?.model,
      'test-model-a',
    );
  });
}
