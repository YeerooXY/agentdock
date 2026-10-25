import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:xterm/xterm.dart';

import 'agent_menu.dart';
import 'dock_client.dart';
import 'dock_style.dart';

/// Manual terminal input for trust dialogs, permission menus and other CLIs.
/// No prompt is interpreted as consent and no key is sent on opening.
class TerminalKeys extends StatefulWidget {
  final DockClient client;
  const TerminalKeys({super.key, required this.client});

  @override
  State<TerminalKeys> createState() => _TerminalKeysState();
}

class _TerminalKeysState extends State<TerminalKeys> {
  DockClient get c => widget.client;
  late final pc = c.activePC, id = c.selected, generation = c.generation;
  late final session = c.sessions.where((s) => s['id'] == id).firstOrNull;
  late final provider = session?['provider'],
      chat = session?['providerSessionId'];
  late final Terminal? terminal = c.screens[id]?.terminal;
  final reply = TextEditingController();
  bool busy = false;
  String error = '';

  bool get current {
    final now = c.sessions.where((s) => s['id'] == id).firstOrNull;
    return mounted &&
        c.connected &&
        c.foreground &&
        c.activePC == pc &&
        c.selected == id &&
        c.generation == generation &&
        now != null &&
        now['alive'] != false &&
        now['provider'] == provider &&
        now['providerSessionId'] == chat &&
        terminal != null &&
        identical(c.screens[id]?.terminal, terminal);
  }

  @override
  void initState() {
    super.initState();
    c.addListener(changed);
    terminal?.addListener(changed);
  }

  void changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    c.removeListener(changed);
    terminal?.removeListener(changed);
    reply.dispose();
    super.dispose();
  }

  Future<void> send(String value) async {
    if (!current || busy) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      // One acknowledged input, pinned to the original console. Never replay.
      await c.input(value, id: id);
    } catch (_) {
      if (mounted) {
        error = 'Could not confirm delivery. Check the terminal before trying again.';
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget keyButton(String label, String value) => OutlinedButton(
    onPressed: current && !busy ? () => send(value) : null,
    child: Text(label),
  );

  @override
  Widget build(BuildContext context) {
    final prefix = terminal?.cursorKeysMode == true ? '\x1bO' : '\x1b[';
    final text = terminal == null ? '' : activeTerminalText(terminal!);
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * .9,
        ),
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            16,
            0,
            16,
            20 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Terminal keys',
                      style: TextStyle(fontSize: 22, color: pink),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close terminal keys',
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              Text(
                '${session?['name'] ?? 'Console'}',
                style: const TextStyle(fontSize: 16),
              ),
              if (session?['cwd'] case final String folder)
                Text(folder, style: const TextStyle(color: muted)),
              const SizedBox(height: 12),
              if (text.isNotEmpty)
                Container(
                  width: double.infinity,
                  constraints: const BoxConstraints(maxHeight: 200),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.black,
                    border: Border.all(color: blue.withValues(alpha: .4)),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: SingleChildScrollView(
                    reverse: true,
                    child: SelectableText(
                      text,
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 14,
                        height: 1.4,
                      ),
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              if (busy) const LinearProgressIndicator(),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  keyButton('Up', '${prefix}A'),
                  keyButton('Down', '${prefix}B'),
                  keyButton('Enter', '\r'),
                  keyButton('Esc', '\x1b'),
                  keyButton('Left', '${prefix}D'),
                  keyButton('Right', '${prefix}C'),
                  keyButton('Tab', '\t'),
                  keyButton('Space', ' '),
                  keyButton('Ctrl+C', '\x03'),
                ],
              ),
              const SizedBox(height: 16),
              TextField(
                controller: reply,
                enabled: current && !busy,
                maxLength: 2000,
                autocorrect: false,
                enableSuggestions: false,
                inputFormatters: [
                  FilteringTextInputFormatter.deny(RegExp(r'[\x00-\x1f\x7f]')),
                ],
                decoration: const InputDecoration(
                  labelText: 'Reply text',
                  counterText: '',
                ),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 8),
              const Text(
                'Type text sends only the text. Use Enter if the terminal asks you to submit it.',
                style: TextStyle(color: muted),
              ),
              TextButton(
                onPressed: current && !busy && reply.text.isNotEmpty
                    ? () => send(reply.text)
                    : null,
                child: const Text('Type text'),
              ),
              if (!current)
                Text(
                  'Connection or console changed. Close and reopen Terminal keys.',
                  style: TextStyle(color: pink),
                ),
              if (error.isNotEmpty) Text(error, style: TextStyle(color: pink)),
            ],
          ),
        ),
      ),
    );
  }
}
