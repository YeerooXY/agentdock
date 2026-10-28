import 'package:flutter/material.dart';

import 'dock_client.dart';
import 'dock_style.dart';

bool canReadProjects(DockClient client) =>
    (client.state['capabilities'] as List? ?? []).contains('projects.read');

class ProjectsPage extends StatefulWidget {
  final DockClient client;
  final VoidCallback onConsoleSelected;
  const ProjectsPage({super.key, required this.client, required this.onConsoleSelected});

  @override
  State<ProjectsPage> createState() => _ProjectsPageState();
}

class _ProjectsPageState extends State<ProjectsPage> {
  static const sectionNames = {
    'brief': 'Brief', 'research': 'Research',
    'infrastructure': 'Setup', 'roadmap': 'Roadmap',
  };
  static const planStates = {
    'approved': 'Approved', 'proposal waiting': 'Proposal waiting',
    'not needed': 'Not needed', 'empty': 'Empty',
  };
  List<dynamic>? projects;
  Map<String, dynamic>? detail;
  String? selected;
  String error = '';
  bool loading = false;
  int serial = 0;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    final client = widget.client;
    final request = ++serial, pc = client.activePC, generation = client.generation;
    setState(() { loading = true; error = ''; });
    try {
      if (!canReadProjects(client)) throw StateError('Projects are unavailable on this host.');
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
        }
        loading = false;
      });
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
    if (pc != widget.client.activePC || generation != widget.client.generation) {
      setState(() {
        loading = false;
        projects = null;
        detail = null;
        error = 'Connection changed. Refresh projects.';
      });
      return false;
    }
    return true;
  }

  void back() {
    serial++;
    setState(() { selected = null; detail = null; error = ''; loading = false; });
    load();
  }

  Future<void> openConsole(String id) async {
    final client = widget.client;
    if (!client.connected || !client.sessions.any((s) => s['id'] == id && s['alive'] == true)) {
      setState(() => error = 'This console is no longer open. Refresh the project.');
      return;
    }
    try {
      await client.select(id);
      if (mounted) widget.onConsoleSelected();
    } catch (_) {
      if (mounted) setState(() => error = 'Could not open console. Check the connection and try again.');
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: selected == null,
    onPopInvokedWithResult: (didPop, _) { if (!didPop && selected != null) back(); },
    child: RefreshIndicator(
      onRefresh: load,
      child: ListView(
        key: ValueKey(selected),
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          if (selected != null)
            Align(alignment: Alignment.centerLeft, child: TextButton.icon(
              onPressed: back, icon: const Icon(Icons.arrow_back), label: const Text('Projects'),
            )),
          if (loading) const LinearProgressIndicator(),
          if (error.isNotEmpty) ...[
            Text(error),
            Align(alignment: Alignment.centerLeft, child: TextButton(onPressed: load, child: const Text('Retry'))),
          ] else if (selected == null) ...[
            if (projects != null && projects!.isEmpty) const Text('No projects.'),
            for (final project in projects ?? []) projectCard(project as Map),
          ] else if (detail != null) ...projectDetail(detail!),
        ],
      ),
    ),
  );

  Widget heading(String text) => Padding(
    padding: const EdgeInsets.only(top: 20, bottom: 8),
    child: Text(text, style: Theme.of(context).textTheme.titleMedium),
  );

  Widget progress(Map project) {
    final counts = project['progress'] as Map? ?? {};
    final done = (counts['done'] as num? ?? 0).toInt();
    final total = (counts['total'] as num? ?? 0).toInt();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('$done of $total milestones'),
      const SizedBox(height: 8),
      LinearProgressIndicator(
        value: total > 0 ? (done / total).clamp(0.0, 1.0).toDouble() : 0,
        semanticsLabel: '$done of $total milestones done', semanticsValue: '${total > 0 ? done * 100 ~/ total : 0}',
      ),
    ]);
  }

  Widget projectTitle(Map project) {
    final hex = '${project['color'] ?? ''}'.replaceFirst('#', '');
    final color = hex.length == 6 ? int.tryParse(hex, radix: 16) : null;
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(padding: const EdgeInsets.only(top: 6, right: 10), child: CircleAvatar(
        radius: 6, backgroundColor: color == null ? blue : Color(0xff000000 | color),
      )),
      Expanded(child: Text('${project['name']}', style: Theme.of(context).textTheme.titleLarge)),
    ]);
  }

  Widget projectCard(Map project) => Card(
    margin: const EdgeInsets.only(bottom: 12),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: () {
        setState(() { selected = project['id'] as String; detail = null; });
        load();
      },
      child: Padding(padding: const EdgeInsets.all(16), child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          projectTitle(project),
          const SizedBox(height: 8),
          Text('${project['status']}'),
          if ('${project['nextStep'] ?? ''}'.isNotEmpty) ...[
            const SizedBox(height: 12), Text('${project['nextStep']}'),
          ],
          const SizedBox(height: 16), progress(project),
        ],
      )),
    ),
  );

  List<Widget> projectDetail(Map project) => [
    projectTitle(project),
    Text('${project['status']}'),
    heading('Goals'), Text('${project['goals'] ?? ''}'.isEmpty ? 'No goals.' : '${project['goals']}'),
    heading('Next step'), Text('${project['nextStep'] ?? ''}'.isEmpty ? 'No next step.' : '${project['nextStep']}'),
    heading('Milestones'), progress(project),
    for (final milestone in project['milestones'] as List? ?? [])
      Padding(padding: const EdgeInsets.only(top: 12), child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(label: milestone['done'] == true ? 'Completed' : 'Incomplete', child: Icon(
            milestone['done'] == true ? Icons.check_box_outlined : Icons.check_box_outline_blank,
          )),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${milestone['text']}'),
            if ('${milestone['acceptance'] ?? ''}'.isNotEmpty) Text('${milestone['acceptance']}'),
          ])),
        ],
      )),
    heading('Recent notes'), Text('${project['notes'] ?? ''}'.isEmpty ? 'No notes.' : '${project['notes']}'),
    heading('Plan'),
    if (project['plan']?['revision'] != null) Text('Revision ${project['plan']['revision']}'),
    for (final section in project['plan']?['sections'] as List? ?? [])
      Padding(padding: const EdgeInsets.only(top: 8), child: Text(
        '${sectionNames[section['name']] ?? section['name']}: ${planStates[section['state']] ?? section['state']}',
      )),
    heading('Linked consoles'),
    if ((project['consoles'] as List? ?? []).isEmpty) const Text('No live consoles.'),
    for (final console in project['consoles'] as List? ?? [])
      Align(alignment: Alignment.centerLeft, child: TextButton(
        onPressed: () => openConsole(console['id'] as String),
        child: Text('${console['name']}'),
      )),
  ];
}
