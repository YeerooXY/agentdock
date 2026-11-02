import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/agent_dialog_panel.dart';

import 'widget_test.dart' show FakeDock;
import 'agent_menu_test.dart' show paint;

String fixture(String name) => File('test/fixtures/$name').readAsStringSync();

/// A dialog that answers Up, Down and Enter the way the CLIs do: the selector
/// marker moves, and Enter replaces the screen with [after].
class SimulatedDialog {
  final FakeDock c;
  final String provider;
  final List<String> rows;
  final String Function(int selected) draw;
  final String after;
  int selected;
  int enters = 0;
  SimulatedDialog(
    this.c, {
    required this.provider,
    required this.rows,
    required this.draw,
    required this.after,
    this.selected = 0,
  }) {
    c.state['sessions'][0]['provider'] = provider;
    c.onInput = (input) async {
      final data = input['data'];
      if (data == '\x1b[B' && selected < rows.length - 1) {
        selected++;
        paint(c, draw(selected));
      } else if (data == '\x1b[A' && selected > 0) {
        selected--;
        paint(c, draw(selected));
      } else if (data == '\r') {
        enters++;
        paint(c, after);
      } else if (data == '\x1b') {
        paint(c, after);
      }
    };
    paint(c, draw(selected));
  }
}

String claudeQuestion(int selected, {bool detail = true}) {
  const labels = ['Phone chat box', 'PC terminal prompt'];
  final rows = [
    for (var i = 0; i < labels.length; i++)
      '${i == selected ? '❯' : ' '} ${i + 1}. ${labels[i]}\r\n'
          '${detail ? '     Detail for ${labels[i]}\r\n' : ''}',
  ];
  return ' Where is the text?\r\n\r\n${rows.join()}\r\n'
      ' Enter to select · ↑/↓ to navigate · Esc to cancel';
}

String codexApproval(int selected) {
  const labels = [
    'Yes, proceed (y)',
    "Yes, and don't ask again (p)",
    'No, and tell Codex what to do differently (esc)',
  ];
  return '  Would you like to run the following command?\r\n\r\n'
      '  \$ git push origin main\r\n\r\n'
      '${[for (var i = 0; i < labels.length; i++) '${i == selected ? '›' : ' '} ${i + 1}. ${labels[i]}\r\n'].join()}\r\n'
      '  Press enter to confirm or esc to cancel';
}

Future<void> show(WidgetTester tester, FakeDock c, {VoidCallback? keys}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: AgentDialogPanel(client: c, onTerminalKeys: keys),
        ),
      ),
    ),
  );
  await tester.pump();
}

