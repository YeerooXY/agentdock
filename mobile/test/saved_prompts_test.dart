import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';

import 'widget_test.dart' show FakeDock;

Future<void> openPrompts(WidgetTester tester) async {
  await tester.tap(find.byTooltip('Attach'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Saved prompts'));
  await tester.pumpAndSettle();
}

FakeDock promptsDock() {
  final c = FakeDock();
  c.state['capabilities'] = ['prompts', 'prompts.edit'];
  c.state['prompts'] = [
    {
      'id': 'one',
      'name': 'Run tests',
      'text': 'Run the tests.',
      'projectId': null,
    },
    {
      'id': 'other',
      'name': 'Other project',
      'text': 'Private other project',
      'projectId': 'other',
    },
  ];
  return c;
}

void main() {
  testWidgets(
    'saved prompts stay separate from queues and only edit the draft',
    (tester) async {
      final c = promptsDock();
      addTearDown(c.dispose);
      await tester.pumpWidget(DockApp(client: c));
      await tester.pumpAndSettle();
      final field = find.byType(TextField).last;
      await tester.enterText(field, 'Keep this draft');
      await tester.pump();
      await openPrompts(tester);
      expect(find.text('Other project'), findsNothing);
      expect(find.text('Queue'), findsNothing);
      await tester.tap(find.text('Use'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Insert at cursor'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(field).controller!.text,
        'Keep this draftRun the tests.',
      );
      expect(c.inputs, isEmpty);
      expect(c.calls.where((v) => v.startsWith('queue.')), isEmpty);
    },
  );

  testWidgets(
    'saving a draft and confirming prompt deletion use existing APIs',
    (tester) async {
      final c = promptsDock();
      addTearDown(c.dispose);
      await tester.pumpWidget(DockApp(client: c));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).last, 'Draft text');
      await tester.pump();
      await openPrompts(tester);
      await tester.tap(find.text('Save draft as prompt'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Name'),
        'My prompt',
      );
      await tester.pump();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(c.payloads[c.calls.indexOf('prompts.save')]['text'], 'Draft text');
      await tester.tap(find.byTooltip('Delete prompt Run tests'));
      await tester.pumpAndSettle();
      expect(c.calls, isNot(contains('prompts.remove')));
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();
      expect(c.calls, contains('prompts.remove'));
      expect(c.inputs, isEmpty);
    },
  );
}
