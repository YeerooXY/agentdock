import 'package:flutter/material.dart';

import 'dock_client.dart';
import 'dock_style.dart';

/// Messages queued on the PC for one agent console, sent one at a time when
/// each turn finishes, plus saved prompts to place in the message box.
class MessageQueueSheet extends StatefulWidget {
  final DockClient client;
  final String draft;
  final ValueChanged<String> onUsePrompt;
  final VoidCallback onQueued;
  const MessageQueueSheet({
    super.key,
    required this.client,
    required this.draft,
    required this.onUsePrompt,
    required this.onQueued,
  });

  @override
  State<MessageQueueSheet> createState() => _MessageQueueSheetState();
}

class _MessageQueueSheetState extends State<MessageQueueSheet> {
  DockClient get c => widget.client;
  late final id = c.selected, pc = c.activePC, generation = c.generation;
  late String draft = widget.draft;
  bool busy = false;
  String error = '';

  Map<String, dynamic>? get session =>
      c.sessions.where((s) => s['id'] == id).firstOrNull;
  bool get current =>
      mounted &&
      c.connected &&
      c.activePC == pc &&
      c.selected == id &&
      c.generation == generation &&
      session?['alive'] != false;
  Map<String, dynamic> get queue =>
      ((c.state['queues'] as Map?)?[id] as Map?)?.cast<String, dynamic>() ??
      const {'paused': false, 'entries': []};
  List<Map<String, dynamic>> get entries =>
      (queue['entries'] as List? ?? []).cast<Map<String, dynamic>>();
  List<Map<String, dynamic>> get prompts => (c.state['prompts'] as List? ?? [])
      .cast<Map<String, dynamic>>()
      .where(
        (p) =>
            p['projectId'] == null || p['projectId'] == session?['projectId'],
      )
      .toList();

  @override
  void initState() {
    super.initState();
    c.addListener(changed);
  }

  void changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    c.removeListener(changed);
    super.dispose();
  }

  Future<void> run(
    String method,
    Map<String, dynamic> payload, [
    VoidCallback? done,
  ]) async {
    if (!current || busy) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await c.request(method, {'id': id, ...payload});
      done?.call();
    } catch (failure) {
      error = '$failure'.replaceFirst(RegExp(r'^(Bad state|Exception): '), '');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final list = entries, saved = prompts, paused = queue['paused'] == true;
    final enabled = current && !busy;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * .9,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Queue',
                      style: TextStyle(fontSize: 22, color: pink),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close queue',
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              Text(
                '${session?['name'] ?? 'Console'}',
                style: const TextStyle(fontSize: 16),
              ),
              Text(
                paused ? 'Paused. Nothing is sent automatically.' : 'Sent one at a time, each after the agent finishes a turn.',
                style: const TextStyle(color: muted),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: enabled && draft.trim().isNotEmpty
                    ? () => run('queue.add', {'text': draft}, () {
                        widget.onQueued();
                        setState(() => draft = '');
                      })
                    : null,
                icon: const Icon(Icons.playlist_add),
                label: const Text('Queue the message box text'),
              ),
              if (draft.trim().isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 6),
                  child: Text(
                    'Type in the message box first.',
                    style: TextStyle(color: muted, fontSize: 13),
                  ),
                ),
              if (error.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(error, style: TextStyle(color: pink)),
                ),
              const SizedBox(height: 8),
              if (list.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    'No queued messages.',
                    style: TextStyle(color: muted),
                  ),
                ),
              for (final (index, entry) in list.indexed)
                Container(
                  key: ValueKey(entry['id']),
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(
                    border: Border(
                      top: BorderSide(color: blue.withValues(alpha: .2)),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${index + 1}. ${entry['text']}',
                        maxLines: 4,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Wrap(
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          IconButton(
                            tooltip: 'Move message ${index + 1} up',
                            onPressed: enabled && index > 0
                                ? () => run('queue.move', {
                                    'entryId': entry['id'],
                                    'offset': -1,
                                  })
                                : null,
                            icon: const Icon(Icons.keyboard_arrow_up),
                          ),
                          IconButton(
                            tooltip: 'Move message ${index + 1} down',
                            onPressed: enabled && index < list.length - 1
                                ? () => run('queue.move', {
                                    'entryId': entry['id'],
                                    'offset': 1,
                                  })
                                : null,
                            icon: const Icon(Icons.keyboard_arrow_down),
                          ),
                          TextButton(
                            onPressed: enabled
                                ? () => run('queue.send', {
                                    'entryId': entry['id'],
                                  })
                                : null,
                            child: const Text('Send now'),
                          ),
                          IconButton(
                            tooltip: 'Remove message ${index + 1}',
                            onPressed: enabled
                                ? () => run('queue.remove', {
                                    'entryId': entry['id'],
                                  })
                                : null,
                            icon: const Icon(Icons.delete_outline),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              if (list.isNotEmpty || paused)
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Pause sending'),
                  value: paused,
                  onChanged: enabled
                      ? (value) => run('queue.pause', {'paused': value})
                      : null,
                ),
              const SizedBox(height: 8),
              Text(
                'Saved prompts',
                style: TextStyle(fontSize: 18, color: blue),
              ),
              if (saved.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    'Save prompts on your PC from a console\'s queue.',
                    style: TextStyle(color: muted),
                  ),
                ),
              for (final prompt in saved)
                ListTile(
                  key: ValueKey('prompt-${prompt['id']}'),
                  contentPadding: EdgeInsets.zero,
                  title: Text('${prompt['name']}'),
                  subtitle: Text(
                    '${prompt['text']}',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: TextButton(
                    onPressed: () {
                      widget.onUsePrompt('${prompt['text']}');
                      Navigator.pop(context);
                    },
                    child: const Text('Use'),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
