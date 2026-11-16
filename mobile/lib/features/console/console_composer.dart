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

/// Whether the PC can apply a model or effort change to this console by
/// resuming it (switchMethod 'resume'); older PCs omit the field.
bool _canSwitchModel(Map<String, dynamic> session) {
  final provider = (session['provider'] as String).toLowerCase();
  final method =
      session['switchMethod'] as String? ??
      (['claude', 'codex'].contains(provider) ? 'resume' : 'none');
  return method == 'resume' && session['taskId'] == null;
}

/// One rounded field, like a messenger: a + button at the bottom left opens
/// attachments, terminal keys, dictation and model controls; the text grows to
/// four lines; the right side shows the microphone until something is typed,
/// then the send button.
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

  Future<void> _more(BuildContext context) async {
    final local = session.remote == null;
    final thumbnail = attachments.latestImage?['thumbnail'];
    final modelEnabled =
        client.connected && !composer.sending && !composer.dictating;
    final selection = client.agentSelection(sessionMap['id'] as String);
    final modelText = [
      selection.model == null ? 'Current model' : modelLabel(selection.model!),
      if (selection.effort != null) effortLabel(selection.effort!),
      if (selection.pending) '(selected)',
    ].join('  ');
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        ListTile item(
          String value,
          Widget icon,
          String title, {
          bool enabled = true,
          Key? key,
          String? subtitle,
        }) => ListTile(
          key: key,
          leading: icon,
          iconColor: blue,
          title: Text(title),
          subtitle: subtitle == null ? null : Text(subtitle),
          enabled: enabled,
          onTap: () => Navigator.pop(context, value),
        );
        return SafeArea(
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (local && attachments.supported)
                  item(
                    'latest',
                    thumbnail is Uint8List
                        ? ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: Image.memory(
                              thumbnail,
                              width: 40,
                              height: 40,
                              fit: BoxFit.cover,
                              gaplessPlayback: true,
                              errorBuilder: (_, _, _) =>
                                  const Icon(Icons.image_outlined),
                            ),
                          )
                        : const Icon(Icons.image_outlined),
                    'Latest phone image',
                    enabled: attachEnabled,
                    key: const ValueKey('latest-image'),
                  ),
                if (local)
                  item(
                    'image',
                    const Icon(Icons.add_photo_alternate_outlined),
                    'Image',
                    enabled: attachEnabled,
                  ),
                item(
                  'files',
                  const Icon(Icons.attach_file),
                  'Files',
                  enabled: attachEnabled,
                ),
                item(
                  'keys',
                  const Icon(Icons.keyboard_alt_outlined),
                  'Terminal keys',
                  enabled: onTerminalKeys != null,
                ),
                item(
                  'dictate',
                  const Icon(Icons.mic_none),
                  'Dictate',
                  enabled: onDictate != null,
                ),
                if (_canSwitchModel(sessionMap))
                  item(
                    'model',
                    const Icon(Icons.tune),
                    'Model and effort',
                    enabled: modelEnabled,
                    subtitle: modelText,
                  ),
              ],
            ),
          ),
        );
      },
    );
    switch (choice) {
      case 'latest':
        onAttachRecent();
      case 'image' || 'files':
        onAttach(choice!);
      case 'keys':
        onTerminalKeys?.call();
      case 'dictate':
        onDictate?.call();
      case 'model':
        onLiveControls('Model');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final still = MediaQuery.disableAnimationsOf(context);
    final showSend =
        composer.sending || composer.editor.text.trim().isNotEmpty;
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
      child: IconButtonTheme(
        data: IconButtonThemeData(
          style: IconButton.styleFrom(
            minimumSize: const Size(40, 40),
            maximumSize: const Size(40, 40),
            padding: EdgeInsets.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            foregroundColor: blue,
          ),
        ),
        child: ListenableBuilder(
          listenable: composer.focus,
          builder: (context, _) => AnimatedContainer(
            key: const ValueKey('reply-box'),
            duration: still ? Duration.zero : const Duration(milliseconds: 180),
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHigh,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: composer.focus.hasFocus ? blue : theme.dividerColor,
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                IconButton(
                  key: const ValueKey('composer-more'),
                  tooltip: 'More actions',
                  onPressed: () => _more(context),
                  icon: const Icon(Icons.add_circle_outline),
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: TextField(
                    controller: composer.editor,
                    scrollController: composer.scroll,
                    focusNode: composer.focus,
                    onChanged: (_) => composer.edited(),
                    minLines: 1,
                    maxLines: 4,
                    style: const TextStyle(fontSize: 16, height: 1.4),
                    textInputAction: TextInputAction.newline,
                    autocorrect: false,
                    enableSuggestions: false,
                    decoration: InputDecoration(
                      hintText: session.taskId != null
                          ? 'Worker message'
                          : 'Message',
                      hintMaxLines: 1,
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(vertical: 10),
                      filled: false,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                    ),
                  ),
                ),
                const SizedBox(width: 4),
                AnimatedSwitcher(
                  duration: still
                      ? Duration.zero
                      : const Duration(milliseconds: 160),
                  transitionBuilder: (child, animation) => FadeTransition(
                    opacity: animation,
                    child: ScaleTransition(scale: animation, child: child),
                  ),
                  child: showSend
                      ? SizedBox(
                          key: const ValueKey('composer-send'),
                          width: 40,
                          height: 40,
                          child: Center(
                            child: DockSendButton(
                              compact: true,
                              onPressed: onSend,
                              sending: composer.sending,
                            ),
                          ),
                        )
                      : IconButton(
                          key: const ValueKey('composer-dictate'),
                          tooltip: 'Dictate',
                          onPressed: onDictate,
                          icon: Icon(
                            composer.dictating ? Icons.mic : Icons.mic_none,
                          ),
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
