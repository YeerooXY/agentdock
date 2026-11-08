import 'dart:convert';

import 'agent_profile_data.dart';

/// The profile format this phone reads. Any other version uses [AgentProfiles.bundled].
const agentProfileVersion = 1;

const _maxPattern = 240;

/// What one CLI draws, so another provider adds an entry rather than a branch.
class AgentDialogProfile {
  final Set<String> selectors;

  /// The CLI's start-up banner, which is never part of a dialog's question.
  final RegExp banner;

  /// Placeholder rows that mean the prompt holds no typed text.
  final Set<String> emptyPrompts;
  const AgentDialogProfile(
    this.selectors,
    this.banner, {
    this.emptyPrompts = const {},
  });
}

/// How a CLI's numbered model and effort menus look.
class AgentMenuProfile {
  final RegExp heading, option, working;
  const AgentMenuProfile(this.heading, this.option, this.working);
}

/// Screen profiles from electron/providers/screen-profiles.cjs. A provider
/// without a dialog entry stays in the terminal.
class AgentProfiles {
  final AgentMenuProfile menu;
  final Map<String, AgentDialogProfile> dialogs;
  const AgentProfiles(this.menu, this.dialogs);

  /// Generated with the app, so parsing it must always succeed.
  static final AgentProfiles bundled = parse(jsonDecode(agentProfilesJson))!;
  static AgentProfiles? _served;

  static AgentProfiles get current => _served ?? bundled;
  static final _bundledConsoleFeatures = jsonDecode(consoleFeaturesJson) as Map;

  /// Older PCs omit these facts. Explicit served flags always take precedence.
  static Map<String, dynamic> consoleFeaturesFor(Map<String, dynamic> agent) {
    final raw =
        agent['consoleFeatures'] ?? _bundledConsoleFeatures[agent['id']];
    return raw is Map
        ? {
            for (final entry in raw.entries)
              if (entry.key is String && entry.value is bool)
                entry.key as String: entry.value,
          }
        : const {};
  }

  /// Installs what the PC serves. A missing or unusable value, including one
  /// from an older PC, returns to the bundled profiles.
  static void apply(Object? dto) => _served = parse(dto);

  /// Reads one DTO, or null unless all of it can be trusted to parse screens.
  static AgentProfiles? parse(Object? dto) {
    if (dto is! Map || dto['version'] != agentProfileVersion) return null;
    final menu = dto['menu'], providers = dto['providers'];
    if (menu is! Map || providers is! Map) return null;
    try {
      final option = _pattern(menu['option']);
      final parsedMenu = AgentMenuProfile(
        _pattern(menu['heading'], caseSensitive: false),
        option,
        _pattern(menu['working'], caseSensitive: false),
      );
      // The menu parser reads the selector, number and label groups.
      final probe = option.firstMatch('› 1. Probe');
      if (probe == null ||
          probe.groupCount != 3 ||
          probe[2] != '1' ||
          probe[3] != 'Probe') {
        return null;
      }
      final dialogs = <String, AgentDialogProfile>{};
      for (final entry in providers.entries) {
        final key = entry.key, value = entry.value;
        if (key is! String || value is! Map) return null;
        // Unknown support levels are treated as terminal-only.
        if (value['support'] != 'dialog') continue;
        dialogs[key] = _dialog(value);
      }
      return AgentProfiles(parsedMenu, Map.unmodifiable(dialogs));
    } on FormatException {
      return null;
    }
  }

  static AgentDialogProfile _dialog(Map value) {
    final selectors = value['selectors'], prompts = value['emptyPrompts'];
    if (selectors is! List ||
        selectors.isEmpty ||
        !selectors.every((s) => s is String && s.length == 1) ||
        prompts is! List ||
        !prompts.every((s) => s is String && s.isNotEmpty)) {
      throw const FormatException('Invalid dialog profile.');
    }
    return AgentDialogProfile(
      Set.unmodifiable(selectors.cast<String>()),
      _pattern(value['banner']),
      emptyPrompts: Set.unmodifiable(prompts.cast<String>()),
    );
  }

  static RegExp _pattern(Object? value, {bool caseSensitive = true}) {
    if (value is! String || value.isEmpty || value.length > _maxPattern) {
      throw const FormatException('Invalid profile pattern.');
    }
    return RegExp(value, caseSensitive: caseSensitive);
  }
}
