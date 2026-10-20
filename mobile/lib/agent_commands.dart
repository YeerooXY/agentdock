import 'package:flutter/material.dart';

import 'dock_style.dart';

class AgentCommand {
  final String label, text;
  final String? note;
  const AgentCommand(this.label, this.text, {this.note});
}

class AgentCommands {
  final String name;
  final List<AgentCommand> commands;
  const AgentCommands(this.name, this.commands);

  // Primary documentation and compatibility limits: docs/mobile-controls.md.
  // No model IDs, permission changes, paid tasks or shell command guesses.
  static AgentCommands? forProvider(String provider) =>
      switch (provider.toLowerCase()) {
        'codex' => const AgentCommands('Codex', [
          AgentCommand('Model', '/model'),
          AgentCommand('Effort', '/model'),
          AgentCommand('Status', '/status'),
          AgentCommand('Code changes', '/diff'),
          AgentCommand('MCP tools', '/mcp'),
        ]),
        'claude' => const AgentCommands('Claude Code', [
          AgentCommand(
            'Model',
            '/model',
            note: 'In current Claude versions, press s in the picker to change only this session.',
          ),
          AgentCommand('Effort', '/effort'),
          AgentCommand('Status', '/status'),
          AgentCommand('Context', '/context'),
          AgentCommand('MCP tools', '/mcp'),
        ]),
        'opencode' => const AgentCommands('OpenCode', [
          AgentCommand('Model', '/models'),
          AgentCommand('Help', '/help'),
          AgentCommand('Tool output', '/details'),
        ]),
        'gemini' => const AgentCommands('Gemini CLI', [
          AgentCommand('Model', '/model manage'),
          AgentCommand('Usage', '/stats'),
          AgentCommand('MCP tools', '/mcp'),
          AgentCommand('Help', '/help'),
        ]),
        _ => null,
      };
}

class AgentCommandSheet extends StatelessWidget {
  final AgentCommands catalog;
  final String consoleName;
  final bool enabled;
  const AgentCommandSheet({
    super.key,
    required this.catalog,
    required this.consoleName,
    required this.enabled,
  });

  @override
  Widget build(BuildContext context) => SafeArea(
    child: ListView(
      shrinkWrap: true,
      padding: const EdgeInsets.fromLTRB(8, 0, 8, 16),
      children: [
        ListTile(
          title: Text(
            '${catalog.name} commands',
            style: const TextStyle(color: pink, fontSize: 22),
          ),
          subtitle: Text(consoleName),
          trailing: IconButton(
            tooltip: 'Close commands',
            onPressed: () => Navigator.pop(context),
            icon: const Icon(Icons.close, color: blue),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Text(
            enabled
                ? 'Insert a command, then Send.'
                : 'Connection or console changed. Reopen this menu.',
            style: TextStyle(color: enabled ? muted : pink),
          ),
        ),
        for (final command in catalog.commands)
          ListTile(
            enabled: enabled,
            title: Text(command.label),
            subtitle: Text(
              command.note == null
                  ? command.text
                  : '${command.text}\n${command.note}',
            ),
            leading: Icon(
              command.label == 'Model' ? Icons.tune : Icons.terminal,
              color: enabled ? blue : muted,
            ),
            onTap: enabled ? () => Navigator.pop(context, command) : null,
          ),
        ListTile(
          enabled: enabled,
          leading: const Icon(Icons.keyboard_tab, color: blue),
          title: const Text('Live commands and completion'),
          onTap: enabled
              ? () =>
                    Navigator.pop(context, const AgentCommand('Commands', '/'))
              : null,
        ),
      ],
    ),
  );
}
