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
  test('dimmed placeholder hints count as an empty prompt', () {
    final hint = Terminal()..resize(80, 20);
    hint.write('\x1b[1m›\x1b[0m \x1b[2mImplement {feature}\x1b[0m\x1b[3G');
    expect(hasEmptyAgentPrompt(hint, 'codex'), true);
    final claude = Terminal()..resize(80, 20);
    claude.write('❯ \x1b[2mTry "fix lint errors"\x1b[0m\x1b[3G');
    expect(hasEmptyAgentPrompt(claude, 'claude'), true);
    final typed = Terminal()..resize(80, 20);
    typed.write('› \x1b[2mhint\x1b[0m typed');
    expect(hasEmptyAgentPrompt(typed, 'codex'), false);
    final parked = Terminal()..resize(80, 20);
    parked.write('› Ask Codex to do anything\r\n\r\n  ? for shortcuts');
    expect(hasEmptyAgentPrompt(parked, 'codex'), true);
    parked.write('\x1b[1;3Hdraft');
    parked.write('\x1b[3;1H');
    expect(hasEmptyAgentPrompt(parked, 'codex'), false);
  });
  test('a narrow PC menu keeps a soft-wrapped navigation footer', () {
    final terminal = Terminal()..resize(32, 24);
    terminal.write(menuText(session: true));
    final menu = AgentMenu.parse(activeTerminalText(terminal));
    expect(menu?.options, ['Test Model A', 'Test Model B']);
    expect(menu?.sessionOnly, true);
  });
}
