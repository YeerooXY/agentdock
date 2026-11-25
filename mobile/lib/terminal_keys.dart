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
  static final keyShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(10),
  );

  DockClient get c => widget.client;
  late final pc = c.activePC, id = c.selected, generation = c.generation;
  late final session = c.sessions.where((s) => s['id'] == id).firstOrNull;
  late final provider = session?['provider'],
      chat = session?['providerSessionId'];
  late final Terminal? terminal = c.screens[id]?.terminal;
  final reply = TextEditingController();
  final mods = <String>{};
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
      mods.clear();
    } catch (_) {
      if (mounted) {
        error = 'Could not confirm delivery. Check the terminal before trying again.';
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget keycap(
    String label, {
    String? input,
    IconData? icon,
    bool primary = false,
  }) {
    final isModifier = input == null;
    final selected = mods.contains(label);
    final style =
        OutlinedButton.styleFrom(
          minimumSize: const Size(48, 48),
          padding: const EdgeInsets.symmetric(horizontal: 4),
          shape: keyShape,
          backgroundColor: selected
              ? pink
              : primary
              ? blue.withValues(alpha: .22)
              : const Color(0xff171822),
          foregroundColor: selected ? ink : Colors.white,
          disabledBackgroundColor: const Color(0xff171822),
        ).copyWith(
          side: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.focused)) {
              return BorderSide(color: selected ? ink : Colors.white, width: 2);
            }
            if (states.contains(WidgetState.disabled)) {
              return BorderSide(color: muted.withValues(alpha: .18));
            }
            return BorderSide(
              color: selected || primary ? pink : muted.withValues(alpha: .30),
            );
          }),
        );
    final button = OutlinedButton(
      style: style,
      onPressed: current
          ? () {
              if (busy) return;
              if (input != null) {
                send(withModifiers(input));
              } else {
                setState(() => selected ? mods.remove(label) : mods.add(label));
              }
            }
          : null,
      child: icon == null
          ? FittedBox(fit: BoxFit.scaleDown, child: Text(label))
          : Icon(icon, size: 20, semanticLabel: label),
    );
    if (isModifier) return Semantics(toggled: selected, child: button);
    return icon == null
        ? button
        : Tooltip(message: label, excludeFromSemantics: true, child: button);
  }

  /// xterm encoding: arrows carry 1+Shift(1)+Alt(2)+Ctrl(4); Alt prefixes Esc.
  String withModifiers(String value) {
    final shift = mods.contains('Shift'),
        alt = mods.contains('Alt'),
        ctrl = mods.contains('Ctrl');
    if (!shift && !alt && !ctrl) return value;
    final cursor = RegExp(r'^\x1b[\[O]([A-D])$').firstMatch(value);
    if (cursor != null) {
      return '\x1b[1;${1 + (shift ? 1 : 0) + (alt ? 2 : 0) + (ctrl ? 4 : 0)}${cursor[1]}';
    }
    if (value == '\t' && shift) return '\x1b[Z';
    if (value == '\x1b' || value == '\x03') return value;
    if (value == ' ' && ctrl) return '\x00';
    return alt ? '\x1b$value' : value;
  }

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
              const SizedBox(height: 4),
              SizedBox(
                height: 4,
                child: busy
                    ? Semantics(
                        liveRegion: true,
                        child: const LinearProgressIndicator(
                          semanticsLabel: 'Sending terminal input',
                        ),
                      )
                    : null,
              ),
              const SizedBox(height: 4),
              LayoutBuilder(
                builder: (context, constraints) {
                  const gap = 6.0;
                  final keyWidth =
                      MediaQuery.textScalerOf(context).scale(48) + 8;
                  final columns = constraints.maxWidth >= keyWidth * 4 + gap * 3
                      ? 4
                      : 2;
                  final width =
                      ((constraints.maxWidth - gap * (columns - 1)) / columns)
                          .floorToDouble();
                  return Wrap(
                    spacing: gap,
                    runSpacing: gap,
                    children: [
                      for (final key in [
                        keycap('Esc', input: '\x1b'),
                        keycap('Tab', input: '\t'),
                        keycap('Space', input: ' '),
                        keycap('Enter', input: '\r', primary: true),
                        keycap('Ctrl'),
                        keycap('Shift'),
                        keycap('Alt'),
                        keycap('Ctrl+C', input: '\x03'),
                      ])
                        SizedBox(width: width, child: key),
                    ],
                  );
                },
              ),
              const SizedBox(height: 12),
              // Arrows as an inverted T.
              Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 180),
                  child: Column(
                    children: [
                      SizedBox(
                        width: 56,
                        child: keycap(
                          'Up',
                          input: '${prefix}A',
                          icon: Icons.keyboard_arrow_up,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Expanded(
                            child: keycap(
                              'Left',
                              input: '${prefix}D',
                              icon: Icons.keyboard_arrow_left,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: keycap(
                              'Down',
                              input: '${prefix}B',
                              icon: Icons.keyboard_arrow_down,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: keycap(
                              'Right',
                              input: '${prefix}C',
                              icon: Icons.keyboard_arrow_right,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: reply,
                enabled: current,
                readOnly: busy,
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
                'Press Enter if the terminal asks you to submit.',
                style: TextStyle(color: muted),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton(
                  style: FilledButton.styleFrom(shape: keyShape),
                  onPressed: current && reply.text.isNotEmpty
                      ? () => send(reply.text)
                      : null,
                  child: const Text('Send text'),
                ),
              ),
              if (!current)
                Semantics(
                  liveRegion: true,
                  child: Text(
                    'Connection or console changed. Close and reopen Terminal keys.',
                    style: TextStyle(color: pink),
                  ),
                ),
              if (error.isNotEmpty)
                Semantics(
                  liveRegion: true,
                  child: Text(error, style: TextStyle(color: pink)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
