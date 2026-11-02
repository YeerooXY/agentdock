import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/agent_dialog.dart';

String fixture(String name) => File('test/fixtures/$name').readAsStringSync();

/// Fixtures marked "captured" came from the real CLI in a terminal. Those
/// marked "reconstructed" follow the layouts the CLIs document or showed on
/// the phone; replace them with captures when a dialog can be raised safely.
void main() {
  group('Claude', () {
    test('captured trust prompt: unnumbered options, selector marker', () {
      final d = parseAgentDialog(fixture('claude-trust-prompt.txt'), 'claude')!;
      expect(d.unsupported, isNull);
      expect(d.options.map((o) => o.label), [
        'No, exit',
        'Yes, I trust this folder',
      ]);
      expect(d.selected, 0);
      expect(d.title, endsWith('Security guide'));
      expect(d.footer, 'Enter to confirm · Esc to cancel');
    });

    test('captured /model menu: numbered, descriptions and effort slider', () {
      final d = parseAgentDialog(fixture('claude-model-menu.txt'), 'claude')!;
      expect(d.options.map((o) => o.label), [
        'Default (recommended)',
        'Opus 5.5',
        'Sonnet 5.5',
      ]);
      expect(d.options.map((o) => o.number), [1, 2, 3]);
      expect(d.selected, 2);
      expect(d.options[1].detail, contains('complex work'));
    });

    test(
      'captured /theme menu: unnumbered, check mark on the selected row',
      () {
        final d = parseAgentDialog(fixture('claude-theme-menu.txt'), 'claude')!;
        expect(d.options.map((o) => o.label), [
          'Auto (match terminal)',
          'Dark mode',
          'Light mode',
          'Dark mode (colorblind-friendly)',
          'Light mode (colorblind-friendly)',
        ]);
        expect(d.selected, 1);
      },
    );

    test('captured /model after Up: a hint arrow replaces the selector', () {
      final d = parseAgentDialog(
        fixture('claude-model-menu-up.txt'),
        'claude',
      )!;
      final before = parseAgentDialog(fixture('claude-model-menu.txt'), 'claude')!;
      expect(d.selected, 1);
      expect(d.options.length, 3);
      expect(d.signature, before.signature);
    });

    test('captured /theme after Down: the check mark leaves the selector', () {
      final d = parseAgentDialog(
        fixture('claude-theme-menu-moved.txt'),
        'claude',
      )!;
      expect(d.options.map((o) => o.label), [
        'Auto (match terminal)',
        'Dark mode',
        'Light mode',
        'Dark mode (colorblind-friendly)',
        'Light mode (colorblind-friendly)',
      ]);
      expect(d.selected, 2);
      final before = parseAgentDialog(
        fixture('claude-theme-menu.txt'),
        'claude',
      )!;
      expect(d.signature, before.signature);
    });

    test(
      'reconstructed AskUserQuestion: groups around rules, free text row',
      () {
        final d = parseAgentDialog(
          fixture('claude-ask-question.txt'),
          'claude',
        )!;
        expect(d.title, startsWith('Where is the text'));
        expect(d.options.map((o) => o.label), [
          'Phone chat box',
          'PC terminal prompt',
          'Type something.',
          'Chat about this',
        ]);
        expect(d.options.map((o) => o.needsText), [false, false, true, false]);
        expect(d.options.first.detail, contains('never reaches the PC'));
        expect(d.selected, 0);
      },
    );

    test('reconstructed permission prompt', () {
      final d = parseAgentDialog(fixture('claude-permission.txt'), 'claude')!;
      expect(d.title, contains('Do you want to proceed?'));
      expect(d.title, contains('git status'));
      expect(d.options.length, 3);
      expect(d.options.last.label, startsWith('No, and tell Claude'));
    });
  });

  group('Codex', () {
    test('captured /model menu', () {
      final d = parseAgentDialog(fixture('codex-model-menu.txt'), 'codex')!;
      expect(d.options.length, 8);
      expect(d.options[2].label, startsWith('GPT-6.1 Terra'));
      expect(d.selected, 2);
    });

    test('captured /permissions menu', () {
      final d = parseAgentDialog(
        fixture('codex-permissions-menu.txt'),
        'codex',
      )!;
      expect(d.options.map((o) => o.label), [
        'Ask for approval',
        'Approve for me',
        'Full Access (current)',
        'Read Only',
      ]);
      expect(d.selected, 2);
      expect(d.title, 'Update Model Permissions');
    });

    test('captured reasoning menu', () {
      final d = parseAgentDialog(fixture('codex-effort-menu.txt'), 'codex')!;
      expect(d.options.length, 5);
      expect(d.options.last.label, startsWith('More reasoning'));
    });

    test('reconstructed approval prompt keeps shortcut letters in labels', () {
      final d = parseAgentDialog(fixture('codex-approval.txt'), 'codex')!;
      expect(d.options.first.label, 'Yes, proceed (y)');
      expect(d.title, contains(r'$ git push'));
      expect(d.options.length, 3);
    });
  });

  group('rejects what is not a driveable dialog', () {
    test('the idle prompt', () {
      expect(
        parseAgentDialog(
          '› Ask Codex to do anything\n\n  ? for shortcuts',
          'codex',
        ),
        isNull,
      );
    });
    test('a working turn with the prompt box drawn', () {
      expect(
        parseAgentDialog(
          '• Working (5s • esc to interrupt)\n\n› draft text',
          'codex',
        ),
        isNull,
      );
    });
    test('the slash-command popup', () {
      const popup =
          '  ❯ /model        Set the model\n'
          '    /auto-mode  Teach auto mode\n'
          '────────────────────────\n'
          '❯ /model\n'
          '────────────────────────\n'
          '  ⏵⏵ auto mode on (shift+tab to cycle)';
      expect(parseAgentDialog(popup, 'claude'), isNull);
    });
    test('two selectors', () {
      expect(
        parseAgentDialog(
          '❯ 1. A\n❯ 2. B\n\nEnter to select · Esc to cancel',
          'claude',
        ),
        isNull,
      );
    });
    test('numbers that go backwards', () {
      expect(
        parseAgentDialog('› 2. A\n  1. B\n\nenter select · esc back', 'codex'),
        isNull,
      );
    });
    test('output text after the footer', () {
      expect(
        parseAgentDialog(
          '› 1. A\n  2. B\n\nenter select · esc back\nmore output',
          'codex',
        ),
        isNull,
      );
    });
    test('a provider without a profile', () {
      expect(
        parseAgentDialog('› 1. A\n  2. B\n\nenter select · esc back', 'gemini'),
        isNull,
      );
    });
    test('a single option', () {
      expect(
        parseAgentDialog('› 1. A\n\nenter select · esc back', 'codex'),
        isNull,
      );
    });
  });

  group('flags dialogs taps cannot drive', () {
    test('checkboxes allow several choices', () {
      final d = parseAgentDialog(
        ' Pick features\n\n ❯ [ ] Tests\n   [x] Docs\n   [ ] CI\n\n Enter to select · Esc to cancel',
        'claude',
      )!;
      expect(d.unsupported, contains('several choices'));
      expect(d.options, isEmpty);
    });
    test('tabbed multi-question dialog', () {
      final d = parseAgentDialog(
        ' ← ☐ Scope  ☐ Style  ✔ Submit →\n\n Which scope?\n\n ❯ 1. Small\n   2. Large\n\n Enter to select · Esc to cancel',
        'claude',
      )!;
      expect(d.unsupported, contains('several questions'));
    });
  });

  test('signature ignores the selector and descriptions', () {
    final a = parseAgentDialog(fixture('claude-ask-question.txt'), 'claude')!;
    final moved = parseAgentDialog(
      fixture('claude-ask-question.txt')
          .replaceFirst('❯ 1.', '  1.')
          .replaceFirst('  2. PC', '❯ 2. PC')
          .replaceFirst('never reaches the PC', 'is local'),
      'claude',
    )!;
    expect(moved.selected, 1);
    expect(moved.signature, a.signature);
  });

  test('wrapped footer is read as one', () {
    final d = parseAgentDialog(
      '❯ 1. A\n  2. B\n\n Enter to set as default · s to use this session only ·\n Esc to cancel',
      'claude',
    )!;
    expect(d.footer, contains('Esc to cancel'));
  });
}
