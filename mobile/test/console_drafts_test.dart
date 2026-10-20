import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/console_drafts.dart';
import 'package:agent_dock_mobile/main.dart';

import 'widget_test.dart' show FakeDock;

void main() {
  test(
    'drafts survive a new store and remain separate across PCs and consoles',
    () async {
      String? saved;
      ConsoleDrafts store() => ConsoleDrafts(
        read: () async => saved,
        write: (value) async => saved = value,
      );
      final first = store();
      final a = ConsoleDrafts.key('pc-a', 'stable-key');
      final b = ConsoleDrafts.key('pc-a', 'other-key');
      final c = ConsoleDrafts.key('pc-b', 'stable-key');
      first.set(a, 'First project');
      first.set(b, 'Second project');
      first.set(c, 'Different computer');
      await first.flush();
      first.dispose();
      final reopened = store();
      await reopened.load();
      expect(reopened.get(a), 'First project');
      expect(reopened.get(b), 'Second project');
      expect(reopened.get(c), 'Different computer');
      await reopened.forgetPC('pc-a');
      expect(reopened.get(a), '');
      expect(reopened.get(c), 'Different computer');
      reopened.dispose();
    },
  );

  test(
    'slow writes cannot replace a newer draft and errors preserve memory',
    () async {
      final gate = Completer<void>();
      final writes = <String>[];
      var fail = false;
      final store = ConsoleDrafts(
        read: () async => null,
        write: (value) async {
          if (writes.isEmpty) await gate.future;
          if (fail) throw StateError('secure storage unavailable');
          writes.add(value);
        },
      );
      addTearDown(store.dispose);
      store.set('key', 'first');
      final saving = store.flush();
      store.set('key', 'latest');
      gate.complete();
      await saving;
      expect(writes.last, contains('latest'));
      fail = true;
      store.set('key', 'not lost');
      await store.flush();
      expect(store.error, contains('Draft not saved'));
      expect(store.get('key'), 'not lost');
      fail = false;
      await store.flush();
      expect(store.error, '');
      expect(writes.last, contains('not lost'));
    },
  );

  test('unreadable storage is not silently overwritten', () async {
    var writes = 0;
    final store = ConsoleDrafts(
      read: () async => '{invalid',
      write: (_) async => writes++,
    );
    addTearDown(store.dispose);
    await store.load();
    store.set('key', 'new text');
    await store.flush();
    expect(writes, 0);
    expect(store.error, contains('could not be opened'));
  });

  testWidgets(
    'switching chats restores drafts and a reopened panel uses its stable key',
    (tester) async {
      final c = FakeDock();
      addTearDown(c.dispose);
      c.state['sessions'][0]['consoleKey'] = 'first-chat';
      c.state['sessions'].add({
        'id': 'two',
        'consoleKey': 'second-chat',
        'name': 'Other project',
        'provider': 'claude',
        'state': 'open',
      });
      await tester.pumpWidget(DockApp(client: c));
      final input = find.byType(TextField).last;
      await tester.enterText(input, 'Finish first task');
      await c.select('two');
      await tester.pumpAndSettle();
      expect(tester.widget<TextField>(input).controller!.text, '');
      await tester.enterText(input, 'Work on the other project');
      await c.select('one');
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(input).controller!.text,
        'Finish first task',
      );
      // Restoring a host session changes its process ID, but retains consoleKey.
      c.state['sessions'][0]['id'] = 'restored';
      await c.select('restored');
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(input).controller!.text,
        'Finish first task',
      );
      await c.select('two');
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(input).controller!.text,
        'Work on the other project',
      );
      expect(c.inputs, isEmpty);
    },
  );

  testWidgets('app reconstruction restores the encrypted draft', (
    tester,
  ) async {
    String? saved;
    ConsoleDrafts store() => ConsoleDrafts(
      read: () async => saved,
      write: (value) async => saved = value,
    );
    final first = FakeDock(drafts: store());
    await tester.pumpWidget(DockApp(client: first));
    await tester.enterText(find.byType(TextField).last, 'Keep after reopening');
    await first.drafts.flush();
    await tester.pumpWidget(const SizedBox());
    first.dispose();
    final second = FakeDock(drafts: store());
    addTearDown(second.dispose);
    await second.drafts.load();
    await tester.pumpWidget(DockApp(client: second));
    await tester.pumpAndSettle();
    expect(
      tester.widget<TextField>(find.byType(TextField).last).controller!.text,
      'Keep after reopening',
    );
  });
}
