import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';

import 'widget_test.dart' show FakeDock, enterChat;

class QueueDock extends FakeDock {
  Map<String, dynamic>? queueSnapshot;
  List<Map<String, dynamic>> projects = [];

  @override
  Future<dynamic> request(
    String method, [
    Map<String, dynamic> payload = const {},
  ]) async {
    final result = await super.request(method, payload);
    if (method == 'state' && queueSnapshot != null) return queueSnapshot;
    if (method == 'console.agents') return {'projects': projects};
    return result;
  }
}

QueueDock queueDock() {
  final c = QueueDock();
  c.state['capabilities'] = ['console.queue', 'prompts', 'prompts.edit'];
  c.state['queues'] = {
    'one': {
      'paused': false,
      'entries': [
        {'id': 'a', 'text': 'First queued'},
        {'id': 'b', 'text': 'Second queued'},
      ],
    },
  };
  c.state['prompts'] = [
    {
      'id': 'p',
      'name': 'Tests first',
      'text': 'Write the test first.',
      'projectId': null,
    },
    {
      'id': 'x',
      'name': 'Elsewhere',
      'text': 'Other project',
      'projectId': 'other',
    },
  ];
  return c;
}

void main() {
  testWidgets(
    'the queue lists, reorders, sends and removes messages for the open console',
    (tester) async {
      final c = queueDock();
      addTearDown(c.dispose);
      await tester.pumpWidget(DockApp(client: c));
      await enterChat(tester);
      expect(
        find.text('2'),
        findsOneWidget,
        reason: 'the queue button shows the count',
      );
      await tester.enterText(find.byType(TextField).last, 'Check the footer');
      await tester.tap(find.byTooltip('Queue'));
      await tester.pumpAndSettle();
      expect(find.text('1. First queued'), findsOneWidget);
      expect(
        find.text('Elsewhere'),
        findsNothing,
        reason: 'prompts for other projects are hidden',
      );
      await tester.tap(find.text('Queue the message box text'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Move message 2 up'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Send now').first);
      await tester.tap(find.text('Send now').first);
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Remove message 2'));
      await tester.pumpAndSettle();
      final queueCalls = [
        for (var i = 0; i < c.calls.length; i++)
          if (c.calls[i].startsWith('queue.')) [c.calls[i], c.payloads[i]],
      ];
      expect(queueCalls, [
        [
          'queue.add',
          {'id': 'one', 'text': 'Check the footer'},
        ],
        [
          'queue.move',
          {'id': 'one', 'entryId': 'b', 'offset': -1},
        ],
        [
          'queue.send',
          {'id': 'one', 'entryId': 'a'},
        ],
        [
          'queue.remove',
          {'id': 'one', 'entryId': 'b'},
        ],
      ]);
      expect(
        c.inputs,
        isEmpty,
        reason: 'the phone never types queued text itself',
      );
      await tester.tap(find.byTooltip('Close queue'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        isEmpty,
        reason: 'a queued draft leaves the message box',
      );
    },
  );

  testWidgets('a saved prompt fills the message box without sending', (
    tester,
  ) async {
    final c = queueDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    await tester.tap(find.byTooltip('Queue'));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Queue the message box text'),
          )
          .onPressed,
      isNull,
    );
    await tester.ensureVisible(find.text('Use'));
    await tester.tap(find.text('Use'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Insert at cursor'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<TextField>(find.byType(TextField).last).controller!.text,
      'Write the test first.',
    );
    expect(
      c.calls.where((x) => x.startsWith('queue.') || x == 'input'),
      isEmpty,
    );
  });

  testWidgets('shells and older PCs show no queue button', (tester) async {
    final c = queueDock();
    addTearDown(c.dispose);
    c.sessions.first['provider'] = 'shell';
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    expect(find.byTooltip('Queue'), findsNothing);
    c.sessions.first['provider'] = 'codex';
    c.state['capabilities'] = <String>[];
    c.notifyListeners();
    await tester.pumpAndSettle();
    expect(find.byTooltip('Queue'), findsNothing);
  });

  testWidgets('editing saves the full text and cancelling leaves the queue alone', (tester) async {
    final c = queueDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    await tester.tap(find.byTooltip('Queue'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Edit message 1'), findsOneWidget);
    await tester.tap(find.text('Edit').first);
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(find.byType(TextField).last).controller!.text, 'First queued');
    await tester.enterText(find.byType(TextField).last, 'Changed\nFull message');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(c.payloads[c.calls.indexOf('queue.edit')], {
      'id': 'one', 'entryId': 'a', 'text': 'Changed\nFull message',
    });
    expect(find.byTooltip('Edit message 1'), findsOneWidget);
    await tester.tap(find.text('Edit').first);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'Discard this');
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(c.calls.where((x) => x == 'queue.edit'), hasLength(1));
    expect(c.inputs, isEmpty);
    expect(c.calls.where((x) => x == 'queue.add' || x == 'queue.send'), isEmpty);
  });

  testWidgets('an edit racing a removed entry shows an error and refreshes', (tester) async {
    final c = queueDock();
    addTearDown(c.dispose);
    final refreshedQueues = <String, dynamic>{};
    final refreshedPrompts = <Map<String, dynamic>>[];
    c.queueSnapshot = {'queues': refreshedQueues, 'prompts': refreshedPrompts};
    c.onRequest = (method, payload) async {
      if (method == 'queue.edit') {
        throw StateError('This queued message was already sent or removed.');
      }
    };
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    await tester.tap(find.byTooltip('Queue'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Edit message 1'), findsOneWidget);
    await tester.tap(find.text('Edit').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.text('This queued message was already sent or removed.'), findsOneWidget);
    expect(find.text('No queued messages.'), findsOneWidget);
    expect(c.calls, contains('state'));
    expect(c.state['queues'], same(refreshedQueues));
    expect(c.state['prompts'], same(refreshedPrompts));
    expect(c.inputs, isEmpty);
  });

  for (final project in [false, true]) {
    testWidgets('save draft as prompt sends the ${project ? 'project' : 'PC'} scope', (tester) async {
      final c = queueDock();
      addTearDown(c.dispose);
      if (project) {
        c.sessions.first['projectId'] = 'project-one';
        c.projects = [{'id': 'project-one', 'name': 'Paddock'}];
      }
      await tester.pumpWidget(DockApp(client: c));
      await enterChat(tester);
      await tester.enterText(find.byType(TextField).last, 'Draft\ntext');
      await tester.tap(find.byTooltip('Queue'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Save draft as prompt'));
      await tester.tap(find.text('Save draft as prompt'));
      await tester.pumpAndSettle();
      final save = find.widgetWithText(FilledButton, 'Save');
      expect(tester.widget<FilledButton>(save).onPressed, isNull);
      await tester.enterText(find.byType(TextField).last, '   ');
      await tester.pump();
      expect(tester.widget<FilledButton>(save).onPressed, isNull);
      await tester.enterText(find.byType(TextField).last, 'Review');
      await tester.pump();
      expect(tester.widget<FilledButton>(save).onPressed, isNotNull);
      if (project) {
        await tester.tap(find.text('This PC'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Paddock').last);
        await tester.pumpAndSettle();
      } else {
        expect(find.text('Current project'), findsNothing);
      }
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(c.payloads[c.calls.indexOf('prompts.save')], {
        'name': 'Review', 'text': 'Draft\ntext',
        'scope': project ? 'project' : 'global',
        'projectId': project ? 'project-one' : null,
      });
      await tester.ensureVisible(find.byTooltip('Close queue'));
      await tester.tap(find.byTooltip('Close queue'));
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(find.byType(TextField).last).controller!.text, 'Draft\ntext');
      expect(c.calls.where((x) => x.startsWith('queue.') || x == 'input'), isEmpty);
    });
  }

  testWidgets('deleting a prompt requires confirmation', (tester) async {
    final c = queueDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    await tester.tap(find.byTooltip('Queue'));
    await tester.pumpAndSettle();
    final remove = find.byTooltip('Delete prompt Tests first');
    await tester.ensureVisible(remove);
    await tester.tap(remove);
    await tester.pumpAndSettle();
    expect(find.text('Delete saved prompt?'), findsOneWidget);
    expect(c.calls, isNot(contains('prompts.remove')));
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(c.calls, isNot(contains('prompts.remove')));
    await tester.tap(remove);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    expect(c.payloads[c.calls.indexOf('prompts.remove')], {'id': 'p'});
    expect(c.inputs, isEmpty);
  });

  for (final replace in [false, true]) {
    testWidgets('using a prompt ${replace ? 'replaces only by choice' : 'inserts at the cursor and keeps the draft'}', (tester) async {
      final c = queueDock();
      addTearDown(c.dispose);
      await tester.pumpWidget(DockApp(client: c));
      await enterChat(tester);
      await tester.enterText(find.byType(TextField).last, 'Before After');
      tester.widget<TextField>(find.byType(TextField).last).controller!.selection = const TextSelection.collapsed(offset: 7);
      await tester.tap(find.byTooltip('Queue'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Use'));
      await tester.tap(find.text('Use'));
      await tester.pumpAndSettle();
      expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Insert at cursor')).autofocus, isTrue);
      await tester.tap(find.text(replace ? 'Replace draft' : 'Insert at cursor'));
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        replace ? 'Write the test first.' : 'Before Write the test first.After');
      expect(tester.widget<TextField>(find.byType(TextField).last).controller!.selection,
        TextSelection.collapsed(offset: replace ? 'Write the test first.'.length : 7 + 'Write the test first.'.length));
      expect(c.calls.where((x) => x.startsWith('queue.') || x == 'input'), isEmpty);
    });
  }

  testWidgets('a host without prompts.edit hides save and delete and supports insertion', (tester) async {
    final c = queueDock();
    addTearDown(c.dispose);
    c.state['capabilities'] = ['console.queue', 'prompts'];
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    await tester.tap(find.byTooltip('Queue'));
    await tester.pumpAndSettle();
    expect(find.text('Save draft as prompt'), findsNothing);
    expect(find.byTooltip('Delete prompt Tests first'), findsNothing);
    // queue.edit is part of console.queue on existing hosts.
    expect(find.text('Edit'), findsNWidgets(2));
    await tester.ensureVisible(find.text('Use'));
    await tester.tap(find.text('Use'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Insert at cursor'));
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(find.byType(TextField).last).controller!.text, 'Write the test first.');
  });

  testWidgets('a successful queue add clears the draft even if the console dies', (tester) async {
    final c = queueDock();
    addTearDown(c.dispose);
    c.onRequest = (method, payload) async {
      if (method == 'queue.add') {
        c.sessions.first['alive'] = false;
        c.notifyListeners();
      }
    };
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    await tester.enterText(find.byType(TextField).last, 'Queue once');
    await tester.tap(find.byTooltip('Queue'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Queue the message box text'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Close queue'));
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(find.byType(TextField).last).controller!.text, isEmpty);
    expect(c.calls.where((x) => x == 'queue.add'), hasLength(1));
  });

  testWidgets('insertion replaces the selected range and leaves the cursor after the prompt', (tester) async {
    final c = queueDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    await tester.enterText(find.byType(TextField).last, 'Before selected After');
    tester.widget<TextField>(find.byType(TextField).last).controller!.selection =
        const TextSelection(baseOffset: 15, extentOffset: 7);
    await tester.tap(find.byTooltip('Queue'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Use'));
    await tester.tap(find.text('Use'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Insert at cursor'));
    await tester.pumpAndSettle();
    final composer = tester.widget<TextField>(find.byType(TextField).last).controller!;
    expect(composer.text, 'Before Write the test first. After');
    expect(composer.selection, TextSelection.collapsed(offset: 7 + 'Write the test first.'.length));
    expect(c.calls.where((x) => x.startsWith('queue.') || x == 'input'), isEmpty);
  });

  testWidgets('a prompt action error is scrolled into view', (tester) async {
    final c = queueDock();
    addTearDown(c.dispose);
    c.onRequest = (method, payload) async {
      if (method == 'prompts.remove') throw StateError('This saved prompt was already removed.');
    };
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    await tester.tap(find.byTooltip('Queue'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byTooltip('Delete prompt Tests first'));
    await tester.tap(find.byTooltip('Delete prompt Tests first'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    expect(find.text('This saved prompt was already removed.').hitTestable(), findsOneWidget);
  });

}
