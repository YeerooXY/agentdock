import 'package:xterm/xterm.dart';

/// Only the viewport can represent a live menu. Never replay scrollback controls.
String activeTerminalText(Terminal terminal) {
  final buffer = terminal.buffer;
  final text = StringBuffer();
  for (var i = buffer.scrollBack; i < buffer.height; i++) {
    final line = buffer.lines[i];
    if (i > buffer.scrollBack && !line.isWrapped) text.write('\n');
    text.write(line.getText());
  }
  return text.toString().trimRight();
}

class AgentMenu {
  final String title, footer;
  final List<String> options;
  final int selected;
  const AgentMenu(this.title, this.options, this.selected, this.footer);
  String get signature => '$title\n${options.join('\n')}\n$footer';
  bool get sessionOnly => RegExp(
    r'\bs\b.{0,18}(this session|session only|session\b)',
    caseSensitive: false,
  ).hasMatch(footer);

  /// Unknown CLI layouts stay in the terminal. Require numbered choices,
  /// a single active selector, and an Enter/Escape navigation footer.
  static AgentMenu? parse(String text) {
    final lines = text.split('\n');
    final heading = lines.lastIndexWhere(
      (line) => RegExp(
        r'^\s*((Select|Choose|Set)\s+(a\s+)?(model|reasoning|effort)\b|Advanced Reasoning\b)',
        caseSensitive: false,
      ).hasMatch(line),
    );
    if (heading < 0) return null;
    final footerIndex = lines.indexWhere(
      (line) =>
          RegExp(r'\benter\b', caseSensitive: false).hasMatch(line) &&
          RegExp(r'\besc(ape)?\b', caseSensitive: false).hasMatch(line),
      heading + 1,
    );
    if (footerIndex < 0) return null;
    if (lines.skip(footerIndex + 1).any((line) => line.trim().isNotEmpty)) {
      return null;
    }
    final options = <String>[];
    final notes = <String>[];
    var selected = -1, lastNumber = 0;
    for (final line in lines.sublist(heading + 1, footerIndex)) {
      final match = RegExp(r'^\s*([›❯>→])?\s*(\d{1,2})[.)]\s+(.+?)\s*$')
          .firstMatch(line);
      if (match == null) {
        if (options.isNotEmpty && line.trim().isNotEmpty) {
          options[options.length - 1] += '\n${line.trim()}';
        } else if (line.trim().isNotEmpty) {
          notes.add(line.trim());
        }
        continue;
      }
      final number = int.parse(match[2]!);
      if (lastNumber != 0 && number != lastNumber + 1) return null;
      lastNumber = number;
      if (match[1] != null) {
        if (selected != -1) return null;
        selected = options.length;
      }
      options.add(match[3]!);
    }
    if (selected < 0 || options.isEmpty || options.length > 30) return null;
    return AgentMenu(
      lines[heading].trim(),
      List.unmodifiable(options),
      selected,
      [...notes, ...lines.sublist(footerIndex)].join('\n').trim(),
    );
  }
}

bool hasEmptyAgentPrompt(Terminal terminal, String provider) {
  if (!['codex', 'claude'].contains(provider)) return false;
  final line = terminal.buffer.lines[terminal.buffer.absoluteCursorY]
      .getText()
      .trim();
  return RegExp(r'^[›❯>]\s*$').hasMatch(line) ||
      (provider == 'codex' && line == '› Ask Codex to do anything');
}
