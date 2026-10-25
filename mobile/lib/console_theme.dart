import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:xterm/xterm.dart';

enum ConsoleOpening {
  soft,
  bloom,
  neon,
  lightning,
  portal,
  implode,
  redline,
  glitch,
  frost,
  explosion,
  spectrum,
}

/// Ambient particles: stars drift, snow falls, embers rise, data rains.
enum SkyKind { stars, glitter, dust, streaks, data, snow, embers, rainbow }

/// Keyboard-style lighting, matching the desktop Appearance settings.
const lightingStyles = {
  'static': 'Static',
  'breathe': 'Breathing',
  'wave': 'Wave',
  'spectrum': 'Spectrum cycle',
  'reactive': 'Reactive',
};
const starLevels = ['Off', 'Few', 'Some', 'Many', 'Galaxy'];

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

  static const all = [
    ConsoleTheme(
      'classic',
      'Paddock',
      'Pastel glass · blooming rings',
      ConsoleOpening.bloom,
      SkyKind.stars,
      Color(0xff090b15),
      Color(0xfff0f0fb),
      Color(0xff89b4ff),
      Color(0xfff19cda),
    ),
    ConsoleTheme(
      'hot-pink',
      'Hot pink',
      'Neon tubes · hearts and glitter',
      ConsoleOpening.neon,
      SkyKind.glitter,
      Color(0xff14060f),
      Color(0xfffff0fa),
      Color(0xffff6ad5),
      Color(0xffc13cff),
    ),
    ConsoleTheme(
      'blue',
      'Blue',
      'Steel rails · lightning strike',
      ConsoleOpening.lightning,
      SkyKind.stars,
      Color(0xff060d1b),
      Color(0xffedf5ff),
      Color(0xff80c7ff),
      Color(0xff4f7bff),
    ),
    ConsoleTheme(
      'violet',
      'Violet',
      'Arcane arcs · spiral portal',
      ConsoleOpening.portal,
      SkyKind.stars,
      Color(0xff0e091b),
      Color(0xfff4edff),
      Color(0xffc7a3ff),
      Color(0xff8f5bff),
    ),
    ConsoleTheme(
      'void',
      'Void',
      'Near black · collapsing star',
      ConsoleOpening.implode,
      SkyKind.dust,
      Color(0xff020205),
      Color(0xffd9d6ea),
      Color(0xff7b6cff),
      Color(0xff35246e),
    ),
    ConsoleTheme(
      'redline',
      'Redline',
      'Black weave · red slash trim',
      ConsoleOpening.redline,
      SkyKind.dust,
      Color(0xff040404),
      Color(0xfff4f4f4),
      Color(0xffff2a3d),
      Color(0xffb0001a),
    ),
    ConsoleTheme(
      'cyber',
      'Cyber',
      'Cut corners · glyph rain',
      ConsoleOpening.glitch,
      SkyKind.data,
      Color(0xff080b17),
      Color(0xfff0f4fc),
      Color(0xff00e1ff),
      Color(0xffcc55ff),
    ),
    ConsoleTheme(
      'icy',
      'Arctic',
      'Ice facets · spreading frost',
      ConsoleOpening.frost,
      SkyKind.snow,
      Color(0xff05121e),
      Color(0xffedfaff),
      Color(0xff7fe9ff),
      Color(0xff4f9dff),
    ),
    ConsoleTheme(
      'fiery',
      'Inferno',
      'Ember glow · fireball blast',
      ConsoleOpening.explosion,
      SkyKind.embers,
      Color(0xff160906),
      Color(0xfffff2ec),
      Color(0xffff6a2b),
      Color(0xffffb700),
    ),
    ConsoleTheme(
      'gamer',
      'RGB',
      'Spectrum edge · rainbow shockwave',
      ConsoleOpening.spectrum,
      SkyKind.rainbow,
      Color(0xff090c12),
      Color(0xffffffff),
      Color(0xff73eaff),
      Color(0xffff5db4),
    ),
    ConsoleTheme(
      'normal',
      'Plain',
      'Quiet frame · soft fade',
      ConsoleOpening.soft,
      SkyKind.stars,
      Color(0xff090b10),
      Color(0xffe7ebf2),
      Color(0xffb9c6d8),
      Color(0xff8392a8),
    ),
  ];
  static ConsoleTheme named(String id) =>
      all.where((theme) => theme.id == id).firstOrNull ?? all[0];
  bool get chamfered =>
      ['cyber', 'icy', 'fiery', 'gamer', 'redline'].contains(id);
  // Redline keeps a solid black console: red only on the trim.
  bool get solid => id == 'redline';
  bool get plain => id == 'normal';

  static final _terminals = <String, TerminalTheme>{};
  TerminalTheme get terminal => _terminals.putIfAbsent(id, _terminal);
  TerminalTheme _terminal() => TerminalTheme(
    background: background,
    foreground: foreground,
    cursor: id == 'fiery' || id == 'classic' ? secondary : primary,
    selection: primary.withValues(alpha: .3),
    black: const Color(0xff1b2126),
    red: const Color(0xffef8a86),
    green: const Color(0xffb9e888),
    yellow: const Color(0xffe8c57e),
    blue: const Color(0xff8daef2),
    magenta: const Color(0xffc0a2f5),
    cyan: const Color(0xff89ccc4),
    white: const Color(0xffe1e8e3),
    brightBlack: const Color(0xff9da9be),
    brightRed: const Color(0xffffa1b0),
    brightGreen: const Color(0xffa2f5c5),
    brightYellow: const Color(0xffffe6a3),
    brightBlue: const Color(0xffb0ceff),
    brightMagenta: const Color(0xffedc4ff),
    brightCyan: const Color(0xffaff5ff),
    brightWhite: Colors.white,
    searchHitBackground: const Color(0xff51436c),
    searchHitBackgroundCurrent: const Color(0xff685383),
    searchHitForeground: Colors.white,
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
