import 'package:flutter/material.dart';

import '../../console_actions.dart';
import '../../dock_client.dart';
import '../../live_agent_controls.dart';
import '../../message_queue_sheet.dart';
import '../../terminal_keys.dart';
import '../../terminal_links.dart';
import '../../terminal_reading.dart';
import 'command_target.dart';
import 'composer_controller.dart';

/// Bottom sheets opened from a console: files, copy, links, queue, terminal
/// keys and live model controls.
class ConsoleSheets {
  ConsoleSheets({
    required this.client,
    required this.composer,
    required this.releaseInput,
    required this.onConsolePage,
  });

  final DockClient client;
  final ComposerController composer;

  /// Stops terminal typing and closes the keyboard before a sheet opens.
  final VoidCallback releaseInput;

  /// Whether the console page is showing in a mounted home screen.
  final bool Function() onConsolePage;

  BoxConstraints _tall(BuildContext context) =>
      BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * .85);

  bool get _selectedIsWorker => client.selectedSession?.taskId != null;

  Future<void> liveControls(BuildContext context, String action) async {
    if (_selectedIsWorker) return;
    releaseInput();
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => LiveAgentControls(client: client, action: action),
    );
  }

  Future<void> terminalKeys(BuildContext context) async {
    if (_selectedIsWorker) return;
    releaseInput();
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => TerminalKeys(client: client),
    );
  }

  /// Chooses a project file and inserts its relative path into the draft.
  Future<void> pickFile(BuildContext context) async {
    if (!client.supports('console.files')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Update Paddock on your PC to choose files here.'),
        ),
      );
      return;
    }
    final target = CommandTarget.capture(client);
    if (target == null) return;
    final draft = composer.editor.value;
    releaseInput();
    final path = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      constraints: _tall(context),
      builder: (_) =>
          ConsoleFilesSheet(client: client, sessionId: target.session),
    );
    if (path == null || !onConsolePage() || !target.isCurrent(client)) return;
    composer.insertPath(path, draft: draft, target: target);
  }

  Future<void> copy(BuildContext context) async {
    final terminal = client.screen?.terminal;
    if (terminal == null) return;
    final text = terminalReadingText(terminal);
    releaseInput();
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      constraints: _tall(context),
      builder: (_) => ConsoleCopySheet(text: text),
    );
  }

  /// Lists the links in the selected terminal. The sheet disables them once
  /// the PC, console or terminal buffer changes.
  Future<void> links(BuildContext context, Map<String, dynamic> session) async {
    final screen = client.screen;
    if (screen == null) return;
    final pc = client.activePC, id = client.selected;
    final found = terminalLinks(screen.terminal);
    releaseInput();
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      constraints: _tall(context),
      builder: (_) => AnimatedBuilder(
        animation: client,
        builder: (_, _) => TerminalLinksSheet(
          links: found,
          consoleName: session['name'] as String? ?? 'Console',
          enabled:
              client.activePC == pc &&
              client.selected == id &&
              client.screen?.terminal == screen.terminal,
        ),
      ),
    );
  }

  Future<void> messageQueue(BuildContext context) async {
    releaseInput();
    final key = composer.draftKey;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => MessageQueueSheet(
        client: client,
        draft: composer.editor.text,
        draftSelection: composer.editor.selection,
        onQueued: () => composer.clearQueued(key),
        onUsePrompt: (text, cursorOffset) =>
            composer.usePrompt(key, text, cursorOffset),
      ),
    );
  }
}
