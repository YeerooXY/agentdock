import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'agent_identity.dart';
import 'dock_client.dart';
import 'dock_style.dart';

class NewConsoleSheet extends StatefulWidget {
  final DockClient client;
  const NewConsoleSheet({super.key, required this.client});
  @override
  State<NewConsoleSheet> createState() => _NewConsoleSheetState();
}

class _NewConsoleSheetState extends State<NewConsoleSheet> {
  final name = TextEditingController();
  String? agent;
  String error = '';
  String folder = '';
  List<Map<String, dynamic>> agents = [];
  bool loading = true;
  late final pc = widget.client.activePC;
  late final generation = widget.client.generation;
  bool get current =>
      widget.client.connected &&
      widget.client.foreground &&
      widget.client.activePC == pc &&
      widget.client.generation == generation;
  bool get supported => (widget.client.state['capabilities'] as List? ?? [])
      .contains('console.agents');

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    if (!supported) {
      setState(() => loading = false);
      return;
    }
    try {
      final result = await widget.client.request('console.agents');
      if (!mounted || !current) return;
      setState(() {
        agents = (result['agents'] as List).cast<Map<String, dynamic>>();
        folder = result['defaultFolder'] as String? ?? '';
        loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          loading = false;
          error = 'Could not load agents. Close this panel and try again.';
        });
      }
    }
  }

  @override
  void dispose() {
    name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.client,
    builder: (context, _) => SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'New console',
              style: TextStyle(color: pink, fontSize: 22),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: name,
              maxLength: 64,
              decoration: const InputDecoration(labelText: 'Name (optional)'),
            ),
            if (loading) const LinearProgressIndicator(),
            if (!supported)
              const Text(
                'Uses your PC default. Update Dock on the PC to choose an agent here.',
                style: TextStyle(color: muted),
              ),
            if (supported && !loading)
              DropdownButtonFormField<String>(
                initialValue: '',
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Agent'),
                items: [
                  const DropdownMenuItem(value: '', child: Text('PC default')),
                  for (final entry in agents.where(
                    (entry) => entry['installed'] == true,
                  ))
                    DropdownMenuItem(
                      value: entry['id'] as String,
                      enabled: entry['installed'] == true,
                      child: Text(
                        '${entry['name']}${entry['installed'] == true ? '' : ' · not installed'}',
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: entry['installed'] == true
                              ? AgentIdentity.of(entry['id'] as String).color
                              : muted,
                        ),
                      ),
                    ),
                ],
                onChanged: current
                    ? (value) => setState(() => agent = value)
                    : null,
              ),
            if (error.isNotEmpty || !current)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  current ? error : 'Connection changed. Reopen New console.',
                  style: const TextStyle(color: pink),
                ),
              ),
            const SizedBox(height: 16),
            if (folder.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Text(
                  'Folder: $folder',
                  style: const TextStyle(color: muted),
                ),
              ),
            FilledButton(
              onPressed: current && !loading && error.isEmpty
                  ? () => Navigator.pop(context, {
                      'name': name.text.trim(),
                      if (agent?.isNotEmpty == true) 'agent': agent,
                    })
                  : null,
              child: const Text('Open'),
            ),
          ],
        ),
      ),
    ),
  );
}

class ConsoleFilesSheet extends StatefulWidget {
  final DockClient client;
  final String sessionId;
  const ConsoleFilesSheet({
    super.key,
    required this.client,
    required this.sessionId,
  });
  @override
  State<ConsoleFilesSheet> createState() => _ConsoleFilesSheetState();
}

