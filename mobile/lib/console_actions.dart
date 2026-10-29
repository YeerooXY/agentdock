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
  String project = '', host = '', model = '';
  int folderIndex = 0, modelRevision = 0;
  bool modelLoading = false, chooseModel = false, worktree = false, repositoryRoot = false;
  int rootRevision = 0;
  List<Map<String, dynamic>> projects = [], hosts = [], models = [];
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
        projects = (result['projects'] as List? ?? [])
            .cast<Map<String, dynamic>>();
        hosts = (result['hosts'] as List? ?? []).cast<Map<String, dynamic>>();
        final preferred = result['defaultProvider'] as String? ?? '';
        if (agents.any((a) => a['id'] == preferred && a['installed'] == true)) {
          agent = preferred;
        }
        folder = result['defaultFolder'] as String? ?? '';
        loading = false;
      });
      await Future.wait([loadModels(), loadRoot()]);
    } catch (_) {
      if (mounted) {
        setState(() {
          loading = false;
          error = 'Could not load agents. Close this panel and try again.';
        });
      }
    }
  }

  Future<void> loadRoot() async {
    final revision = ++rootRevision;
    setState(() { repositoryRoot = false; worktree = false; });
    if (host.isNotEmpty || !(widget.client.state['capabilities'] as List? ?? []).contains('console.worktree')) return;
    try {
      final result = await widget.client.request('console.worktree.root', {
        if (project.isNotEmpty) ...{'projectId': project, 'folderIndex': folderIndex},
      });
      if (mounted && current && revision == rootRevision) {
        setState(() => repositoryRoot = result['root'] == true);
      }
    } catch (_) {
      // An unavailable or unverified folder cannot enable the option.
    }
  }

  Future<void> loadModels() async {
    final revision = ++modelRevision;
    setState(() {
      models = [];
      model = '';
      modelLoading = agent == 'codex' && host.isEmpty;
    });
    if (!modelLoading) return;
    try {
      final result = await widget.client.request('console.models', {
        'provider': agent,
      });
      if (mounted && current && revision == modelRevision) {
        setState(
          () => models = (result['models'] as List? ?? [])
              .cast<Map<String, dynamic>>(),
        );
      }
    } catch (_) {
      // Older PCs and CLIs can still use the live picker after opening.
    } finally {
      if (mounted && revision == modelRevision) {
        setState(() => modelLoading = false);
      }
    }
  }

  List<Map<String, dynamic>> get availableAgents {
    if (host.isEmpty) {
      return agents.where((a) => a['installed'] == true).toList();
    }
    final saved = hosts.where((h) => h['id'] == host).firstOrNull;
    return [
      {'id': 'shell', 'name': 'Linux shell', 'installed': true},
      for (final a in agents)
        if ((saved?['agents'] as List? ?? []).contains(a['id']))
          {...a, 'installed': true},
    ];
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
            Text('New console', style: TextStyle(color: pink, fontSize: 22)),
            const SizedBox(height: 16),
            if (hosts.isNotEmpty) ...[
              DropdownButtonFormField<String>(
                initialValue: host,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Computer'),
                items: [
                  const DropdownMenuItem(value: '', child: Text('This PC')),
                  for (final h in hosts)
                    DropdownMenuItem(
                      value: h['id'] as String,
                      child: Text('${h['name']} \u00b7 SSH'),
                    ),
                ],
                onChanged: current
                    ? (value) {
                        setState(() {
                          host = value!;
                          agent = host.isEmpty ? null : 'shell';
                          chooseModel = false;
                        });
                        loadModels();
                        loadRoot();
                      }
                    : null,
              ),
              const SizedBox(height: 12),
            ],
            if (projects.isNotEmpty) ...[
              DropdownButtonFormField<String>(
                initialValue: project,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Project'),
                items: [
                  const DropdownMenuItem(
                    value: '',
                    child: Text('No project \u00b7 default folder'),
                  ),
                  for (final p in projects)
                    DropdownMenuItem(
                      value: p['id'] as String,
                      child: Text(
                        p['name'] as String,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
                onChanged: current
                    ? (value) {
                        setState(() { project = value!; folderIndex = 0; });
                        loadRoot();
                      }
                    : null,
              ),
              const SizedBox(height: 12),
              if (host.isEmpty && project.isNotEmpty)
                DropdownButtonFormField<int>(
                  key: ValueKey(project),
                  initialValue: folderIndex,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Project folder',
                  ),
                  items: [
                    for (final entry
                        in (projects.firstWhere(
                                  (p) => p['id'] == project,
                                )['folders']
                                as List)
                            .indexed)
                      DropdownMenuItem(
                        value: entry.$1,
                        child: Text(
                          '${entry.$2['label'] == '' ? entry.$2['path'] : entry.$2['label']}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                  ],
                  onChanged: current
                      ? (value) { setState(() => folderIndex = value!); loadRoot(); }
                      : null,
                ),
              const SizedBox(height: 12),
            ],
            if (repositoryRoot && host.isEmpty)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Isolated worktree'),
                subtitle: const Text('Works on a new branch in its own folder. Your current files stay untouched.'),
                value: worktree,
                onChanged: current ? (value) => setState(() => worktree = value) : null,
              ),
            TextField(
              controller: name,
              maxLength: 64,
              decoration: const InputDecoration(labelText: 'Name (optional)'),
            ),
            if (loading) const LinearProgressIndicator(),
            if (!supported)
              const Text(
                'Uses your PC default. Update Paddock on the PC to choose an agent here.',
                style: TextStyle(color: muted),
              ),
            if (supported && !loading)
              DropdownButtonFormField<String>(
                key: ValueKey('$host:$agent'),
                initialValue: agent ?? '',
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Agent'),
                items: [
                  if (host.isEmpty)
                    const DropdownMenuItem(
                      value: '',
                      child: Text('PC default'),
                    ),
                  for (final entry in availableAgents)
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
                    ? (value) {
                        setState(() {
                          agent = value;
                          chooseModel = false;
                        });
                        loadModels();
                      }
                    : null,
              ),
            if (modelLoading) const LinearProgressIndicator(),
            if (models.isNotEmpty) ...[
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                key: ValueKey('models:$agent:$modelRevision'),
                initialValue: '',
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Model'),
                items: [
                  const DropdownMenuItem(
                    value: '',
                    child: Text('Agent default'),
                  ),
                  for (final m in models)
                    DropdownMenuItem(
                      value: m['id'] as String,
                      child: Text(
                        m['name'] as String,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
                onChanged: current
                    ? (value) => setState(() => model = value!)
                    : null,
              ),
            ],
            if (['codex', 'claude', 'opencode', 'gemini'].contains(agent))
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Choose model in the live menu'),
                value: chooseModel,
                onChanged: current
                    ? (value) => setState(() => chooseModel = value!)
                    : null,
              ),
            if (error.isNotEmpty || !current)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  current ? error : 'Connection changed. Reopen New console.',
                  style: TextStyle(color: pink),
                ),
              ),
            const SizedBox(height: 16),
            if (folder.isNotEmpty && project.isEmpty && host.isEmpty)
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
                      if (project.isNotEmpty) ...{
                        'projectId': project,
                        'folderIndex': folderIndex,
                      },
                      if (host.isNotEmpty) 'hostId': host,
                      if (model.isNotEmpty) 'model': model,
                      'chooseModel': chooseModel,
                      if (worktree && repositoryRoot && host.isEmpty) 'worktree': true,
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
                    style: TextStyle(color: pink, fontSize: 22),
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
