import '../../console_theme.dart';

Duration openingDuration(ConsoleOpening opening) => Duration(
  milliseconds: switch (opening) {
    ConsoleOpening.soft => 380,
    ConsoleOpening.explosion => 1600,
    ConsoleOpening.frost || ConsoleOpening.implode => 1500,
    ConsoleOpening.portal ||
    ConsoleOpening.neon ||
    ConsoleOpening.spectrum => 1400,
    ConsoleOpening.glitch => 1200,
    _ => 1100,
  },
);
