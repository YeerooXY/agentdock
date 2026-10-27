import 'package:flutter/material.dart';

import 'dock_client.dart';
import 'dock_style.dart';

/// Messages queued on the PC for one agent console, sent one at a time when
/// each turn finishes, plus saved prompts to place in the message box.
class MessageQueueSheet extends StatefulWidget {
  final DockClient client;
  final String draft;
  final TextSelection draftSelection;
  final ValueChanged<String> onUsePrompt;
  final VoidCallback onQueued;
  const MessageQueueSheet({
    super.key,
    required this.client,
    required this.draft,
    this.draftSelection = const TextSelection.collapsed(offset: -1),
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
      session != null &&
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
      await c.request(method, {
        if (method.startsWith('queue.')) 'id': id,
        ...payload,
      });
      if (current) done?.call();
    } catch (failure) {
      if (!mounted) return;
      error = '$failure'.replaceFirst(RegExp(r'^(Bad state|Exception): '), '');
      if (method == 'queue.edit' && current) {
        try {
          await c.refreshQueue();
        } catch (_) {
          // Keep the edit error visible if the connection also failed.
        }
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<T?> textDialog<T>(
    TextEditingController controller,
    WidgetBuilder builder,
  ) async {
    final route = DialogRoute<T>(context: context, builder: builder);
    try {
      final result = await Navigator.of(context).push(route);
      await route.completed;
      return result;
    } finally {
      controller.dispose();
    }
  }

  Future<void> editEntry(Map<String, dynamic> entry) async {
    final controller = TextEditingController(text: '${entry['text']}');
    final text = await textDialog<String>(
      controller,
      (context) => AlertDialog(
        title: const Text('Edit queued message'),
        content: SizedBox(
          width: double.maxFinite,
          child: TextField(
            controller: controller,
            autofocus: true,
            minLines: 4,
            maxLines: 12,
            keyboardType: TextInputType.multiline,
            decoration: const InputDecoration(labelText: 'Message'),
          ),
        ),
        scrollable: true,
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (text != null && current) {
      await run('queue.edit', {'entryId': entry['id'], 'text': text});
    }
  }

  Future<void> savePrompt() async {
    final name = TextEditingController();
    final text = draft, projectId = session?['projectId'];
    var project = false;
    final payload = await textDialog<Map<String, dynamic>>(
      name,
      (context) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Save prompt'),
          scrollable: true,
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: name,
                autofocus: true,
                maxLength: 60,
                decoration: const InputDecoration(labelText: 'Name'),
              ),
              DropdownButtonFormField<bool>(
                initialValue: project,
                decoration: const InputDecoration(labelText: 'Scope'),
                items: [
                  const DropdownMenuItem(
                    value: false,
                    child: Text('This PC'),
                  ),
                  if (projectId != null)
                    const DropdownMenuItem(
                      value: true,
                      child: Text('Current project'),
                    ),
                ],
                onChanged: (value) => update(() => project = value ?? false),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, <String, dynamic>{
                'name': name.text,
                'text': text,
                'scope': project ? 'project' : 'global',
                'projectId': project ? projectId : null,
              }),
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    if (payload != null && current && c.canEditPrompts) {
      await run('prompts.save', payload);
    }
  }

  Future<void> deletePrompt(Map<String, dynamic> prompt) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete saved prompt?'),
        content: Text('${prompt['name']}'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed == true && current && c.canEditPrompts) {
      await run('prompts.remove', {'id': prompt['id']});
    }
  }

  Future<void> usePrompt(Map<String, dynamic> prompt) async {
    final replace = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Use saved prompt'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Replace draft'),
          ),
          FilledButton(
            autofocus: true,
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Insert at cursor'),
          ),
        ],
      ),
    );
    if (replace == null || !current) return;
    final text = '${prompt['text']}';
    final selection = widget.draftSelection;
    final offset = selection.isValid
        ? selection.extentOffset.clamp(0, draft.length).toInt()
        : draft.length;
    widget.onUsePrompt(replace ? text : draft.replaceRange(offset, offset, text));
    if (mounted) Navigator.pop(context);
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
                            onPressed: enabled ? () => editEntry(entry) : null,
                            child: const Text('Edit'),
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
              if (c.canEditPrompts)
                TextButton.icon(
                  onPressed: enabled && draft.trim().isNotEmpty ? savePrompt : null,
                  icon: const Icon(Icons.bookmark_add_outlined),
                  label: const Text('Save draft as prompt'),
                ),
              if (saved.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    c.canEditPrompts
                        ? 'No saved prompts.'
                        : 'Save prompts on your PC from a console\'s queue.',
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
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      TextButton(
                        onPressed: enabled ? () => usePrompt(prompt) : null,
                        child: const Text('Use'),
                      ),
                      if (c.canEditPrompts)
                        IconButton(
                          tooltip: 'Delete prompt ${prompt['name']}',
                          onPressed: enabled ? () => deletePrompt(prompt) : null,
                          icon: const Icon(Icons.delete_outline),
                        ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
