import 'dart:async';

import 'package:flutter/material.dart';
import 'package:xterm/xterm.dart';

import 'agent_dialog.dart';
import 'agent_menu.dart';
import 'dock_client.dart';
import 'dock_style.dart';

/// Tappable choices for a dialog the CLI is showing, such as a question, a
/// permission request or a trust prompt.
///
/// Opening the panel sends nothing. A tap moves the CLI's own selector one row
/// at a time, waits for the screen to confirm each move, then presses Enter.
/// Every step stops if the connection, console or dialog changes, and nothing
/// is replayed. Only the person tapping chooses; Paddock never picks a default.
class AgentDialogPanel extends StatefulWidget {
  final DockClient client;

  /// Opens the Terminal keys sheet, for rows that need typed text.
  final VoidCallback? onTerminalKeys;
  const AgentDialogPanel({
    super.key,
    required this.client,
    this.onTerminalKeys,
  });

  @override
  State<AgentDialogPanel> createState() => _AgentDialogPanelState();
}

class _AgentDialogPanelState extends State<AgentDialogPanel> {
  DockClient get c => widget.client;
  Terminal? terminal;
  bool busy = false;
  String error = '';
  String _shownSignature = '';

  Map get session =>
      c.sessions.where((s) => s['id'] == c.selected).firstOrNull ?? {};
  String get provider => '${session['provider']}'.toLowerCase();

  AgentDialog? get dialog {
    if (!c.connected || session['taskId'] != null || terminal == null) {
      return null;
    }
    return activeAgentDialog(activeTerminalText(terminal!), provider);
  }

  @override
  void initState() {
    super.initState();
    c.addListener(changed);
    listen();
  }

  void listen() {
    final next = c.screens[c.selected]?.terminal;
    if (next == terminal) return;
    terminal?.removeListener(changed);
    terminal = next;
    terminal?.addListener(changed);
  }

  void changed() {
    if (!mounted) return;
    listen();
    setState(() {});
  }

  @override
  void dispose() {
    c.removeListener(changed);
    terminal?.removeListener(changed);
    super.dispose();
  }

  /// Runs [step] against the dialog the person tapped. [stillHere] is false
  /// once anything it was pinned to has changed.
  Future<void> drive(
    Future<void> Function(bool Function() stillHere) step,
  ) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await step(() => mounted);
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Bad state: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> choose(AgentDialog shown, int index) => drive((_) async {
    final pc = c.activePC, id = c.selected, generation = c.generation;
    final chat = session['providerSessionId'], kind = provider;
    final signature = shown.signature;
    bool pinned() =>
        mounted &&
        c.connected &&
        c.foreground &&
        c.activePC == pc &&
        c.selected == id &&
        c.generation == generation &&
        provider == kind &&
        session['providerSessionId'] == chat;
    AgentDialog current() {
      final now = pinned() && terminal != null
          ? activeAgentDialog(activeTerminalText(terminal!), kind)
          : null;
      if (now == null || now.signature != signature) {
        throw StateError('The dialog changed. Check the terminal.');
      }
      return now;
    }

    var now = current();
    while (now.selected != index) {
      final next = now.selected + (index > now.selected ? 1 : -1);
      await c.input(index > now.selected ? '\x1b[B' : '\x1b[A', id: id);
      await _waitFor(() => current().selected == next, pinned);
      now = current();
    }
    if (now.options[index].needsText) {
      // Typing happens in the terminal; Enter would submit an empty answer.
      widget.onTerminalKeys?.call();
      return;
    }
    await c.input('\r', id: id);
    await _waitFor(() {
      if (!pinned()) throw StateError('Connection or chat changed.');
      final live = activeAgentDialog(activeTerminalText(terminal!), kind);
      return live == null || live.signature != signature;
    }, pinned);
  });

  Future<void> cancel(AgentDialog shown) => drive((_) async {
    final id = c.selected, signature = shown.signature;
    await c.input('\x1b', id: id);
    await _waitFor(() {
      final live = activeAgentDialog(activeTerminalText(terminal!), provider);
      return live == null || live.signature != signature;
    }, () => mounted && c.connected && c.selected == id);
  });

  Future<void> _waitFor(bool Function() ready, bool Function() pinned) async {
    // Counted in 50 ms polls so the six-second limit follows the app clock.
    for (var waited = 0; ; waited += 50) {
      if (!pinned()) throw StateError('Connection or chat changed.');
      if (ready()) return;
      if (waited >= 6000) {
        throw StateError(
          'Could not confirm the choice. Check the terminal before trying again.',
        );
      }
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }
  }

  @override
  Widget build(BuildContext context) {
    final shown = dialog;
    if (shown == null) {
      _shownSignature = '';
      return const SizedBox.shrink();
    }
    if (_shownSignature != shown.signature) {
      _shownSignature = shown.signature;
      error = '';
    }
    final maxHeight = MediaQuery.sizeOf(context).height * 0.38;
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 6, 10, 0),
      child: Container(
        decoration: BoxDecoration(
          border: Border.all(color: blue.withValues(alpha: 0.5)),
          borderRadius: BorderRadius.circular(12),
        ),
        padding: const EdgeInsets.all(10),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxHeight),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (shown.title.isNotEmpty)
                  Text(
                    shown.title,
                    maxLines: 4,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 14),
                  ),
                if (busy) const LinearProgressIndicator(minHeight: 2),
                if (shown.unsupported != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      shown.unsupported!,
                      style: const TextStyle(color: muted),
                    ),
                  )
                else
                  for (var i = 0; i < shown.options.length; i++)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: _Choice(
                        option: shown.options[i],
                        selected: i == shown.selected,
                        onTap: busy ? null : () => choose(shown, i),
                      ),
                    ),
                if (error.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(error, style: TextStyle(color: pink)),
                  ),
                Align(
                  alignment: Alignment.centerRight,
                  child: Wrap(
                    children: [
                      TextButton(
                        onPressed: busy ? null : () => cancel(shown),
                        child: const Text('Cancel dialog'),
                      ),
                      if (widget.onTerminalKeys != null)
                        TextButton(
                          onPressed: busy ? null : widget.onTerminalKeys,
                          child: const Text('Terminal keys'),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Choice extends StatelessWidget {
  final AgentDialogOption option;
  final bool selected;
  final VoidCallback? onTap;
  const _Choice({
    required this.option,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    selected: selected,
    label: option.needsText
        ? '${option.label}, type in terminal'
        : option.label,
    excludeSemantics: true,
    onTap: onTap,
    child: OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        side: BorderSide(color: selected ? pink : blue.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            option.number == null
                ? option.label
                : '${option.number}. ${option.label}',
            textAlign: TextAlign.left,
          ),
          if (option.detail.isNotEmpty)
            Text(
              option.detail,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, color: muted),
            ),
        ],
      ),
    ),
  );
}
