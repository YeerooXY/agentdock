import 'package:xterm/xterm.dart';

import 'agent_profiles.dart';

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

/// Claude draws "↓ 3." where a hidden-below hint sits beside an option. The
/// arrow is not a selector, so blank it and keep the columns.
String clearHintArrow(String line) => line.replaceFirstMapped(
  RegExp(r'^(\s*)[↑↓](\s)(?=\d{1,2}[.)]\s)'),
  (m) => '${m[1]} ${m[2]}',
);

class AgentMenu {
  final String title, footer;
  final List<String> options;
  final int selected;
  const AgentMenu(this.title, this.options, this.selected, this.footer);

  /// Labels only: descriptions and per-row extras (Claude's effort slider,
  /// "+N models") change as the selection moves.
  String get signature {
    final labels = options.map(
      (o) => o.split('\n').first.split(RegExp(r'\s{2,}')).first,
    );
    return '$title\n${labels.join('\n')}\n$footer';
  }

  bool get sessionOnly => RegExp(
    r'\bs\b.{0,18}(this session|session only|session\b)',
    caseSensitive: false,
  ).hasMatch(footer);

  /// Unknown CLI layouts stay in the terminal. Require numbered choices,
  /// a single active selector, and an Enter/Escape navigation footer.
  static AgentMenu? parse(String text, {AgentProfiles? profiles}) {
    final profile = (profiles ?? AgentProfiles.current).menu;
    final lines = text.split('\n').map(clearHintArrow).toList();
    final heading = lines.lastIndexWhere(profile.heading.hasMatch);
    if (heading < 0) return null;
    // A narrow terminal can wrap the footer, leaving "Esc" on the next row.
    final enter = RegExp(r'\benter\b', caseSensitive: false),
        esc = RegExp(r'\besc(ape)?\b', caseSensitive: false);
    final footerIndex = lines.indexWhere(
      (line) => enter.hasMatch(line),
      heading + 1,
    );
    if (footerIndex < 0) return null;
    final footerEnd = esc.hasMatch(lines[footerIndex])
        ? footerIndex
        : footerIndex + 1 < lines.length && esc.hasMatch(lines[footerIndex + 1])
        ? footerIndex + 1
        : -1;
    if (footerEnd < 0) return null;
    if (lines.skip(footerEnd + 1).any((line) => line.trim().isNotEmpty)) {
      return null;
    }
    final options = <String>[];
    final notes = <String>[];
    var selected = -1, lastNumber = 0;
    for (final line in lines.sublist(heading + 1, footerIndex)) {
      final match = profile.option.firstMatch(line);
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

/// Index of the option whose label names [value] or [name], or -1.
/// Matches the label column only: descriptions such as "Max and Ultra consume
/// usage limits faster" must not select "More reasoning…".
int menuOptionIndex(AgentMenu menu, String value, {String? name}) {
  final labels = {
    value.toLowerCase(),
    if (name != null) name.toLowerCase(),
    if (value == 'xhigh') 'extra high',
  };
  return menu.options.indexWhere((option) {
    final text = option.split(RegExp(r'\s{2,}')).first;
    return labels.any(
      (label) => RegExp(
        '(^|[^a-z0-9])${RegExp.escape(label)}(?=[^a-z0-9]|\$)',
        caseSensitive: false,
      ).hasMatch(text),
    );
  });
}

/// Codex and Claude Code both show "esc to interrupt" while a turn runs.
bool agentWorking(String screen, {AgentProfiles? profiles}) =>
    (profiles ?? AgentProfiles.current).menu.working.hasMatch(screen);

/// Box-drawing borders some Claude Code layouts put around the input.
const _borders = [0x2502, 0x2503, 0x7c];

/// ─ ━ ═ ╌ and the ASCII dash some terminals fall back to.
const _ruleChars = [0x2500, 0x2501, 0x2550, 0x254c, 0x2d];

String _stripBorders(String text) =>
    text.replaceAll(RegExp(r'^[│┃|]\s*|\s*[│┃|]$'), '').trim();

/// The input row of a Claude or Codex prompt: the cursor row, or the lowest
/// prompt row when the TUI parks its hidden cursor elsewhere.
({BufferLine row, int y})? _promptRow(Terminal terminal) {
  final buffer = terminal.buffer;
  final prompt = RegExp(r'^[›❯>](\s|$)');
  bool isPrompt(BufferLine line) =>
      prompt.hasMatch(_stripBorders(line.getText()));
  final cursor = buffer.absoluteCursorY;
  if (cursor >= 0 &&
      cursor < buffer.lines.length &&
      isPrompt(buffer.lines[cursor])) {
    return (row: buffer.lines[cursor], y: cursor);
  }
  for (var y = buffer.height - 1; y >= buffer.scrollBack; y--) {
    if (isPrompt(buffer.lines[y])) return (row: buffer.lines[y], y: y);
  }
  return null;
}

/// Placeholder hints are dimmed, themed or carry the inverse cursor cell; text
/// the user typed is drawn in the default color with none of those.
bool _typed(BufferLine row) {
  const glyphs = [0x203a, 0x276f, 0x3e];
  var x = 0;
  while (x < row.length && !glyphs.contains(row.getCodePoint(x))) {
    x++;
  }
  // A repaint can leave the rule that sat on this row after the placeholder
  // ("Try "fix lint"-----"). Trailing rule characters are not typed text.
  var end = row.length;
  while (end > x + 1) {
    final cp = row.getCodePoint(end - 1);
    if (cp == 0 || cp == 32 || _ruleChars.contains(cp)) {
      end--;
    } else {
      break;
    }
  }
  for (x++; x < end; x++) {
    final cp = row.getCodePoint(x);
    if (cp == 0 || cp == 32 || _borders.contains(cp)) continue;
    final styled =
        row.getAttributes(x) & (CellAttr.faint | CellAttr.inverse) != 0 ||
        row.getForeground(x) & CellColor.typeMask != CellColor.normal;
    if (!styled) return true;
  }
  return false;
}

bool hasEmptyAgentPrompt(
  Terminal terminal,
  String provider, {
  AgentProfiles? profiles,
}) {
  final profile = (profiles ?? AgentProfiles.current).dialogs[provider];
  if (profile == null) return false;
  final found = _promptRow(terminal);
  if (found == null) return false;
  final line = _stripBorders(found.row.getText());
  if (RegExp(r'^[›❯>]\s*$').hasMatch(line) ||
      profile.emptyPrompts.contains(line)) {
    return true;
  }
  return !_typed(found.row);
}

/// Text typed into the prompt, when it is one row. [multiline] is true when
/// more rows follow, which Paddock cannot reproduce exactly; [text] is null when
/// no prompt row is on screen.
({String? text, bool multiline}) agentPromptDraft(
  Terminal terminal,
  String provider,
) {
  final found = _promptRow(terminal);
  if (found == null || hasEmptyAgentPrompt(terminal, provider)) {
    return (text: null, multiline: false);
  }
  final buffer = terminal.buffer;
  final next = found.y + 1 < buffer.lines.length
      ? buffer.lines[found.y + 1].getText().trimRight()
      : '';
  final continues =
      next.trim().isNotEmpty &&
      next.startsWith(' ') &&
      !RegExp(r'^[─━═╌┄┈\-_]{8,}$').hasMatch(next.trim());
  final text = _stripBorders(found.row.getText())
      .replaceFirst(RegExp(r'^[›❯>]\s?'), '')
      .replaceFirst(RegExp(r'\s*[─━═╌-]{3,}$'), '');
  return (text: text, multiline: continues);
}

/// Why Apply cannot proceed, or null when the agent is ready for a command.
enum AgentBlock { working, menuOpen, noPrompt, multilineInput }

String agentBlockMessage(AgentBlock block) => switch (block) {
  AgentBlock.working => 'The agent is still working. Try again when it stops.',
  AgentBlock.menuOpen =>
    'A menu is open in the terminal. Close it, then reopen the chooser.',
  AgentBlock.noPrompt =>
    'The agent prompt is not showing. Close any dialog on the PC, then apply.',
  AgentBlock.multilineInput =>
    'The prompt holds a multi-line draft. Send or delete it, then apply.',
};
