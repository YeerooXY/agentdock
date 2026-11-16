import 'dart:async';

import 'build_counts.dart';

import 'package:flutter/material.dart';

import 'dock_client.dart';
import 'dock_style.dart';
import 'features/projects/project_workspace.dart';

bool canReadProjects(DockClient client) =>
    (client.state['capabilities'] as List? ?? []).contains('projects.read');

class ProjectsPage extends StatefulWidget {
  final DockClient client;
  final VoidCallback onConsoleSelected;
  const ProjectsPage({
    super.key,
    required this.client,
    required this.onConsoleSelected,
  });

  @override
  State<ProjectsPage> createState() => _ProjectsPageState();
}

class _ProjectsPageState extends State<ProjectsPage> {
  static const statuses = {
    'planning': 'Planning',
    'active': 'Active',
    'paused': 'Paused',
    'complete': 'Complete',
    'archived': 'Archived',
  };
  List<dynamic>? projects;
  Map<String, dynamic>? detail;
  String? selected;
  Map<String, dynamic>? knowledgeData;
  int? knowledgeVersion;
  String error = '';
  bool loading = false;
  int serial = 0, knowledgeSerial = 0, readSerial = 0;
  late String pairedPC;
  late int connectionGeneration;
  late bool wasConnected;

  @override
  void initState() {
    super.initState();
    pairedPC = widget.client.activePC;
    connectionGeneration = widget.client.generation;
    wasConnected = widget.client.connected;
    widget.client.addListener(connectionChanged);
    load();
  }

  @override
  void dispose() {
    widget.client.removeListener(connectionChanged);
    super.dispose();
  }

  void connectionChanged() {
    final client = widget.client;
    final pcChanged = pairedPC != client.activePC;
    final generationChanged = connectionGeneration != client.generation;
    final disconnected = wasConnected && !client.connected;
    final reconnected =
        client.connected && (!wasConnected || generationChanged);
    pairedPC = client.activePC;
    connectionGeneration = client.generation;
    wasConnected = client.connected;
    if (!pcChanged && selected != null && detail?['workspace'] == true) {
      final live = (client.state['projects'] as List? ?? [])
          .whereType<Map>()
          .where((project) => project['id'] == selected)
          .firstOrNull;
      if (live != null &&
          live['knowledgeMode'] is String &&
          (live['knowledgeMode'] != knowledgeData?['mode'] ||
              live['knowledgeVersion'] != knowledgeVersion)) {
        knowledgeVersion = live['knowledgeVersion'] as int?;
        knowledgeSerial++;
        readSerial++;
        setState(
          () => knowledgeData = {
            'mode': live['knowledgeMode'] ?? 'off',
            'status': 'idle',
            'items': [],
          },
        );
        if (knowledgeData?['mode'] != 'off' && client.connected) {
          unawaited(loadKnowledge());
        }
      }
    }
    if (pcChanged) {
      serial++;
      knowledgeSerial++;
      readSerial++;
      setState(() {
        selected = null;
        projects = null;
        detail = null;
        loading = false;
        error = 'Connection changed. Refresh projects.';
      });
      return;
    }
    if (generationChanged || disconnected) {
      serial++;
      knowledgeSerial++;
      readSerial++;
      setState(() {
        loading = false;
        if (knowledgeData?['status'] == 'loading') {
          knowledgeData = {...?knowledgeData, 'status': 'idle'};
        }
      });
    }
    if (reconnected && canReadProjects(client)) load();
  }

  Future<void> load() async {
    knowledgeSerial++;
    readSerial++;
    final client = widget.client;
    final request = ++serial,
        pc = client.activePC,
        generation = client.generation;
    setState(() {
      loading = true;
      if (knowledgeData?['status'] == 'loading') {
        knowledgeData = {...?knowledgeData, 'status': 'idle'};
      }
      error = '';
    });
    try {
      if (!canReadProjects(client)) {
        throw StateError('Projects are unavailable on this host.');
      }
      final value = await client.request(
        selected == null ? 'projects.list' : 'projects.detail',
        selected == null ? {} : {'id': selected},
      );
      if (!acceptResponse(request, pc, generation)) return;
      setState(() {
        if (selected == null) {
          projects = value as List;
        } else {
          detail = Map<String, dynamic>.from(value as Map);
          knowledgeData = detail!['knowledge'] is Map
              ? Map<String, dynamic>.from(detail!['knowledge'] as Map)
              : null;
        }
        loading = false;
      });
      if (selected != null && detail?['workspace'] == true) {
        await loadKnowledge();
      }
    } catch (_) {
      if (!acceptResponse(request, pc, generation)) return;
      setState(() {
        loading = false;
        error = selected == null ? 'Could not load projects. Try again.' : 'Could not load project. It may have been archived or removed. Try again.';
      });
    }
  }

  bool acceptResponse(int request, String pc, int generation) {
    if (!mounted || request != serial) return false;
    if (pc != widget.client.activePC ||
        generation != widget.client.generation) {
      connectionChanged();
      return false;
    }
    return true;
  }

  bool acceptContent(
    int request,
    bool knowledge,
    String pc,
    int generation,
    String? id,
  ) {
    if (!mounted ||
        selected != id ||
        request != (knowledge ? knowledgeSerial : readSerial)) {
      return false;
    }
    if (pc != widget.client.activePC ||
        generation != widget.client.generation) {
      connectionChanged();
      return false;
    }
    return true;
  }

  void back() {
    serial++;
    setState(() {
      selected = null;
      detail = null;
      knowledgeData = null;
      error = '';
      loading = false;
    });
    load();
  }

