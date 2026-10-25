class AgentSelection {
  final String? model, effort;
  final int at;
  const AgentSelection({this.model, this.effort, this.at = 0});
  factory AgentSelection.fromSession(Map session) => AgentSelection(
    model: session['model'] as String?,
    effort: session['effort'] as String?,
    at: (session['settingsAt'] as num?)?.toInt() ?? 0,
  );
}

String effortLabel(String value) => value == 'xhigh'
    ? 'Extra high'
    : value.isEmpty
    ? value
    : '${value[0].toUpperCase()}${value.substring(1)}';

String modelLabel(String value) {
  final match = RegExp(r'^gpt-(\d+(?:\.\d+)?)-(sol|astra|luna)$')
      .firstMatch(value);
  return match == null ? value : '${match[1]} ${effortLabel(match[2]!)}';
}

// A menu disappearing does not confirm a setting. Read the explicit CLI response.
AgentSelection? selectionConfirmation(String text) {
  final matches = RegExp(
    r'(?:Model changed to|Switched to model|Set model to)\s+`?([a-zA-Z0-9][a-zA-Z0-9._:/\[\]@+-]*)`?([^\n]*)',
    caseSensitive: false,
  ).allMatches(text);
  if (matches.isEmpty) return null;
  final last = matches.last;
  final effort = RegExp(
    r'\b(none|minimal|low|medium|high|xhigh|max|ultra)\b',
    caseSensitive: false,
  ).firstMatch(last[2] ?? '')?[1]?.toLowerCase();
  return AgentSelection(model: last[1], effort: effort);
}
