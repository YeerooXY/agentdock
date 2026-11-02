/// A choice dialog drawn by a CLI: its options and the active selection.
///
/// Parsing is structural and per provider. A screen counts only when exactly
/// one option carries the selector, the options share one text column, and an
/// Esc footer closes the screen. Anything else stays in the terminal.
class AgentDialogOption {
  /// Label with its number, selector and check mark removed.
  final String label;

  /// Wrapped description rows beneath the label.
  final String detail;

  /// The CLI's own option number, when it numbers options.
  final int? number;

  /// Choosing this row starts free typing, so Paddock only moves to it.
  final bool needsText;
  const AgentDialogOption(
    this.label, {
    this.detail = '',
    this.number,
    this.needsText = false,
  });
}

class AgentDialog {
  final String title;
  final List<AgentDialogOption> options;
  final int selected;
  final String footer;

  /// Null when taps can drive the dialog; otherwise why they cannot.
  final String? unsupported;
  const AgentDialog(
    this.title,
    this.options,
    this.selected,
    this.footer, {
    this.unsupported,
  });

  /// Title and labels only. The selector, descriptions and previews change as
  /// the selection moves.
  String get signature =>
      '$title\n${options.map((o) => '${o.number ?? ''}${o.label}').join('\n')}';
}

/// What one CLI draws, so another provider adds an entry rather than a branch.
class AgentDialogProfile {
  final Set<String> selectors;

  /// The CLI's start-up banner, which is never part of a dialog's question.
  final RegExp banner;
  const AgentDialogProfile(this.selectors, this.banner);
}

final agentDialogProfiles = <String, AgentDialogProfile>{
  'claude': AgentDialogProfile({'❯'}, RegExp(r'Claude Code v|^[▐▛▜▝▘█▀▌ ]+$')),
  'codex': AgentDialogProfile({'›'}, RegExp(r'^>_ OpenAI Codex')),
};

final _rule = RegExp(r'^[\s─━═╌┄┈\-_▔▁]{8,}$');
final _numbered = RegExp(r'^(\d{1,2})[.)]\s+(.*)$');
final _checkbox = RegExp(r'^(\[[ xX✓✔]\]|[☐☑☒◯◉○●])\s');
final _freeText = RegExp(
  r'^(type something|type your|other\b|enter (a|your)\b|write (a|your)\b)',
  caseSensitive: false,
);
final _scrollHint = RegExp(r'^[↑↓]\s*\d+ more');
final _escWord = RegExp(r'\besc(ape)?\b', caseSensitive: false);

