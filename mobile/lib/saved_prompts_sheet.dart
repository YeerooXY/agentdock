import 'package:flutter/material.dart';

import 'dock_client.dart';
import 'dock_style.dart';

/// Saved prompts for the selected console. Using one only edits its draft.
class SavedPromptsSheet extends StatefulWidget {
  final DockClient client;
  final String draft;
  final TextSelection draftSelection;
  final void Function(String text, int cursorOffset) onUsePrompt;
  const SavedPromptsSheet({
    super.key,
    required this.client,
    required this.draft,
    this.draftSelection = const TextSelection.collapsed(offset: -1),
    required this.onUsePrompt,
  });

  @override
  State<SavedPromptsSheet> createState() => _SavedPromptsSheetState();
}

class _SavedPromptsSheetState extends State<SavedPromptsSheet> {
  DockClient get c => widget.client;
  late final id = c.selected, pc = c.activePC, generation = c.generation;
  late String draft = widget.draft;
  bool busy = false;
  String error = '';
  final errorKey = GlobalKey();

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
      await c.request(method, {...payload});
      done?.call();
    } catch (failure) {
      if (!mounted) return;
      error = '$failure'.replaceFirst(RegExp(r'^(Bad state|Exception): '), '');
    } finally {
      if (mounted) {
        setState(() => busy = false);
        if (error.isNotEmpty) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            final target = errorKey.currentContext;
            if (mounted && target != null) {
              Scrollable.ensureVisible(
                target,
                alignment: .5,
                duration: const Duration(milliseconds: 200),
              );
            }
          });
        }
      }
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

  Future<void> savePrompt() async {
    final name = TextEditingController();
    final text = draft, projectId = session?['projectId'];
    String? projectName = session?['projectName'] as String?;
    if (projectId != null && projectName == null) {
      var projects = c.state['projects'] as List? ?? [];
      if (!projects.any((p) => p['id'] == projectId)) {
        try {
          final choices = await c.request('console.agents');
          if (choices is Map) projects = choices['projects'] as List? ?? [];
        } catch (_) {
          // The project scope still works if its display name is unavailable.
        }
      }
      projectName =
          projects.where((p) => p['id'] == projectId).firstOrNull?['name']
              as String?;
    }
    if (!current) {
      name.dispose();
      return;
    }
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
                  const DropdownMenuItem(value: false, child: Text('This PC')),
                  if (projectId != null)
                    DropdownMenuItem(
                      value: true,
                      child: Text(projectName ?? 'Current project'),
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
            ValueListenableBuilder<TextEditingValue>(
              valueListenable: name,
              builder: (context, value, _) => FilledButton(
                onPressed: value.text.trim().isEmpty
                    ? null
                    : () => Navigator.pop(context, <String, dynamic>{
                        'name': name.text,
                        'text': text,
                        'scope': project ? 'project' : 'global',
                        'projectId': project ? projectId : null,
                      }),
                child: const Text('Save'),
              ),
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
    final start = selection.isValid
        ? selection.start.clamp(0, draft.length).toInt()
        : draft.length;
    final end = selection.isValid
        ? selection.end.clamp(start, draft.length).toInt()
        : draft.length;
    widget.onUsePrompt(
      replace ? text : draft.replaceRange(start, end, text),
      replace ? text.length : start + text.length,
    );
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final enabled = current && !busy;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          16,
          0,
          16,
          MediaQuery.viewInsetsOf(context).bottom + 16,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Saved prompts', style: TextStyle(fontSize: 18)),
              if (error.isNotEmpty)
                Text(
                  error,
                  key: errorKey,
                  style: TextStyle(color: pink),
                ),
              if (c.canEditPrompts)
                TextButton.icon(
                  onPressed: enabled && draft.trim().isNotEmpty
                      ? savePrompt
                      : null,
                  icon: const Icon(Icons.bookmark_add_outlined),
                  label: const Text('Save draft as prompt'),
                ),
              if (prompts.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Text('No saved prompts.'),
                ),
              for (final prompt in prompts)
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
                          onPressed: enabled
                              ? () => deletePrompt(prompt)
                              : null,
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
