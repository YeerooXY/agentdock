import 'dart:convert';
import 'dart:io';

import 'package:agent_dock_mobile/agent_dialog.dart';
import 'package:agent_dock_mobile/agent_menu.dart';
import 'package:agent_dock_mobile/agent_profiles.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xterm/xterm.dart';

/// Produced by electron/providers and checked by tests/provider-runtime.test.cjs.
final recorded = jsonDecode(
  File('../tests/fixtures/state/dto/phone-agent-profiles.json')
      .readAsStringSync(),
) as Map<String, dynamic>;

Map<String, dynamic> served() =>
    jsonDecode(jsonEncode(recorded['output'])) as Map<String, dynamic>;

String screen(String name) => File('test/fixtures/$name').readAsStringSync();

Terminal prompt(String text) => Terminal()
  ..resize(80, 20)
  ..write(text);

void main() {
  tearDown(() => AgentProfiles.apply(null));

  test(
    'console flags use served facts with a generated fallback for older PCs',
    () {
      expect(
        AgentProfiles.consoleFeaturesFor({'id': 'codex'})['modelChoices'],
        true,
      );
      expect(AgentProfiles.consoleFeaturesFor({'id': 'unknown'}), isEmpty);
      expect(
        AgentProfiles.consoleFeaturesFor({
          'id': 'codex',
          'consoleFeatures': {'modelChoices': false},
        })['modelChoices'],
        false,
      );
      expect(
        AgentProfiles.consoleFeaturesFor({
          'id': 'future',
          'consoleFeatures': {'modelChoices': true, 'permissions': 'yes'},
        }),
        {'modelChoices': true},
      );
    },
  );

  test('the served DTO reads every recorded screen', () {
    final profiles = AgentProfiles.parse(served())!;
    for (final item in (recorded['screens'] as List).cast<Map>()) {
      final file = item['file'] as String,
          provider = item['provider'] as String;
      final dialog = parseAgentDialog(
        screen(file),
        provider,
        profiles: profiles,
      )!;
      expect(dialog.options.map((o) => o.label), item['options'], reason: file);
      expect(dialog.selected, item['selected'], reason: file);
      if (item['menu'] != true) continue;
      final menu = AgentMenu.parse(screen(file), profiles: profiles)!;
      expect(menu.selected, item['selected'], reason: file);
    }
  });

  test('the generated fallback equals the served DTO on recorded screens', () {
    final profiles = AgentProfiles.parse(served())!;
    expect(
      AgentProfiles.bundled.dialogs.keys.toSet(),
      profiles.dialogs.keys.toSet(),
    );
    for (final item in (recorded['screens'] as List).cast<Map>()) {
      final file = item['file'] as String,
          provider = item['provider'] as String;
      expect(
        parseAgentDialog(screen(file), provider)!.signature,
        parseAgentDialog(screen(file), provider, profiles: profiles)!.signature,
      );
    }
  });

  test('terminal-only and unknown providers keep their safe behavior', () {
    final profiles = AgentProfiles.parse(served())!;
    const dialog = '› 1. A\n  2. B\n\nenter select · esc back';
    for (final provider in ['grok', 'shell', 'custom', 'strata', 'gemini']) {
      expect(parseAgentDialog(dialog, provider, profiles: profiles), isNull);
      expect(
        hasEmptyAgentPrompt(prompt('› '), provider, profiles: profiles),
        isFalse,
      );
    }
    final future = served();
    future['providers']['codex']['support'] = 'future-mode';
    expect(
      parseAgentDialog(dialog, 'codex', profiles: AgentProfiles.parse(future)),
      isNull,
    );
  });

  test('empty prompts and selectors come from the provider profile', () {
    final profiles = AgentProfiles.parse(served())!;
    const hint = '› Ask Codex to do anything';
    expect(
      hasEmptyAgentPrompt(prompt(hint), 'codex', profiles: profiles),
      isTrue,
    );
    expect(
      hasEmptyAgentPrompt(prompt(hint), 'claude', profiles: profiles),
      isFalse,
    );
    final changed = served();
    changed['providers']['codex']['emptyPrompts'] = <String>[];
    expect(
      hasEmptyAgentPrompt(
        prompt(hint),
        'codex',
        profiles: AgentProfiles.parse(changed),
      ),
      isFalse,
    );
    changed['providers']['codex']['selectors'] = ['»'];
    expect(
      parseAgentDialog(
        '» 1. A\n  2. B\n\nenter select · esc back',
        'codex',
        profiles: AgentProfiles.parse(changed),
      )!.selected,
      0,
    );
  });

  test('unusable profiles are refused as a whole', () {
    void refuse(void Function(Map<String, dynamic> dto) change) {
      final dto = served();
      change(dto);
      expect(AgentProfiles.parse(dto), isNull);
    }

    expect(AgentProfiles.parse(null), isNull);
    expect(AgentProfiles.parse('profiles'), isNull);
    refuse((d) => d['version'] = agentProfileVersion + 1);
    refuse((d) => d.remove('menu'));
    refuse((d) => d['menu']['heading'] = '(');
    refuse((d) => d['menu']['heading'] = 'x' * 241);
    refuse((d) => d['menu']['option'] = r'^(\d+)$');
    refuse((d) => d['providers'] = []);
    refuse((d) => d['providers']['codex']['selectors'] = ['ab']);
    refuse((d) => d['providers']['codex']['selectors'] = []);
    refuse((d) => d['providers']['codex']['banner'] = '[');
    refuse((d) => d['providers']['codex'].remove('emptyPrompts'));
  });

  test('apply installs served profiles and falls back for older PCs', () {
    final changed = served();
    changed['providers']['codex']['selectors'] = ['»'];
    const custom = '» 1. A\n  2. B\n\nenter select · esc back';
    AgentProfiles.apply(changed);
    expect(activeAgentDialog(custom, 'codex'), isNotNull);
    expect(agentDialogProfiles['codex']!.selectors, {'»'});

    final broken = served()..['version'] = 99;
    AgentProfiles.apply(broken);
    expect(identical(AgentProfiles.current, AgentProfiles.bundled), isTrue);
    expect(activeAgentDialog(custom, 'codex'), isNull);

    AgentProfiles.apply(changed);
    AgentProfiles.apply(null);
    expect(identical(AgentProfiles.current, AgentProfiles.bundled), isTrue);
  });

  test('menu selection and working state follow the menu profile', () {
    final profiles = AgentProfiles.parse(served())!;
    final menu = AgentMenu.parse(
      screen('codex-model-menu.txt'),
      profiles: profiles,
    )!;
    expect(menuOptionIndex(menu, 'gpt-6-sol'), 3);
    expect(agentWorking('Esc to interrupt', profiles: profiles), isTrue);
    final changed = served();
    changed['menu']['working'] = 'press stop';
    expect(
      agentWorking('press STOP', profiles: AgentProfiles.parse(changed)),
      isTrue,
    );
  });
}