class _ConsoleFilesSheetState extends State<ConsoleFilesSheet> {
  final query = TextEditingController();
  String directory = '', error = '';
  List<Map<String, dynamic>> entries = [];
  bool loading = false, truncated = false;
  int revision = 0;
  Timer? debounce;
  late final pc = widget.client.activePC;
  late final generation = widget.client.generation;
  bool get current =>
      widget.client.connected &&
      widget.client.foreground &&
      widget.client.activePC == pc &&
      widget.client.selected == widget.sessionId &&
      widget.client.generation == generation &&
      widget.client.sessions.any((s) => s['id'] == widget.sessionId);

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    final request = ++revision;
    if (!current) return;
    setState(() {
      loading = true;
      error = '';
    });
    try {
      final result = await widget.client.request('console.files', {
        'id': widget.sessionId,
        'directory': directory,
        'query': query.text,
      });
      if (!mounted || !current || request != revision) return;
      setState(() {
        entries = (result['entries'] as List).cast<Map<String, dynamic>>();
        truncated = result['truncated'] == true;
        loading = false;
      });
    } catch (_) {
      if (mounted && request == revision) {
        setState(() {
          loading = false;
          error = 'Could not list this folder. Retry or choose its parent.';
        });
      }
    }
  }

  void navigate(String value) {
    debounce?.cancel();
    setState(() {
      directory = value;
      query.clear();
    });
    load();
  }

  @override
  void dispose() {
    debounce?.cancel();
    query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.client,
    builder: (context, _) => SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          16,
          0,
          16,
          MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Files',
                    style: const TextStyle(color: pink, fontSize: 22),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  tooltip: 'Close files',
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            TextField(
              controller: query,
              enabled: current,
              decoration: const InputDecoration(
                labelText: 'Filter this folder',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (_) {
                debounce?.cancel();
                ++revision; // Ignore an earlier listing while the query changes.
                debounce = Timer(const Duration(milliseconds: 350), load);
              },
            ),
            Row(
              children: [
                IconButton(
                  tooltip: 'Parent folder',
                  onPressed: current && !loading && directory.isNotEmpty
                      ? () => navigate(
                          directory
                              .split('/')
                              .take(directory.split('/').length - 1)
                              .join('/'),
                        )
                      : null,
                  icon: const Icon(Icons.arrow_upward),
                ),
                Expanded(
                  child: Text(
                    directory.isEmpty ? 'Working folder' : directory,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: muted),
                  ),
                ),
              ],
            ),
            if (loading) const LinearProgressIndicator(),
            if (!current || error.isNotEmpty)
              ListTile(
                title: Text(
                  !current ? 'Console changed. Reopen Files.' : error,
                ),
                trailing: current
                    ? IconButton(
                        onPressed: load,
                        tooltip: 'Retry files',
                        icon: const Icon(Icons.refresh),
                      )
                    : null,
              ),
            if (truncated && !loading)
              const Text(
                'Showing a limited list. Filter by name.',
                style: TextStyle(color: muted),
              ),
            Expanded(
              child: ListView(
                children: [
                  if (!loading && error.isEmpty && entries.isEmpty)
                    const ListTile(title: Text('No matching files')),
                  for (final entry in entries)
                    ListTile(
                      enabled: current && !loading && error.isEmpty,
                      leading: Icon(
                        entry['directory'] == true
                            ? Icons.folder_outlined
                            : Icons.insert_drive_file_outlined,
                        color: blue,
                      ),
                      title: Text(
                        entry['name'] as String,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: entry['directory'] == true
                          ? const Icon(Icons.chevron_right)
                          : null,
                      onTap: current && !loading && error.isEmpty
                          ? () => entry['directory'] == true
                                ? navigate(entry['path'] as String)
                                : Navigator.pop(
                                    context,
                                    entry['path'] as String,
                                  )
                          : null,
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

class ConsoleCopySheet extends StatelessWidget {
  final String text;
  const ConsoleCopySheet({super.key, required this.text});
  @override
  Widget build(BuildContext context) => SafeArea(
    child: Column(
      children: [
        ListTile(
          title: const Text('Copy text'),
          trailing: TextButton(
            onPressed: text.isEmpty
                ? null
                : () async {
                    await Clipboard.setData(ClipboardData(text: text));
                    if (context.mounted) {
                      ScaffoldMessenger.of(
                        context,
                      ).showSnackBar(const SnackBar(content: Text('Copied')));
                    }
                  },
            child: const Text('Copy all'),
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: SelectableText(
                text,
                style: const TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 16,
                  height: 1.45,
                ),
              ),
            ),
          ),
        ),
      ],
    ),
  );
}
