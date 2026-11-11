import 'dart:math';

import 'package:flutter/foundation.dart' show Uint8List;
import 'package:flutter/material.dart';

import '../../agent_selection.dart';
import '../../dock_client.dart';
import '../../dock_style.dart';
import '../../state_models.dart';
import 'attachment_controller.dart';
import 'composer_controller.dart';

/// The reply box below a console: message controls,
/// screenshot offer, notices and the message field.
class ConsoleChatPanel extends StatelessWidget {
  const ConsoleChatPanel({
    super.key,
    required this.client,
    required this.session,
    required this.composer,
    required this.attachments,
    required this.onLiveControls,
    required this.onTerminalKeys,
    required this.onAttach,
    required this.onAttachRecent,
    required this.onSend,
  });

  final DockClient client;
  final Map<String, dynamic> session;
  final ComposerController composer;
  final AttachmentController attachments;
  final ValueChanged<String> onLiveControls;
  final VoidCallback onTerminalKeys;

  /// `files` or `image`.
  final ValueChanged<String> onAttach;

  /// Attaches the offered recent screenshot.
  final VoidCallback onAttachRecent;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final c = client;
    final typed = Session.fromJson(session);
    final sending = composer.sending;
    final steering = typed.consoleCapabilities?['steering'] == true;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (attachments.recentShot case final shot?)
          _RecentShotChip(
            shot: shot,
            onPressed: c.connected && !sending && !attachments.attaching
                ? onAttachRecent
                : null,
            onDeleted: () => attachments.dismiss(shot['id'] as int),
          ),
        if (composer.draftKey case final key?)
          if (c.drafts.lastSent(key).isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  const Text('Sent'),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      c.drafts.lastSent(key),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  IconButton(
                    tooltip: 'View sent message',
                    icon: const Icon(Icons.expand_more),
                    onPressed: () => showDialog<void>(
                      context: context,
                      builder: (context) => AlertDialog(
                        title: const Text('Sent message'),
                        content: SingleChildScrollView(
                          child: SelectableText(c.drafts.lastSent(key)),
                        ),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(context),
                            child: const Text('Close'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
        if (c.inputError.isNotEmpty || c.drafts.error.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              c.inputError.isNotEmpty ? c.inputError : c.drafts.error,
              style: TextStyle(color: pink, fontSize: 12),
            ),
          ),
        if (typed.taskId != null && typed.steeringState != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              '${typed.steeringState}',
              style: const TextStyle(fontSize: 12),
            ),
          ),
        if (typed.taskId != null && !steering)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              'Steering unavailable for this CLI',
              style: TextStyle(fontSize: 12),
            ),
          ),
        _ComposerField(
          session: typed,
          composer: composer,
          client: c,
          sessionMap: session,
          onLiveControls: onLiveControls,
          onTerminalKeys: c.connected && !sending && typed.taskId == null
              ? onTerminalKeys
              : null,
          attachEnabled:
              c.connected &&
              !sending &&
              !attachments.attaching &&
              typed.taskId == null,
          onAttach: onAttach,
          onSend:
              c.connected &&
                  !sending &&
                  composer.editor.text.trim().isNotEmpty &&
                  (typed.taskId == null || steering)
              ? onSend
              : null,
        ),
      ],
    );
  }
}

/// Model and effort share one icon so the console keeps its height. They
/// appear only where the PC can apply a change (switchMethod 'resume'); older
/// PCs omit the field.
class _ModelEffortMenu extends StatelessWidget {
  const _ModelEffortMenu({
    required this.client,
    required this.session,
    required this.enabled,
    required this.onSelected,
  });
  final DockClient client;
  final Map<String, dynamic> session;
  final bool enabled;
  final ValueChanged<String> onSelected;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: client.terminalSignal(session['id'] as String),
    builder: (context, _) {
      final provider = (session['provider'] as String).toLowerCase();
      final method =
          session['switchMethod'] as String? ??
          (['claude', 'codex'].contains(provider) ? 'resume' : 'none');
      if (method != 'resume' || session['taskId'] != null) {
        return const SizedBox.shrink();
      }
      final selection = client.agentSelection(session['id'] as String);
      final label = [
        selection.model == null ? 'Model' : modelLabel(selection.model!),
        if (selection.effort != null) effortLabel(selection.effort!),
        if (selection.pending) '(selected)',
      ].join('  ');
      return Tooltip(
        message: 'Model and effort',
        child: TextButton(
          onPressed: enabled ? () => onSelected('Model') : null,
          child: Text(label, maxLines: 2, overflow: TextOverflow.ellipsis),
        ),
      );
    },
  );
}

