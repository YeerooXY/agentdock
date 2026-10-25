import 'dart:math';

import 'package:flutter/material.dart';
import 'package:xterm/xterm.dart';

const ruleWidth = 12;
final _rule = RegExp(r'^[─━═╌┄┈\-_╭╮╰╯┌┐└┘├┤┬┴┼]{8,}$');

/// A line drawn only with horizontal box or dash characters, no text.
bool terminalRule(String line) => _rule.hasMatch(line.trim());

/// Read the parsed cells so escape sequences, links and controls never become
/// markup. Group adjacent equal styles rather than allocating a span per cell.
TextSpan terminalReadingSpan(Terminal terminal, TerminalTheme theme) {
  final palette = [
    theme.black,
    theme.red,
    theme.green,
    theme.yellow,
    theme.blue,
    theme.magenta,
    theme.cyan,
    theme.white,
    theme.brightBlack,
    theme.brightRed,
    theme.brightGreen,
    theme.brightYellow,
    theme.brightBlue,
    theme.brightMagenta,
    theme.brightCyan,
    theme.brightWhite,
  ];
  Color color(int encoded, Color fallback) {
    final type = encoded & CellColor.typeMask,
        value = encoded & CellColor.valueMask;
    if (type == CellColor.normal) return fallback;
    if (type == CellColor.rgb) return Color(0xff000000 | value);
    if (value < 16) return palette[value];
    if (value < 232) {
      final n = value - 16;
      int channel(int x) => x == 0 ? 0 : 55 + x * 40;
      return Color.fromARGB(
        255,
        channel(n ~/ 36),
        channel(n ~/ 6 % 6),
        channel(n % 6),
      );
    }
    final grey = (8 + (value - 232) * 10).clamp(0, 255);
    return Color.fromARGB(255, grey, grey, grey);
  }

  final spans = <TextSpan>[];
  var text = StringBuffer();
  TextStyle? style;
  int? previousForeground, previousBackground, previousFlags;
  void flush() {
    if (text.isNotEmpty) {
      spans.add(TextSpan(text: text.toString(), style: style));
    }
    text = StringBuffer();
  }

  final lines = terminal.buffer.lines;
  var previousRule = false;
  for (var y = 0; y < lines.length; y++) {
    final line = lines[y];
    // Full-width rules wrap into several rows on a phone; show one short rule.
    final rule = !line.isWrapped && terminalRule(line.getText());
    if (rule && previousRule) continue;
    previousRule = rule;
    if (y > 0 && !line.isWrapped) text.write('\n');
    var end = line.length;
    if (rule) {
      var start = 0;
      while (start < end && const [0, 32].contains(line.getCodePoint(start))) {
        start++;
      }
      end = min(end, start + ruleWidth);
    }
    for (var x = 0; x < end; x++) {
      final cp = line.getCodePoint(x);
      if (cp == 0) continue;
      final flags = line.getAttributes(x);
      final foreground = line.getForeground(x),
          background = line.getBackground(x);
      if (foreground != previousForeground ||
          background != previousBackground ||
          flags != previousFlags) {
        previousForeground = foreground;
        previousBackground = background;
        previousFlags = flags;
        var fg = color(foreground, theme.foreground);
        var bg = color(background, theme.background);
        if (flags & CellAttr.inverse != 0) {
          (fg, bg) = (bg, fg);
        } else if (background & CellColor.typeMask == CellColor.normal) {
          // Only the default background is transparent. Explicit ANSI fills
          // and inverse video remain opaque and readable over the effects.
          bg = Colors.transparent;
        }
        if (flags & CellAttr.faint != 0) fg = fg.withValues(alpha: .65);
        final next = TextStyle(
          color: fg,
          backgroundColor: bg,
          fontWeight: flags & CellAttr.bold != 0
              ? FontWeight.bold
              : FontWeight.normal,
          fontStyle: flags & CellAttr.italic != 0
              ? FontStyle.italic
              : FontStyle.normal,
          decoration: TextDecoration.combine([
            if (flags & CellAttr.underline != 0) TextDecoration.underline,
            if (flags & CellAttr.strikethrough != 0) TextDecoration.lineThrough,
          ]),
        );
        if (style != next) {
          flush();
          style = next;
        }
      }
      text.write(
        flags & CellAttr.invisible != 0 ? ' ' : String.fromCharCode(cp),
      );
    }
  }
  flush();
  while (spans.isNotEmpty) {
    final last = spans.removeLast(), trimmed = last.text!.trimRight();
    if (trimmed.isNotEmpty) {
      spans.add(TextSpan(text: trimmed, style: last.style));
      break;
    }
  }
  return TextSpan(
    children: spans.isEmpty ? [const TextSpan(text: ' ')] : spans,
  );
}
