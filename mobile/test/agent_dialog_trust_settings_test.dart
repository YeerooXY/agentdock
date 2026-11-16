import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/agent_dialog.dart';

void main() {
  test('trust prompt listing settings.local.json permissions stays tappable', () {
    final text = File('test/fixtures/claude-trust-settings-prompt.txt').readAsStringSync();
    final d = parseAgentDialog(text, 'claude');
    expect(d, isNotNull);
    expect(d!.options.map((o) => o.label), ['No, exit', 'Yes, I trust this folder']);
    expect(d.selected, 0);
  });
}
