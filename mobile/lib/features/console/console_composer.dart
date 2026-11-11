import 'dart:math';

import 'package:flutter/foundation.dart' show Uint8List;
import 'package:flutter/material.dart';

import '../../agent_selection.dart';
import '../../dock_client.dart';
import '../../dock_style.dart';
import '../../state_models.dart';
import 'attachment_controller.dart';
import 'composer_controller.dart';

/// The composer area below a console in chat mode: model and queue tools,
/// screenshot offer, notices and the message field.
class ConsoleChatPanel extends StatelessWidget {
  const ConsoleChatPanel({
    super.key,
    required this.client,
    required this.session,
    required this.composer,
    required this.attachments,
    required this.onLiveControls,
    required this.onQueue,
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
  final VoidCallback onQueue;
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
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          child: Row(
            children: [
              Expanded(
                child: _ModelEffortMenu(
                  client: c,
                  session: session,
                  enabled: c.connected && !sending,
                  onSelected: onLiveControls,
                ),
              ),
              if (c.supports('console.queue') &&
                  (typed.purpose ?? 'agent') == 'agent' &&
                  !['shell', 'custom'].contains(typed.provider))
                _QueueButton(
                  count: _queuedCount(typed.id),
                  onPressed: c.connected && !sending ? onQueue : null,
                ),
              IconButton(
                tooltip: 'Terminal keys',
                onPressed: c.connected && !sending ? onTerminalKeys : null,
                icon: Icon(Icons.keyboard_alt_outlined, color: blue),
              ),
              IconButton(
                tooltip: 'Collapse chat',
                onPressed: composer.leaveChatMode,
                icon: Icon(Icons.keyboard_arrow_down, color: pink),
              ),
            ],
          ),
        ),
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

  int _queuedCount(String id) =>
      ((((client.state['queues'] as Map?)?[id] as Map?)?['entries']) as List? ??
              [])
          .length;
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
  Widget build(BuildContext context) {
    final id = session['id'] as String;
    final provider = (session['provider'] as String).toLowerCase();
    return ListenableBuilder(
      listenable: client.terminalSignal(id),
      builder: (context, _) {
        final selection = client.agentSelection(id);
        final method =
            session['switchMethod'] as String? ??
            (['claude', 'codex'].contains(provider) ? 'resume' : 'none');
        if (method != 'resume') return const SizedBox.shrink();
        final model = selection.model == null
            ? 'Model: unknown'
            : 'Model: ${modelLabel(selection.model!)}${selection.pending ? ' (selected)' : ''}';
        final effort = selection.effort == null
            ? selection.pending
                  ? 'Effort: default (selected)'
                  : 'Effort: unknown'
            : 'Effort: ${effortLabel(selection.effort!)}${selection.pending ? ' (selected)' : ''}';
        return Row(
          children: [
            Expanded(
              child: Text(
                [
                  if (selection.model != null) modelLabel(selection.model!),
                  if (selection.effort != null) effortLabel(selection.effort!),
                  if (selection.pending) '(selected)',
                ].join('  '),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            PopupMenuButton<String>(
              tooltip: 'Model and effort',
              enabled: enabled,
              icon: Icon(Icons.tune, color: blue),
              onSelected: onSelected,
              itemBuilder: (_) => [
                PopupMenuItem(value: 'Model', child: Text(model)),
                PopupMenuItem(value: 'Effort', child: Text(effort)),
              ],
            ),
          ],
        );
      },
    );
  }
}

class _QueueButton extends StatelessWidget {
  const _QueueButton({required this.count, required this.onPressed});
  final int count;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: 'Queue',
    onPressed: onPressed,
    icon: Badge(
      isLabelVisible: count > 0,
      label: Text('$count'),
      child: Icon(Icons.playlist_play, color: blue),
    ),
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
    required this.composer,
    required this.attachEnabled,
    required this.onAttach,
    required this.onSend,
  });

  final Session session;
  final ComposerController composer;
  final bool attachEnabled;
  final ValueChanged<String> onAttach;
  final VoidCallback? onSend;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: min(
                MediaQuery.textScalerOf(context).scale(16) * 1.4 * 8.5 + 24,
                max(72, MediaQuery.sizeOf(context).height * .35),
              ),
            ),
            child: TextField(
              controller: composer.editor,
              scrollController: composer.scroll,
              focusNode: composer.focus,
              onChanged: (_) => composer.edited(),
              minLines: 1,
              maxLines: null,
              style: const TextStyle(fontSize: 16, height: 1.4),
              textInputAction: TextInputAction.newline,
              autocorrect: false,
              enableSuggestions: false,
              decoration: InputDecoration(
                hintText: session.taskId != null ? 'Worker message' : 'Message',
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                isDense: true,
                suffixIcon: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    PopupMenuButton<String>(
                      tooltip: 'Attach',
                      icon: Icon(Icons.add, color: blue),
                      enabled: attachEnabled,
                      onSelected: onAttach,
                      itemBuilder: (_) => [
                        const PopupMenuItem(
                          value: 'files',
                          child: Text('Files'),
                        ),
                        if (session.remote == null)
                          const PopupMenuItem(
                            value: 'image',
                            child: Text('Image'),
                          ),
                      ],
                    ),
                    // Inside the field, so the composer uses the full width.
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: DockSendButton(
                        compact: true,
                        onPressed: onSend,
                        sending: composer.sending,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    ),
  );
}

/// Opens chat mode. The handle glows while a draft is saved.
class EnterChatHandle extends StatelessWidget {
  const EnterChatHandle({
    super.key,
    required this.hasDraft,
    required this.onTap,
  });

  final bool hasDraft;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: hasDraft ? 'Enter chat mode, draft saved' : 'Enter chat mode',
    child: InkWell(
      key: const ValueKey('enter-chat'),
      onTap: onTap,
      child: SizedBox(
        height: 40,
        width: double.infinity,
        child: Center(
          child: Container(
            width: 96,
            height: 4,
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [blue, pink]),
              borderRadius: BorderRadius.circular(4),
              boxShadow: hasDraft
                  ? [
                      BoxShadow(
                        color: pink.withValues(alpha: .35),
                        blurRadius: 8,
                      ),
                    ]
                  : null,
            ),
          ),
        ),
      ),
    ),
  );
}

/// Terminal keys shortcut shown below the console outside chat mode.
class TerminalKeysButton extends StatelessWidget {
  const TerminalKeysButton({super.key, required this.onPressed});
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerRight,
    child: Tooltip(
      message: 'Terminal keys',
      child: TextButton.icon(
        onPressed: onPressed,
        icon: const Icon(Icons.keyboard_alt_outlined, size: 20),
        label: const Text('Terminal keys'),
      ),
    ),
  );
}