class _RecentShotChip extends StatelessWidget {
  const _RecentShotChip({
    required this.shot,
    required this.onPressed,
    required this.onDeleted,
  });
  final Map shot;
  final VoidCallback? onPressed;
  final VoidCallback onDeleted;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
    child: Align(
      alignment: Alignment.centerLeft,
      child: InputChip(
        key: const ValueKey('recent-screenshot'),
        avatar: shot['thumbnail'] is Uint8List
            ? ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: Image.memory(
                  shot['thumbnail'] as Uint8List,
                  fit: BoxFit.cover,
                  gaplessPlayback: true,
                ),
              )
            : const Icon(Icons.screenshot_outlined),
        label: Text(
          'Attach screenshot, ${TimeOfDay.fromDateTime(DateTime.fromMillisecondsSinceEpoch(shot['at'] as int)).format(context)}',
          overflow: TextOverflow.ellipsis,
        ),
        onPressed: onPressed,
        deleteButtonTooltipMessage: 'Dismiss',
        onDeleted: onDeleted,
      ),
    ),
  );
}

class _ComposerField extends StatelessWidget {
  const _ComposerField({
    required this.session,
    required this.sessionMap,
    required this.client,
    required this.composer,
    required this.attachEnabled,
    required this.onAttach,
    required this.onSend,
    required this.onTerminalKeys,
    required this.onLiveControls,
  });
  final Session session;
  final Map<String, dynamic> sessionMap;
  final DockClient client;
  final ComposerController composer;
  final bool attachEnabled;
  final ValueChanged<String> onAttach, onLiveControls;
  final VoidCallback? onSend, onTerminalKeys;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
    child: ListenableBuilder(
      listenable: composer.focus,
      builder: (context, _) => InputDecorator(
        key: const ValueKey('reply-box'),
        isFocused: composer.focus.hasFocus,
        decoration: const InputDecoration(contentPadding: EdgeInsets.all(6)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: min(
                  MediaQuery.textScalerOf(context).scale(16) * 1.4 * 8.5 + 24,
                  max(96, MediaQuery.sizeOf(context).height * .35),
                ),
              ),
              child: TextField(
                controller: composer.editor,
                scrollController: composer.scroll,
                focusNode: composer.focus,
                onChanged: (_) => composer.edited(),
                minLines: 3,
                maxLines: null,
                style: const TextStyle(fontSize: 16, height: 1.4),
                textInputAction: TextInputAction.newline,
                autocorrect: false,
                enableSuggestions: false,
                decoration: InputDecoration(
                  hintText: session.taskId != null
                      ? 'Worker message'
                      : 'Message',
                  contentPadding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
                  filled: false,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                ),
              ),
            ),
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                PopupMenuButton<String>(
                  tooltip: 'Attach',
                  icon: Icon(Icons.add, color: blue),
                  enabled: attachEnabled,
                  onSelected: onAttach,
                  itemBuilder: (_) => [
                    const PopupMenuItem(value: 'files', child: Text('Files')),
                    if (session.remote == null)
                      const PopupMenuItem(value: 'image', child: Text('Image')),
                    if (client.supports('prompts'))
                      const PopupMenuItem(
                        value: 'prompts',
                        child: Text('Saved prompts'),
                      ),
                  ],
                ),
                Expanded(
                  child: _ModelEffortMenu(
                    client: client,
                    session: sessionMap,
                    enabled: client.connected && !composer.sending,
                    onSelected: onLiveControls,
                  ),
                ),
                IconButton(
                  tooltip: 'Terminal keys',
                  onPressed: onTerminalKeys,
                  icon: Icon(Icons.keyboard_alt_outlined, color: blue),
                ),
                DockSendButton(
                  compact: true,
                  onPressed: onSend,
                  sending: composer.sending,
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}