  Future<void> openConsole(String id) async {
    final client = widget.client;
    if (!client.connected ||
        !client.sessions.any((s) => s['id'] == id && s['alive'] == true)) {
      consoleError('This console is no longer open. Refresh the project.');
      return;
    }
    try {
      await client.select(id);
      if (mounted) widget.onConsoleSelected();
    } catch (_) {
      if (mounted) {
        consoleError(
          'Could not open console. Check the connection and try again.',
        );
      }
    }
  }

  void consoleError(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    BuildCounts.hit('projects');
    return _page(context);
  }

  Widget _page(BuildContext context) => PopScope(
    canPop: selected == null,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop && selected != null) back();
    },
    child: RefreshIndicator(
      onRefresh: load,
      child: ListView(
        key: ValueKey(selected),
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          if (selected != null)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: back,
                icon: const Icon(Icons.arrow_back),
                label: const Text('Projects'),
              ),
            ),
          if (loading) const LinearProgressIndicator(),
          if (error.isNotEmpty) ...[
            Text(error),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(onPressed: load, child: const Text('Retry')),
            ),
          ],
          if (selected == null) ...[
            if (projects != null && projects!.isEmpty)
              const Text('No projects.'),
            for (final project in projects ?? []) projectCard(project as Map),
          ] else if (detail != null) ...[
            if (detail!['workspace'] == true) ...[
              ...projectDetail(detail!),
              ProjectWorkspace(
                knowledge: knowledgeData,
                onReadSection: readKnowledge,
                onLoadMore: knowledgeData?['nextCursor'] != null
                    ? () => loadKnowledge(more: true)
                    : null,
              ),
              ExpansionTile(
                title: const Text('Project details'),
                children: projectDetail(detail!),
              ),
            ] else
              ...projectDetail(detail!),
          ],
        ],
      ),
    ),
  );

  Future<void> loadKnowledge({bool more = false}) async {
    if (selected == null ||
        !widget.client.connected ||
        knowledgeData?['mode'] == 'off') {
      return;
    }
    final id = selected,
        request = ++knowledgeSerial,
        pc = widget.client.activePC,
        generation = widget.client.generation;
    final previous = knowledgeData;
    setState(
      () =>
          knowledgeData = {...?knowledgeData, 'status': 'loading', 'error': ''},
    );
    try {
      final value = Map<String, dynamic>.from(
        await widget.client.request('projects.knowledge', {
          'id': id,
          if (more) 'cursor': previous?['nextCursor'],
        }) as Map,
      );
      if (!acceptContent(request, true, pc, generation, id) || selected != id) {
        return;
      }
      setState(
        () => knowledgeData = {
          ...value,
          'status': 'ready',
          if (more && value['mode'] != 'off')
            'items': [
              ...previous?['items'] as List? ?? [],
              ...value['items'] as List? ?? [],
            ],
        },
      );
    } catch (_) {
      if (acceptContent(request, true, pc, generation, id) && selected == id) {
        setState(
          () => knowledgeData = {
            ...?previous,
            'status': 'error',
            'error': 'Could not read knowledge. Refresh the project to retry.',
          },
        );
      }
    }
  }

  Future<void> readKnowledge(String id) async {
    await readText('projects.knowledge.read', {
      'id': selected,
      'ids': [id],
      'revision': knowledgeData?['revision'],
    }, 'Project knowledge');
  }

  Future<void> readText(
    String method,
    Map<String, dynamic> payload,
    String title,
  ) async {
    final id = selected,
        request = ++readSerial,
        pc = widget.client.activePC,
        generation = widget.client.generation;
    try {
      final value = Map<String, dynamic>.from(
        await widget.client.request(method, payload) as Map,
      );
      if (!acceptContent(request, false, pc, generation, id) ||
          selected != id) {
        return;
      }
      final text = (value['items'] as List? ?? []).isEmpty
          ? 'This section is unavailable within the reading limit.'
          : '${value['items'][0]['recorded']['summary']}\n\nStored interpretation. Source freshness and semantic claims are unverified.';
      if (!mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => Scaffold(
            appBar: AppBar(title: Text(title)),
            body: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: SelectableText(text),
            ),
          ),
        ),
      );
    } catch (_) {
      if (acceptContent(request, false, pc, generation, id)) {
        consoleError(
          'Could not read this item. Check the connection and refresh the project.',
        );
      }
    }
  }

  Widget heading(String text) => Padding(
    padding: const EdgeInsets.only(top: 20, bottom: 8),
    child: Text(text, style: Theme.of(context).textTheme.titleMedium),
  );

  Widget projectTitle(Map project) {
    final hex = '${project['color'] ?? ''}'.replaceFirst('#', '');
    final color = hex.length == 6 ? int.tryParse(hex, radix: 16) : null;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 6, right: 10),
          child: CircleAvatar(
            radius: 6,
            backgroundColor: color == null ? blue : Color(0xff000000 | color),
          ),
        ),
        Expanded(
          child: Text(
            '${project['name']}',
            style: Theme.of(context).textTheme.titleLarge,
          ),
        ),
      ],
    );
  }

  Widget projectCard(Map project) => Card(
    margin: const EdgeInsets.only(bottom: 12),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: () {
        setState(() {
          selected = project['id'] as String;
          detail = null;
          knowledgeData = null;
        });
        load();
      },
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            projectTitle(project),
            const SizedBox(height: 8),
            Text(statuses[project['status']] ?? '${project['status']}'),
          ],
        ),
      ),
    ),
  );

  List<Widget> projectDetail(Map project) => [
    projectTitle(project),
    Text(statuses[project['status']] ?? '${project['status']}'),
    heading('Linked consoles'),
    if ((project['consoles'] as List? ?? []).isEmpty)
      const Text('No live consoles.'),
    for (final console in project['consoles'] as List? ?? [])
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton(
          onPressed: () => openConsole(console['id'] as String),
          child: Text('${console['name']}'),
        ),
      ),
  ];
}