/// Reads [screen] (the viewport text) for [provider]'s dialog, or null.
AgentDialog? parseAgentDialog(String screen, String provider) {
  final profile = agentDialogProfiles[provider];
  if (profile == null) return null;
  final lines = screen.split('\n').map((l) => l.trimRight()).toList();
  var last = lines.length - 1;
  while (last >= 0 && lines[last].trim().isEmpty) {
    last--;
  }
  if (last < 0 ||
      !_escWord.hasMatch(lines[last]) ||
      RegExp(r'interrupt', caseSensitive: false).hasMatch(lines[last])) {
    return null;
  }
  // A narrow terminal wraps the footer; rows ending in a separator continue it.
  var footerStart = last;
  while (footerStart > 0 &&
      RegExp(r'[·|,]$').hasMatch(lines[footerStart - 1]) &&
      lines[footerStart - 1].trim().isNotEmpty) {
    footerStart--;
  }
  final footer = lines
      .sublist(footerStart, last + 1)
      .map((l) => l.trim())
      .join(' ');

  int indent(String line) => line.length - line.trimLeft().length;
  String stripSelector(String line) {
    final t = line.trimLeft();
    return profile.selectors.contains(t.isEmpty ? '' : t[0])
        ? t.substring(1).trimLeft()
        : t;
  }

  // The single selected row above the footer.
  var selectedRow = -1;
  for (var i = footerStart - 1; i >= 0; i--) {
    final t = lines[i].trimLeft();
    if (t.length > 1 && profile.selectors.contains(t[0]) && t[1] == ' ') {
      if (selectedRow != -1) return null;
      selectedRow = i;
    }
  }
  if (selectedRow < 0) return null;

  // Option text starts one selector width after the marker, past any check.
  final markerCol = indent(lines[selectedRow]);
  final afterMarker = lines[selectedRow].substring(markerCol + 1);
  final textCol =
      markerCol + 1 + (afterMarker.length - afterMarker.trimLeft().length);
  final markedBody = stripSelector(lines[selectedRow]);
  final markedChecked = markedBody.startsWith('✔');
  final checkWidth = markedChecked ? 2 : 0;

  // Unselected rows align with the marked row's label, which sits after any
  // check mark: "❯ ✔ Dark mode" aligns with "    Light mode".
  final labelCol = textCol + checkWidth;
  final numbered = _numbered.hasMatch(
    markedBody.replaceFirst(RegExp(r'^✔\s*'), ''),
  );

  bool optionStart(String line) {
    final t = line.trim();
    if (t.isEmpty || _scrollHint.hasMatch(t)) return false;
    // The current choice, when not selected, carries its check mark two
    // columns left of where labels start ("  ✔ Dark mode" above "❯   Light").
    if (t.startsWith('✔') && indent(line) + 2 == labelCol) return !numbered;
    if (indent(line) != labelCol) return false;
    return !numbered || _numbered.hasMatch(t);
  }

  // Extend to the first and last option; descriptions are deeper rows, and
  // blank rows or rules may sit between groups (Claude's "Chat about this").
  var first = selectedRow, end = selectedRow;
  for (var i = selectedRow - 1; i >= 0; i--) {
    final line = lines[i];
    if (line.trim().isEmpty || _rule.hasMatch(line.trim())) {
      continue;
    }
    if (optionStart(line)) {
      first = i;
    } else if (indent(line) > labelCol) {
      continue;
    } else {
      break;
    }
  }
  for (var i = selectedRow + 1; i < footerStart; i++) {
    final line = lines[i];
    if (line.trim().isEmpty || _rule.hasMatch(line.trim())) continue;
    if (optionStart(line)) {
      end = i;
    } else if (indent(line) > labelCol) {
      // A description belongs to the option above it, even the last one.
      end = i;
    } else {
      break;
    }
  }

  final options = <AgentDialogOption>[];
  var selected = -1, lastNumber = 0;
  for (var i = first; i <= end; i++) {
    final raw = lines[i];
    final line = raw.trim();
    if (line.isEmpty || _rule.hasMatch(line)) continue;
    final starts = i == selectedRow || optionStart(raw);
    if (!starts) {
      if (options.isEmpty) continue;
      final last = options.last;
      options[options.length - 1] = AgentDialogOption(
        last.label,
        detail: [last.detail, line].where((s) => s.isNotEmpty).join(' '),
        number: last.number,
        needsText: last.needsText,
      );
      continue;
    }
    var body = i == selectedRow ? markedBody : line;
    body = body.replaceFirst(RegExp(r'^✔\s*'), '');
    int? number;
    final m = _numbered.firstMatch(body);
    if (m != null) {
      number = int.parse(m[1]!);
      if (number <= lastNumber) return null;
      lastNumber = number;
      body = m[2]!;
    } else if (numbered) {
      return null;
    }
    if (_checkbox.hasMatch(body)) {
      return AgentDialog(
        _title(lines, first, profile),
        const [],
        0,
        footer,
        unsupported: 'This dialog allows several choices. Use Terminal keys.',
      );
    }
    // Columns after two or more spaces hold a description, as in /model.
    final parts = body.split(RegExp(r'\s{2,}'));
    final label = parts.first.replaceFirst(RegExp(r'\s*✔$'), '').trim();
    final inline = parts.skip(1).join(' ').trim();
    if (i == selectedRow) selected = options.length;
    options.add(
      AgentDialogOption(
        label,
        detail: inline,
        number: number,
        needsText: _freeText.hasMatch(label),
      ),
    );
  }
  if (selected < 0 || options.length < 2 || options.length > 30) return null;
  final title = _title(lines, first, profile);
  String? unsupported;
  // Several questions share one dialog behind a tab row.
  final above = lines.sublist(0, first).reversed.take(8).join('\n');
  if (RegExp(r'[☐☑☒].*(Submit|☐|☑)|←.*→').hasMatch(above)) {
    unsupported = 'This dialog has several questions. Use Terminal keys.';
  }
  return AgentDialog(
    title,
    options,
    selected,
    footer,
    unsupported: unsupported,
  );
}

/// The question above the options: up to three paragraphs, nearest last,
/// stopping at a rule or the CLI's banner.
String _title(List<String> lines, int first, AgentDialogProfile profile) {
  final nearest = <String>[]; // nearest paragraph first
  var current = <String>[];
  void flush() {
    if (current.isNotEmpty) nearest.add(current.join(' '));
    current = [];
  }

  for (var i = first - 1; i >= 0 && nearest.length < 3; i--) {
    final t = lines[i].trim();
    if (t.isEmpty) {
      flush();
    } else if (_rule.hasMatch(t) ||
        RegExp(r'^[▔▁]+$').hasMatch(t) ||
        profile.banner.hasMatch(t)) {
      current = [];
      break;
    } else {
      current.insert(0, t);
    }
  }
  flush();
  final text = nearest.reversed.join(' ');
  return text.length > 400 ? '${text.substring(0, 399)}…' : text;
}

/// Whether [terminalText] holds a dialog Paddock can drive for [provider].
AgentDialog? activeAgentDialog(String terminalText, String provider) {
  return parseAgentDialog(terminalText, provider);
}
