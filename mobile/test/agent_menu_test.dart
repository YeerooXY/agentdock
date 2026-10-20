import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/agent_menu.dart';
import 'package:agent_dock_mobile/live_agent_controls.dart';
import 'package:xterm/xterm.dart';

import 'widget_test.dart' show FakeDock;

String menuText({
  int selected = 0,
  bool effort = false,
  bool session = false,
}) =>
    '${effort ? 'Select Reasoning Level for Test Model' : 'Select Model and Effort'}\r\n\r\n'
    '${selected == 0 ? '›' : ' '} 1. ${effort ? 'Low' : 'Test Model A'}\r\n'
    '${selected == 1 ? '›' : ' '} 2. ${effort ? 'High' : 'Test Model B'}\r\n\r\n'
    'enter select${session ? ' · s session only' : ''} · esc back';

void paint(FakeDock c, String text) =>
    c.screen!.terminal.write('\x1b[2J\x1b[H$text');

Future<void> sheet(WidgetTester tester, FakeDock c) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: LiveAgentControls(client: c, action: 'Model'),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  test('numbered live models and effort keep their current selection', () {
    for (final effort in [false, true]) {
      final menu = AgentMenu.parse(menuText(selected: 1, effort: effort));
      expect(menu?.selected, 1);
      expect(menu?.options.length, 2);
      expect(menu?.sessionOnly, false);
    }
    expect(AgentMenu.parse(menuText(session: true))!.sessionOnly, true);
  });
  test('unknown, partial and stale menu output is never actionable', () {
    final normal = menuText();
    for (final text in [
      normal.replaceAll('›', ' '),
      normal.replaceAll('  2.', '› 2.'),
      normal.replaceAll(' 2.', ' 7.'),
      normal.replaceAll('esc back', ''),
      '$normal\r\n› New input',
      'Output describing Select Model\r\n› 1. A\r\nenter select · esc back',
    ]) {
      expect(AgentMenu.parse(text), isNull, reason: text);
    }
    final terminal = Terminal()..resize(80, 8);
    terminal.write('$normal\r\n${'\r\n' * 15}› ');
    expect(AgentMenu.parse(activeTerminalText(terminal)), isNull);
  });
  test('prompt detection does not treat existing input as empty', () {
    final terminal = Terminal()..resize(80, 20);
    terminal.write('› ');
    expect(hasEmptyAgentPrompt(terminal, 'codex'), true);
    terminal.write('keep this');
    expect(hasEmptyAgentPrompt(terminal, 'codex'), false);
    expect(hasEmptyAgentPrompt(terminal, 'shell'), false);
  });
  test('a narrow PC menu keeps a soft-wrapped navigation footer', () {
    final terminal = Terminal()..resize(32, 24);
    terminal.write(menuText(session: true));
    final menu = AgentMenu.parse(activeTerminalText(terminal));
    expect(menu?.options, ['Test Model A', 'Test Model B']);
    expect(menu?.sessionOnly, true);
  });

  testWidgets('native row selection uses the live model then live effort', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    paint(c, menuText());
    var effort = false, selected = 0;
    c.onInput = (value) async {
      if (value['data'] == '\x1b[B') selected = 1;
      if (value['data'] == '\r' && !effort) {
        effort = true;
        selected = 0;
      } else if (value['data'] == '\r' && effort) {
        paint(c, 'Model and effort set\r\n› ');
        return;
      }
      paint(c, menuText(selected: selected, effort: effort));
    };
    await sheet(tester, c);
    await tester.tap(find.text('Test Model B'));
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pumpAndSettle();
    expect(c.inputs.map((e) => e['data']), ['\x1b[B', '\r']);
    expect(find.text('High'), findsOneWidget);
    await tester.tap(find.text('High'));
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pumpAndSettle();
    expect(c.inputs.map((e) => e['data']), ['\x1b[B', '\r', '\x1b[B', '\r']);
    expect(find.text('Done'), findsOneWidget);
    expect(find.byType(TerminalView), findsNothing);
    expect(find.byIcon(Icons.arrow_upward), findsNothing);
  });

  for (final change in [
    'connection',
    'console',
    'pc',
    'background',
    'provider',
    'menu',
  ]) {
    testWidgets('selection stops before Enter when $change changes', (
      tester,
    ) async {
      final c = FakeDock();
      addTearDown(c.dispose);
      paint(c, menuText());
      c.onInput = (_) async {
        switch (change) {
          case 'connection':
            c.generation++;
          case 'console':
            c.selected = 'two';
          case 'pc':
            c.pairing = {'pin': 'other'};
          case 'background':
            c.foreground = false;
          case 'provider':
            c.state['sessions'][0]['provider'] = 'claude';
          case 'menu':
            paint(c, menuText().replaceAll('Test Model', 'Different Model'));
        }
        c.notifyListeners();
      };
      await sheet(tester, c);
      await tester.tap(find.text('Test Model B'));
      await tester.pumpAndSettle();
      expect(c.inputs.map((e) => e['data']), ['\x1b[B']);
    });
  }
  testWidgets(
    'Claude session-only key is used only when the CLI advertises it',
    (tester) async {
      final c = FakeDock();
      addTearDown(c.dispose);
      c.state['sessions'][0]['provider'] = 'claude';
      paint(c, menuText(session: true));
      c.onInput = (_) async => paint(c, 'Model changed\r\n❯ ');
      await sheet(tester, c);
      expect(find.text('This session only'), findsOneWidget);
      await tester.tap(find.text('Test Model A'));
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pumpAndSettle();
      expect(c.inputs.single['data'], 's');
    },
  );
  testWidgets('busy or nonempty prompts never receive a model command', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    paint(c, '› Unsent PC message');
    await sheet(tester, c);
    await tester.pumpAndSettle();
    expect(c.inputs, isEmpty);
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Open model'))
          .onPressed,
      isNull,
    );
  });
}