Future<void> settle(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 400));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('no dialog on screen shows nothing and sends nothing', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    paint(c, '› ');
    await show(tester, c);
    expect(find.byType(OutlinedButton), findsNothing);
    expect(c.inputs, isEmpty);
  });

  testWidgets('Claude question: tapping the second option moves, then Enter', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    final dialog = SimulatedDialog(
      c,
      provider: 'Claude',
      rows: ['a', 'b'],
      draw: claudeQuestion,
      after: '● Answer received\r\n❯ ',
    );
    await show(tester, c);
    expect(find.text('1. Phone chat box'), findsOneWidget);
    expect(find.text('Detail for PC terminal prompt'), findsOneWidget);
    expect(c.inputs, isEmpty, reason: 'showing the panel sends nothing');
    await tester.tap(find.text('2. PC terminal prompt'));
    await settle(tester);
    expect(c.inputs.map((x) => x['data']), ['\x1b[B', '\r']);
    expect(dialog.selected, 1);
    expect(find.byType(OutlinedButton), findsNothing);
  });

  testWidgets(
    'Claude question: tapping the selected option presses Enter only',
    (tester) async {
      final c = FakeDock();
      addTearDown(c.dispose);
      SimulatedDialog(
        c,
        provider: 'Claude',
        rows: ['a', 'b'],
        draw: claudeQuestion,
        after: '❯ ',
      );
      await show(tester, c);
      await tester.tap(find.text('1. Phone chat box'));
      await settle(tester);
      expect(c.inputs.map((x) => x['data']), ['\r']);
    },
  );

  testWidgets('Codex approval: third option moves twice, then Enter', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    final dialog = SimulatedDialog(
      c,
      provider: 'Codex',
      rows: ['a', 'b', 'c'],
      draw: codexApproval,
      after: '• Running git push\r\n› ',
    );
    await show(tester, c);
    expect(find.textContaining('Would you like to run'), findsOneWidget);
    await tester.tap(find.textContaining('3. No, and tell Codex'));
    await settle(tester);
    expect(c.inputs.map((x) => x['data']), ['\x1b[B', '\x1b[B', '\r']);
    expect(dialog.selected, 2);
  });

  testWidgets('moving back up uses Up', (tester) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    SimulatedDialog(
      c,
      provider: 'Codex',
      rows: ['a', 'b', 'c'],
      draw: codexApproval,
      after: '› ',
      selected: 2,
    );
    await show(tester, c);
    await tester.tap(find.textContaining('1. Yes, proceed'));
    await settle(tester);
    expect(c.inputs.map((x) => x['data']), ['\x1b[A', '\x1b[A', '\r']);
  });

  testWidgets('a free-text row is selected but Enter is not pressed', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    var opened = 0;
    SimulatedDialog(
      c,
      provider: 'Claude',
      rows: ['a', 'b'],
      draw: (s) =>
          ' Pick\r\n\r\n${s == 0 ? '❯' : ' '} 1. Small\r\n${s == 1 ? '❯' : ' '} 2. Type something.\r\n\r\n Enter to select · Esc to cancel',
      after: '❯ ',
    );
    await show(tester, c, keys: () => opened++);
    await tester.tap(find.text('2. Type something.'));
    await settle(tester);
    expect(c.inputs.map((x) => x['data']), ['\x1b[B']);
    expect(opened, 1);
  });

  testWidgets('the dialog changing mid-way stops before Enter', (tester) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    SimulatedDialog(
      c,
      provider: 'Codex',
      rows: ['a', 'b', 'c'],
      draw: codexApproval,
      after: '› ',
    );
    final inner = c.onInput!;
    c.onInput = (input) async {
      if (input['data'] == '\x1b[B') {
        paint(c, 'Something else entirely\r\n› ');
        return;
      }
      await inner(input);
    };
    await show(tester, c);
    await tester.tap(find.textContaining('3. No, and tell'));
    await settle(tester);
    expect(c.inputs.map((x) => x['data']), ['\x1b[B']);
    expect(find.byType(OutlinedButton), findsNothing);
  });

  testWidgets(
    'a dialog that ignores the arrow reports instead of pressing Enter',
    (tester) async {
      final c = FakeDock();
      addTearDown(c.dispose);
      SimulatedDialog(
        c,
        provider: 'Claude',
        rows: ['a', 'b'],
        draw: claudeQuestion,
        after: '❯ ',
      );
      c.onInput = (_) async {};
      await show(tester, c);
      await tester.tap(find.text('2. PC terminal prompt'));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(c.inputs.map((x) => x['data']), ['\x1b[B']);
      expect(
        find.text(
          'Could not confirm the choice. Check the terminal before trying again.',
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets('a disconnect during the choice sends nothing further', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    SimulatedDialog(
      c,
      provider: 'Codex',
      rows: ['a', 'b', 'c'],
      draw: codexApproval,
      after: '› ',
    );
    final inner = c.onInput!;
    c.onInput = (input) async {
      await inner(input);
      c.generation++;
      c.notifyListeners();
    };
    await show(tester, c);
    await tester.tap(find.textContaining('3. No, and tell'));
    await settle(tester);
    expect(c.inputs.map((x) => x['data']), ['\x1b[B']);
  });

  testWidgets('Cancel dialog sends Escape', (tester) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    SimulatedDialog(
      c,
      provider: 'Codex',
      rows: ['a', 'b', 'c'],
      draw: codexApproval,
      after: '› ',
    );
    await show(tester, c);
    await tester.tap(find.text('Cancel dialog'));
    await settle(tester);
    expect(c.inputs.map((x) => x['data']), ['\x1b']);
  });

  testWidgets('multi-select dialogs show guidance, not taps', (tester) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    c.state['sessions'][0]['provider'] = 'Claude';
    paint(
      c,
      ' Pick\r\n\r\n ❯ [ ] Tests\r\n   [x] Docs\r\n\r\n Enter to select · Esc to cancel',
    );
    await show(tester, c);
    expect(find.textContaining('several choices'), findsOneWidget);
    expect(find.text('Tests'), findsNothing);
  });

  testWidgets('other harnesses and worker consoles are left alone', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    c.state['sessions'][0]['provider'] = 'Gemini';
    paint(c, codexApproval(0));
    await show(tester, c);
    expect(find.byType(OutlinedButton), findsNothing);
    c.state['sessions'][0]['provider'] = 'Codex';
    c.state['sessions'][0]['taskId'] = 't1';
    c.notifyListeners();
    await tester.pump();
    expect(find.byType(OutlinedButton), findsNothing);
  });

  testWidgets('real captured Codex permissions menu is tappable', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    c.state['sessions'][0]['provider'] = 'Codex';
    paint(c, fixture('codex-permissions-menu.txt').replaceAll('\n', '\r\n'));
    await show(tester, c);
    expect(find.textContaining('Read Only'), findsOneWidget);
    expect(c.inputs, isEmpty);
  });

  testWidgets('real captured Claude trust prompt is tappable', (tester) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    c.state['sessions'][0]['provider'] = 'Claude';
    paint(c, fixture('claude-trust-prompt.txt').replaceAll('\n', '\r\n'));
    await show(tester, c);
    expect(find.text('Yes, I trust this folder'), findsOneWidget);
    expect(
      c.inputs,
      isEmpty,
      reason: 'a trust prompt is never answered for you',
    );
  });
}
