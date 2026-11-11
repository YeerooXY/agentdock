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
/// latest-image shortcut, notices and the message field.
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
    required this.onDictate,
  });

  final DockClient client;
  final Map<String, dynamic> session;
  final ComposerController composer;
  final AttachmentController attachments;
  final ValueChanged<String> onLiveControls;
  final VoidCallback onTerminalKeys;

  /// `files` or `image`.
  final ValueChanged<String> onAttach;

  /// Attaches the latest accessible phone image.
  final VoidCallback onAttachRecent;
  final VoidCallback onSend, onDictate;

  @override
  Widget build(BuildContext context) {
    final c = client;
    final typed = Session.fromJson(session);
    final sending = composer.sending || composer.dictating;
    final steering = typed.consoleCapabilities?['steering'] == true;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
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
          attachments: attachments,
          onAttachRecent: onAttachRecent,
          onDictate: !sending && c.connected ? onDictate : null,
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
      return Semantics(
        label: label,
        child: IconButton(
          tooltip: 'Model and effort',
          onPressed: enabled ? () => onSelected('Model') : null,
          icon: const Icon(Icons.tune),
        ),
      );
    },
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
    required this.attachments,
    required this.onAttachRecent,
    required this.onDictate,
  });
  final Session session;
  final Map<String, dynamic> sessionMap;
  final DockClient client;
  final ComposerController composer;
  final bool attachEnabled;
  final ValueChanged<String> onAttach, onLiveControls;
  final VoidCallback? onSend, onTerminalKeys, onDictate;
  final VoidCallback onAttachRecent;
  final AttachmentController attachments;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
    child: IconButtonTheme(
      data: IconButtonThemeData(
        style: IconButton.styleFrom(
          minimumSize: const Size(40, 48),
          maximumSize: const Size(40, 48),
          padding: EdgeInsets.zero,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          foregroundColor: blue,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          IconButton(
            tooltip: 'Terminal keys',
            onPressed: onTerminalKeys,
            icon: const Icon(Icons.keyboard_alt_outlined),
          ),
          SizedBox(
            width: 40,
            height: 48,
            child: PopupMenuButton<String>(
              tooltip: 'Attach',
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 40, minHeight: 48),
              icon: Icon(Icons.add_photo_alternate_outlined, color: blue),
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
          ),
          _ModelEffortMenu(
            client: client,
            session: sessionMap,
            enabled:
                client.connected && !composer.sending && !composer.dictating,
            onSelected: onLiveControls,
          ),
          IconButton(
            tooltip: 'Dictate',
            onPressed: onDictate,
            icon: Icon(composer.dictating ? Icons.mic : Icons.mic_none),
          ),
          Expanded(
            child: ListenableBuilder(
              listenable: composer.focus,
              builder: (context, _) => InputDecorator(
                key: const ValueKey('reply-box'),
                isFocused: composer.focus.hasFocus,
                decoration: InputDecoration(
                  contentPadding: const EdgeInsets.only(left: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide(
                      color: Theme.of(context).dividerColor,
                    ),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide(color: blue),
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          maxHeight: min(
                            MediaQuery.textScalerOf(context).scale(16) *
                                    1.4 *
                                    8.5 +
                                24,
                            max(96, MediaQuery.sizeOf(context).height * .35),
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
                            hintText: session.taskId != null
                                ? 'Worker message'
                                : 'Message',
                            hintMaxLines: 1,
                            contentPadding: const EdgeInsets.symmetric(
                              vertical: 12,
                            ),
                            filled: false,
                            border: InputBorder.none,
                            enabledBorder: InputBorder.none,
                            focusedBorder: InputBorder.none,
                          ),
                        ),
                      ),
                    ),
                    IconButton(
                      key: const ValueKey('latest-image'),
                      tooltip: 'Attach latest phone image',
                      onPressed:
                          attachEnabled &&
                              session.remote == null &&
                              attachments.supported
                          ? onAttachRecent
                          : null,
                      icon: attachments.latestImage?['thumbnail'] is Uint8List
                          ? ClipRRect(
                              borderRadius: BorderRadius.circular(6),
                              child: Image.memory(
                                attachments.latestImage!['thumbnail']
                                    as Uint8List,
                                width: 28,
                                height: 28,
                                fit: BoxFit.cover,
                                gaplessPlayback: true,
                                errorBuilder: (_, _, _) =>
                                    const Icon(Icons.image_outlined),
                              ),
                            )
                          : const Icon(Icons.image_outlined),
                    ),
                  ],
                ),
              ),
            ),
          ),
          SizedBox(
            width: 40,
            height: 48,
            child: Center(
              child: DockSendButton(
                compact: true,
                onPressed: onSend,
                sending: composer.sending,
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
