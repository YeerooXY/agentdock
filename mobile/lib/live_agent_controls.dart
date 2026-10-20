import 'package:flutter/material.dart';
import 'package:xterm/xterm.dart';

import 'dock_client.dart';
import 'dock_style.dart';
import 'terminal_reading.dart';

/// The CLI owns its model list, account availability, command extensions and
/// effort options. The phone displays that live menu and sends deliberate keys.
class LiveAgentControls extends StatefulWidget {
  final DockClient client;
  final String action;
  final String? completion;
  final VoidCallback? onTyped;
  final TerminalTheme theme;
  const LiveAgentControls({
    super.key,
    required this.client,
    required this.action,
    this.completion,
    this.onTyped,
    required this.theme,
  });
  @override
  State<LiveAgentControls> createState() => _LiveAgentControlsState();
}

class _LiveAgentControlsState extends State<LiveAgentControls> {
  late final pc = widget.client.activePC, id = widget.client.selected;
  late final generation = widget.client.generation;
  bool busy = false, opened = false;
  String error = '';
  DockClient get c => widget.client;
  bool get current =>
      c.connected &&
      c.foreground &&
      c.activePC == pc &&
      c.selected == id &&
      c.generation == generation;
  String get provider =>
      '${c.sessions.where((s) => s['id'] == id).firstOrNull?['provider']}'
          .toLowerCase();

  Future<void> act(Future<void> Function() action) async {
    if (!current || busy) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await action();
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Bad state: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> open() => act(() async {
    if (widget.action == 'Commands') {
      final value = widget.completion ?? '/';
      if (value.contains(RegExp(r'[\x00-\x1f\x7f]')) || value.length > 2000) {
        throw StateError('Complete one line at a time.');
      }
      await c.input(value);
      if (current) widget.onTyped?.call();
      await Future<void>.delayed(const Duration(milliseconds: 150));
      if (!current) {
        throw StateError('Console changed. Check the original console.');
      }
      await c.input('\t');
    } else {
      final command = widget.action == 'Effort' && provider == 'claude'
          ? '/effort'
          : provider == 'opencode'
          ? '/models'
          : provider == 'gemini'
          ? '/model manage'
          : '/model';
      await c.submit(command, command: true);
    }
    if (mounted) setState(() => opened = true);
  });

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: c,
    builder: (context, _) => SafeArea(
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * .75,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          child: SingleChildScrollView(
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        widget.action,
                        style: const TextStyle(color: pink, fontSize: 22),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Close controls',
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close, color: blue),
                    ),
                  ],
                ),
                if (!opened) ...[
                  const Text(
                    'Clear any existing terminal input first.',
                    style: TextStyle(color: muted),
                  ),
                  FilledButton(
                    onPressed: current && !busy ? open : null,
                    child: Text('Open ${widget.action.toLowerCase()}'),
                  ),
                ],
                if (!current || error.isNotEmpty)
                  Text(
                    current ? error : 'Connection or console changed. Reopen these controls.',
                    style: const TextStyle(color: pink),
                  ),
                SizedBox(
                  height: (MediaQuery.sizeOf(context).height * .38).clamp(
                    160.0,
                    420.0,
                  ),
                  child: c.screens[id] == null
                      ? const Center(child: Text('Waiting for terminal output'))
                      : DockFrame(
                          background: Colors.black,
                          child: TerminalReadingView(
                            terminal: c.screens[id]!.terminal,
                            theme: widget.theme,
                          ),
                        ),
                ),
                if (opened) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      for (final key in [
                        ('\u2191', '\x1b[A'),
                        ('\u2193', '\x1b[B'),
                        ('\u2190', '\x1b[D'),
                        ('\u2192', '\x1b[C'),
                        ('Tab', '\t'),
                        ('Choose', '\r'),
                        ('Esc', '\x1b'),
                      ])
                        OutlinedButton(
                          onPressed: current && !busy
                              ? () => act(() => c.input(key.$2))
                              : null,
                          child: switch (key.$2) {
                            '\x1b[A' => const Icon(
                              Icons.arrow_upward,
                              semanticLabel: 'Up',
                            ),
                            '\x1b[B' => const Icon(
                              Icons.arrow_downward,
                              semanticLabel: 'Down',
                            ),
                            '\x1b[D' => const Icon(
                              Icons.arrow_back,
                              semanticLabel: 'Left',
                            ),
                            '\x1b[C' => const Icon(
                              Icons.arrow_forward,
                              semanticLabel: 'Right',
                            ),
                            _ => Text(key.$1),
                          },
                        ),
                      if (provider == 'claude' && widget.action != 'Commands')
                        TextButton(
                          onPressed: current && !busy
                              ? () => act(() => c.input('s'))
                              : null,
                          child: const Text('Session only (s)'),
                        ),
                    ],
                  ),
                  Text(
                    provider == 'claude'
                        ? 'Use the choices shown by Claude. “Session only” requires a CLI version that displays that option.'
                        : 'Choose from the live menu. Codex may show effort after choosing a model.',
                    style: const TextStyle(color: muted, fontSize: 12),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
