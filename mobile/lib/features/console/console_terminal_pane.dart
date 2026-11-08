import 'dart:math';

import 'package:flutter/material.dart';

import '../../build_counts.dart';
import '../../console_surface.dart';
import '../../dock_client.dart';
import '../../terminal_viewport.dart';

/// One console's terminal inside its themed surface. Output rebuilds only
/// this pane, through the console's own terminal signal.
class ConsoleTerminalPane extends StatelessWidget {
  const ConsoleTerminalPane({
    super.key,
    required this.client,
    required this.session,
    required this.view,
    required this.playOpening,
    required this.draftKey,
    required this.fitWidth,
    required this.focusNode,
    required this.onPointerDown,
  });

  final DockClient client;
  final Map<String, dynamic> session;
  final ConsoleScreen? view;
  final bool playOpening;
  final String? draftKey;
  final bool fitWidth;
  final FocusNode focusNode;

  /// Touching output must never activate the keyboard.
  final VoidCallback onPointerDown;

  @override
  Widget build(BuildContext context) {
    final c = client, id = session['id'] as String;
    final view = this.view;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: ListenableBuilder(
        listenable: c.terminalSignal(id),
        builder: (context, _) {
          BuildCounts.hit('terminal');
          return ConsoleSurface(
            appearance: c.appearance,
            openingKey: '${c.activePC}:$id',
            connected: c.connected,
            connectionGeneration: c.generation,
            playOpening: playOpening,
            sessionState: session['state'] as String?,
            stateEffectSequence: c.consoleStateEffectSequence(id),
            stateEffectKind: c.consoleStateEffectKind(id),
            activity: c.consoleOutputSequence(id),
            outputBurst: c.consoleOutputBurstSequence(id),
            child: view == null
                ? const Center(child: CircularProgressIndicator())
                : Listener(
                    onPointerDown: (_) => onPointerDown(),
                    child: TerminalViewport(
                      key: ValueKey(draftKey),
                      positions: c.drafts,
                      positionKey: draftKey ?? '',
                      terminal: view.terminal,
                      columns: view.cols,
                      fitWidth: fitWidth,
                      readOnly: !c.connected || session['taskId'] != null,
                      focusNode: focusNode,
                      theme: c.appearance.theme.terminal,
                    ),
                  ),
          );
        },
      ),
    );
  }
}

/// Placeholder when the PC has no consoles yet.
class EmptyConsolePane extends StatelessWidget {
  const EmptyConsolePane({
    super.key,
    required this.client,
    required this.onNewConsole,
  });

  final DockClient client;
  final VoidCallback onNewConsole;

  @override
  Widget build(BuildContext context) {
    final c = client;
    final button = FilledButton.icon(
      onPressed: c.connected ? onNewConsole : null,
      icon: const Icon(Icons.add),
      label: const Text('New console'),
    );
    if (c.appearance.themeId != 'void') return Center(child: button);
    return Center(
      child: SizedBox(
        width: min(MediaQuery.sizeOf(context).width - 32, 520),
        height: 220,
        child: ConsoleSurface(
          appearance: c.appearance,
          openingKey: 'empty:${c.activePC}',
          connected: c.connected,
          connectionGeneration: c.generation,
          emptyPanel: true,
          child: Center(child: button),
        ),
      ),
    );
  }
}
