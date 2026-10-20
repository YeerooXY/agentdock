import 'dart:async';

import 'package:flutter/material.dart';
import 'package:xterm/xterm.dart';

import 'agent_identity.dart';
import 'agent_menu.dart';
import 'dock_client.dart';
import 'dock_style.dart';

/// Native choices from the running CLI, with no stored model catalogue.
class LiveAgentControls extends StatefulWidget {
  final DockClient client;
  final String action;
  const LiveAgentControls({
    super.key,
    required this.client,
    required this.action,
  });
  @override
  State<LiveAgentControls> createState() => _LiveAgentControlsState();
}

class _LiveAgentControlsState extends State<LiveAgentControls> {
  DockClient get c => widget.client;
  late final pc = c.activePC, id = c.selected, generation = c.generation;
  late final String initialProvider;
  Terminal? terminal;
  bool busy = false, opened = false, sent = false;
  String error = '';
  bool sessionOnly = true;
  bool get current =>
      mounted &&
      c.connected &&
      c.foreground &&
      c.activePC == pc &&
      c.selected == id &&
      c.generation == generation &&
      provider == initialProvider;
  String get provider =>
      '${c.sessions.where((s) => s['id'] == id).firstOrNull?['provider']}'
          .toLowerCase();
  AgentMenu? get menu =>
      terminal == null ? null : AgentMenu.parse(activeTerminalText(terminal!));
  bool get canOpen =>
      current &&
      terminal != null &&
      ['open', 'ready', 'idle'].contains(
        c.sessions.where((s) => s['id'] == id).firstOrNull?['state'],
      ) &&
      hasEmptyAgentPrompt(terminal!, provider);

  @override
  void initState() {
    super.initState();
    initialProvider = provider;
    c.addListener(changed);
    listenToTerminal();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (current && menu == null && canOpen) open();
    });
  }

  void listenToTerminal() {
    final next = c.screens[id]?.terminal;
    if (next == terminal) return;
    terminal?.removeListener(changed);
    terminal = next;
    terminal?.addListener(changed);
  }

  void changed() {
    if (!mounted) return;
    listenToTerminal();
    setState(() {});
  }

  @override
  void dispose() {
    c.removeListener(changed);
    terminal?.removeListener(changed);
    super.dispose();
  }

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

  Future<void> waitFor(bool Function() ready) async {
    final until = DateTime.now().add(const Duration(seconds: 4));
    while (!ready()) {
      if (!current) throw StateError('Connection changed. Reopen the chooser.');
      if (DateTime.now().isAfter(until)) {
        throw StateError(
          'The agent did not confirm the change. Check the terminal.',
        );
      }
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }
    if (!current) throw StateError('Connection changed. Reopen the chooser.');
  }

  Future<void> open() => act(() async {
    if (!canOpen) {
      throw StateError(
        'Wait for the agent and clear its terminal input first.',
      );
    }
    opened = true;
    await c.submit(
      widget.action == 'Effort' && provider == 'claude' ? '/effort' : '/model',
      command: true,
    );
    await waitFor(() => menu != null);
  });

  Future<void> choose(AgentMenu expected, int index) => act(() async {
    AgentMenu checked() {
      final now = menu;
      if (!current || now == null || now.signature != expected.signature) {
        throw StateError('The agent menu changed. Choose again.');
      }
      return now;
    }

    var now = checked();
    // Confirm every observed move before sending the next key.
    while (now.selected != index) {
      final next = now.selected + (index > now.selected ? 1 : -1);
      await c.input(index > now.selected ? '\x1b[B' : '\x1b[A', id: id);
      await waitFor(() {
        // PTY redraws can arrive in separate frames. Wait through an incomplete
        // repaint, but reject a different complete menu.
        if (menu == null) return false;
        return checked().selected == next;
      });
      now = checked();
    }
    final before = activeTerminalText(terminal!);
    final key = sessionOnly && now.sessionOnly ? 's' : '\r';
    checked();
    await c.input(key, id: id);
    await waitFor(() => activeTerminalText(terminal!) != before);
    await Future<void>.delayed(const Duration(milliseconds: 150));
    if (current) setState(() => sent = menu == null);
  });

  Future<void> close() async {
    if (busy) return;
    if (current && menu != null) await act(() => c.input('\x1b', id: id));
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final live = menu;
    return PopScope(
      canPop: !busy,
      child: SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * .8,
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    AgentMark(provider, size: 26),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        live?.title ?? widget.action,
                        style: const TextStyle(fontSize: 20, color: pink),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Close chooser',
                      onPressed: busy ? null : close,
                      icon: const Icon(Icons.close, color: blue),
                    ),
                  ],
                ),
                if (busy) const LinearProgressIndicator(minHeight: 2),
                if (!current || error.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      current
                          ? error
                          : 'Connection changed. Reopen the chooser.',
                      style: const TextStyle(color: pink),
                    ),
                  ),
                if (live != null) ...[
                  for (var i = 0; i < live.options.length; i++)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Material(
                        color: i == live.selected
                            ? blue.withValues(alpha: .12)
                            : Colors.white.withValues(alpha: .025),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: BorderSide(
                            color: i == live.selected
                                ? blue
                                : blue.withValues(alpha: .2),
                          ),
                        ),
                        child: ListTile(
                          title: Text(
                            live.options[i].split(RegExp(r' {2,}|\n')).first,
                          ),
                          subtitle:
                              live.options[i]
                                      .split(RegExp(r' {2,}|\n'))
                                      .length >
                                  1
                              ? Text(
                                  live.options[i]
                                      .split(RegExp(r' {2,}|\n'))
                                      .skip(1)
                                      .join(' '),
                                )
                              : null,
                          trailing: i == live.selected
                              ? const Icon(Icons.check, color: pink)
                              : null,
                          onTap: current && !busy
                              ? () => choose(live, i)
                              : null,
                        ),
                      ),
                    ),
                  if (live.sessionOnly)
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('This session only'),
                      value: sessionOnly,
                      onChanged: busy
                          ? null
                          : (value) => setState(() => sessionOnly = value),
                    ),
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(
                      live.footer,
                      style: const TextStyle(color: muted, fontSize: 12),
                    ),
                  ),
                ] else if (sent) ...[
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: Text(
                      'Selection sent. Check the confirmation in the terminal.',
                    ),
                  ),
                  FilledButton(onPressed: close, child: const Text('Done')),
                ] else if (!busy) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Text(
                      opened
                          ? 'This agent menu needs attention in the terminal.'
                          : 'Open the chooser from an idle, empty agent prompt.',
                    ),
                  ),
                  FilledButton(
                    onPressed: canOpen ? open : null,
                    child: Text('Open ${widget.action.toLowerCase()}'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
