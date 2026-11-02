import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:xterm/xterm.dart';
import 'package:agent_dock_mobile/agent_menu.dart';

// Screens captured from a real Codex 0.165 /model flow at 60x24.
AgentMenu menuFrom(String name) {
  final menu = AgentMenu.parse(File('test/fixtures/$name').readAsStringSync());
  expect(menu, isNotNull, reason: name);
  return menu!;
}

void main() {
  claudeMenu();
  test('model menu matches labels, including names with spaces', () {
    final menu = menuFrom('codex-model-menu.txt');
    expect(menu.selected, 2);
    expect(menuOptionIndex(menu, 'gpt-6.1-sol'), 0);
    expect(menuOptionIndex(menu, 'gpt-6.1-terra', name: 'GPT-6.1 Terra'), 2);
    expect(menuOptionIndex(menu, 'gpt-6-sol'), 3);
  });

  test('Max and Ultra are not matched by the More reasoning description', () {
    final menu = menuFrom('codex-effort-menu.txt');
    expect(menu.sessionOnly, isTrue);
    expect(menuOptionIndex(menu, 'medium'), 1);
    expect(menuOptionIndex(menu, 'high'), 2);
    expect(menuOptionIndex(menu, 'xhigh'), 3);
    expect(menuOptionIndex(menu, 'max'), -1);
    expect(menu.options.indexWhere((o) => o.toLowerCase().contains('more reasoning')), 4);
  });

  test('Advanced Reasoning submenu offers Max and Ultra', () {
    final menu = menuFrom('codex-advanced-reasoning.txt');
    expect(menu.title, 'Advanced Reasoning');
    expect(menuOptionIndex(menu, 'max'), 0);
    expect(menuOptionIndex(menu, 'ultra'), 1);
  });

  test('a working agent is detected from the screen', () {
    expect(agentWorking('• Working (5s • esc to interrupt)'), isTrue);
    expect(agentWorking('› Ask Codex to do anything'), isFalse);
  });

  test('the real idle Codex prompt with a dimmed hint counts as empty', () {
    final terminal = Terminal()..resize(60, 24);
    terminal.write('\x1b[21;1H\x1b[1m›\x1b[0m \x1b[2mAsk Codex to do anything\x1b[0m'
        '\x1b[23;3HGPT-6.1 Terra xhigh · ~\\Projects\x1b[21;3H');
    expect(hasEmptyAgentPrompt(terminal, 'codex'), isTrue);
  });
}

void claudeMenu() {
  // Screen captured from Claude Code 2.1.316 /model at 60x24. The footer wraps
  // and the effort slider sits between the options and the footer.
  test('Claude model menu parses with a wrapped footer and ignores the slider', () {
    final menu = menuFrom('claude-model-menu.txt');
    expect(menu.title, 'Select model');
    expect(menu.selected, 2);
    expect(menu.sessionOnly, isTrue);
    expect(menuOptionIndex(menu, 'opus', name: 'Opus'), 1);
    expect(menuOptionIndex(menu, 'sonnet', name: 'Sonnet'), 2);
    expect(menuOptionIndex(menu, 'haiku', name: 'Haiku'), -1);
    final moved = AgentMenu.parse(
      File('test/fixtures/claude-model-menu.txt')
          .readAsStringSync()
          .replaceAll('● High effort', '● Max effort')
          .replaceAll('❯ 3.', '  3.')
          .replaceAll('  2.  Opus', '❯ 2.  Opus'),
    );
    expect(moved!.selected, 1);
    expect(moved.signature, menu.signature);
  });
}
