import 'dart:convert';

import 'generated/theme_data.dart' as data;
import 'generated/theme_data.dart' show ConsoleOpening, SkyKind;
export 'generated/theme_data.dart' show ConsoleOpening, SkyKind;

import 'package:flutter/material.dart';
import 'package:xterm/xterm.dart';

/// Keyboard-style lighting, matching the desktop Appearance settings.
const lightingStyles = data.lightingStyles;
const starLevels = data.starLevels;

/// Shares stable IDs and terminal palettes with src/console-themes.js. One
/// theme colors the whole phone app as well as the console.
class ConsoleTheme {
  final String id, label, effect;
  final ConsoleOpening opening;
  final SkyKind sky;
  final Color background, foreground, primary, secondary;
  const ConsoleTheme(
    this.id,
    this.label,
    this.effect,
    this.opening,
    this.sky,
    this.background,
    this.foreground,
    this.primary,
    this.secondary,
  );

  static final all = List<ConsoleTheme>.unmodifiable(
    data.themeData.map(
      (entry) => ConsoleTheme(
        entry['id']!,
        entry['label']!,
        entry['detail']!,
        ConsoleOpening.values.byName(entry['opening']!),
        SkyKind.values.byName(entry['sky']!),
        _color(entry['background']!),
        _color(entry['foreground']!),
        _color(entry['a']!),
        _color(entry['b']!),
      ),
    ),
  );
  static ConsoleTheme named(String id) =>
      all.where((theme) => theme.id == id).firstOrNull ??
      all.firstWhere((theme) => theme.id == 'classic');
  bool get chamfered =>
      ['cyber', 'icy', 'fiery', 'gamer', 'redline'].contains(id);
  // Redline keeps a solid black console: red only on the trim.
  bool get solid => id == 'redline';
  bool get plain => id == 'normal';

  static Color _color(String hex) {
    final rgba = int.parse(hex.substring(1), radix: 16);
    return Color(
      hex.length == 9 ? ((rgba & 0xff) << 24) | (rgba >> 8) : rgba | 0xff000000,
    );
  }

  static final _cursorRoles = data.mobileThemeOverrides['cursor'] as Map;
  static final _selection = data.mobileThemeOverrides['selection'] as Map;
  static final _search = data.mobileThemeOverrides['search'] as Map;
  Color _role(Object? role) => role == 'secondary' ? secondary : primary;

  static final _terminals = <String, TerminalTheme>{};
  TerminalTheme get terminal => _terminals.putIfAbsent(id, _terminal);
  TerminalTheme _terminal() => TerminalTheme(
    background: background,
    foreground: foreground,
    cursor: _role(_cursorRoles[id] ?? _cursorRoles['default']),
    selection: _role(_selection['source'])
        .withValues(alpha: (_selection['alpha'] as num).toDouble()),
    black: _color(data.ansiPalette['black']!),
    red: _color(data.ansiPalette['red']!),
    green: _color(data.ansiPalette['green']!),
    yellow: _color(data.ansiPalette['yellow']!),
    blue: _color(data.ansiPalette['blue']!),
    magenta: _color(data.ansiPalette['magenta']!),
    cyan: _color(data.ansiPalette['cyan']!),
    white: _color(data.ansiPalette['white']!),
    brightBlack: _color(data.ansiPalette['brightBlack']!),
    brightRed: _color(data.ansiPalette['brightRed']!),
    brightGreen: _color(data.ansiPalette['brightGreen']!),
    brightYellow: _color(data.ansiPalette['brightYellow']!),
    brightBlue: _color(data.ansiPalette['brightBlue']!),
    brightMagenta: _color(data.ansiPalette['brightMagenta']!),
    brightCyan: _color(data.ansiPalette['brightCyan']!),
    brightWhite: _color(data.ansiPalette['brightWhite']!),
    searchHitBackground: _color(_search['hitBackground'] as String),
    searchHitBackgroundCurrent: _color(
      _search['hitBackgroundCurrent'] as String,
    ),
    searchHitForeground: _color(_search['hitForeground'] as String),
  );
}

/// Phone-only preferences. No PC settings or terminal state are changed.
class ConsoleAppearance {
  final String themeId, lighting, lightingSpeed;
  final int starLevel;
  final bool ambientMotion, openingAnimations, textures;
  const ConsoleAppearance({
    this.themeId = 'classic',
    this.starLevel = 2,
    this.lighting = 'static',
    this.lightingSpeed = 'normal',
    this.ambientMotion = true,
    this.openingAnimations = true,
    this.textures = true,
  });
  ConsoleTheme get theme => ConsoleTheme.named(themeId);
  bool get stars => starLevel > 0;
  double get speed => switch (lightingSpeed) {
    'slow' => 1.8,
    'fast' => .5,
    _ => 1,
  };
  ConsoleAppearance copyWith({
    String? themeId,
    int? starLevel,
    String? lighting,
    String? lightingSpeed,
    bool? ambientMotion,
    bool? openingAnimations,
    bool? textures,
  }) => ConsoleAppearance(
    themeId: ConsoleTheme.named(themeId ?? this.themeId).id,
    starLevel: (starLevel ?? this.starLevel).clamp(0, 4),
    lighting: lightingStyles.containsKey(lighting) ? lighting! : this.lighting,
    lightingSpeed: ['slow', 'normal', 'fast'].contains(lightingSpeed)
        ? lightingSpeed!
        : this.lightingSpeed,
    ambientMotion: ambientMotion ?? this.ambientMotion,
    openingAnimations: openingAnimations ?? this.openingAnimations,
    textures: textures ?? this.textures,
  );
  String encode() => jsonEncode({
    'theme': theme.id,
    'starLevel': starLevel,
    'lighting': lighting,
    'lightingSpeed': lightingSpeed,
    'ambientMotion': ambientMotion,
    'openingAnimations': openingAnimations,
    'textures': textures,
  });
  static ConsoleAppearance decode(String? value) {
    try {
      final data = jsonDecode(value ?? '{}');
      if (data is! Map) return const ConsoleAppearance();
      final level = data['starLevel'];
      return ConsoleAppearance(
        themeId: ConsoleTheme.named(
          data['theme'] is String ? data['theme'] : '',
        ).id,
        // Older saves stored stars as on/off.
        starLevel: level is int && level >= 0 && level <= 4
            ? level
            : data['stars'] == false
            ? 0
            : 2,
        lighting: lightingStyles.containsKey(data['lighting'])
            ? data['lighting']
            : 'static',
        lightingSpeed:
            ['slow', 'normal', 'fast'].contains(data['lightingSpeed'])
            ? data['lightingSpeed']
            : 'normal',
        ambientMotion: data['ambientMotion'] is bool
            ? data['ambientMotion']
            : true,
        openingAnimations: data['openingAnimations'] is bool
            ? data['openingAnimations']
            : true,
        textures: data['textures'] is bool ? data['textures'] : true,
      );
    } on FormatException {
      return const ConsoleAppearance();
    }
  }
}

class ConsoleAppearanceStore {
  final Future<String?> Function() read;
  final Future<void> Function(String) write;
  ConsoleAppearanceStore({required this.read, required this.write});
  Future<ConsoleAppearance> load() async =>
      ConsoleAppearance.decode(await read());
  Future<void> save(ConsoleAppearance value) => write(value.encode());
}
