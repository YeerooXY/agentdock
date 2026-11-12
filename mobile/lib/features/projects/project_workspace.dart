import 'package:flutter/material.dart';

class ProjectWorkspace extends StatelessWidget {
  final Map<String, dynamic> project;
  final List<dynamic> work;
  final Map<String, dynamic>? knowledge;
  final String tab;
  final ValueChanged<String> onTab;
  final ValueChanged<Map<String, dynamic>> onOpenReport;
  final ValueChanged<String> onReadSection;
  final VoidCallback? onLoadMore;

  const ProjectWorkspace({
    super.key,
    required this.project,
    this.work = const [],
    this.knowledge,
    this.tab = 'overview',
    required this.onTab,
    required this.onOpenReport,
    required this.onReadSection,
    this.onLoadMore,
  });

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _tabs(context),
          const SizedBox(height: 16),
          switch (tab.toLowerCase()) {
            'work' => _workTab(context),
            'knowledge' => _knowledgeTab(context),
            _ => _overviewTab(context),
          },
        ],
      ),
    );
  }

  Widget _tabs(BuildContext context) {
    const tabs = [
      ('overview', 'Overview'),
      ('work', 'Work'),
      ('knowledge', 'Knowledge'),
    ];
    final active = tab.toLowerCase();
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final (key, label) in tabs)
          active == key
              ? FilledButton.tonal(
                  key: ValueKey('tab-$key'),
                  onPressed: () => onTab(key),
                  child: Text(label),
                )
              : OutlinedButton(
                  key: ValueKey('tab-$key'),
                  onPressed: () => onTab(key),
                  child: Text(label),
                ),
      ],
    );
  }

  Widget _overviewTab(BuildContext context) {
    final lastProgress = project['lastProgress'];
    final summary = lastProgress is Map
        ? '${lastProgress['summary'] ?? ''}'
        : '${lastProgress ?? ''}';
    final goals = '${project['goals'] ?? ''}';
    final nextStep = '${project['nextStep'] ?? ''}';
    final milestones = (project['milestones'] as List? ?? [])
        .whereType<Map>()
        .toList();

    final application = knowledge?['mode'] == 'off'
        ? null
        : knowledge?['application'];
    final overviews = application is Map
        ? (application['overviews'] as List? ?? []).whereType<Map>().toList()
        : <Map>[];
    final hasContent =
        overviews.isNotEmpty ||
        summary.isNotEmpty ||
        goals.isNotEmpty ||
        nextStep.isNotEmpty ||
        milestones.isNotEmpty;

    if (!hasContent) return const Text('No overview available.');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (overviews.isNotEmpty) ...[
          Text('Application', style: Theme.of(context).textTheme.titleSmall),
          for (final note in overviews)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${note['summary'] ?? ''}'.length > 1200
                          ? '${note['summary']}'.substring(0, 1200)
                          : '${note['summary'] ?? ''}',
                    ),
                    const SizedBox(height: 8),
                    Text(
                      note['evidence'] == 'changed'
                          ? 'Source changed. This overview needs updating.'
                          : note['evidence'] == 'matches'
                          ? 'Source evidence matches. Semantic claims are unverified.'
                          : 'Source evidence is unverified.',
                    ),
                    TextButton(
                      onPressed: () => onReadSection('${note['id']}'),
                      child: const Text('Read overview'),
                    ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 12),
        ],
        if (summary.isNotEmpty) ...[
          Text(
            'Latest progress',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 4),
          Text(summary),
          const SizedBox(height: 12),
        ],
        if (goals.isNotEmpty) ...[
          Text('Goals', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 4),
          Text(goals),
          const SizedBox(height: 12),
        ],
        if (nextStep.isNotEmpty) ...[
          Text('Next step', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 4),
          Text(nextStep),
          const SizedBox(height: 12),
        ],
        if (milestones.isNotEmpty)
          Card(
            clipBehavior: Clip.antiAlias,
            child: ExpansionTile(
              key: const ValueKey('milestones-expansion'),
              initiallyExpanded: false,
              title: Text(
                'Milestones (${milestones.where((m) => m['done'] == true).length}/${milestones.length})',
              ),
              childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              children: [
                for (final m in milestones)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          m['done'] == true
                              ? Icons.check_box_outlined
                              : Icons.check_box_outline_blank,
                          size: 18,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${m['text'] ?? ''}'),
                              if ('${m['acceptance'] ?? ''}'.isNotEmpty) ...[
                                const SizedBox(height: 2),
                                Text(
                                  '${m['acceptance']}',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _workTab(BuildContext context) {
    final pid = project['id'];
    final scoped = work
        .whereType<Map>()
        .where((t) => '${t['projectId']}' == '$pid')
        .map((t) => Map<String, dynamic>.from(t))
        .toList();

    if (scoped.isEmpty) return const Text('No work items.');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final task in scoped) ...[
          _taskCard(context, task),
          const SizedBox(height: 8),
        ],
      ],
    );
  }

  Widget _taskCard(BuildContext context, Map<String, dynamic> task) {
    final title = '${task['title'] ?? task['name'] ?? 'Task'}';
    final resolution = task['resolution'] as Map?;
    final state = resolution?['state'] == 'completed'
        ? ({
                'verified': 'Verified',
                'integrated': 'Integrated',
                'completed-unverified': 'Completed without checks',
              }[resolution?['disposition']] ??
              '${task['state']}')
        : '${task['state'] ?? task['status'] ?? ''}';
    final criteria = '${task['criteria'] ?? task['acceptance'] ?? ''}';
    final size = '${task['size'] ?? ''}';

    String model = '';
    final imp = task['implementer'];
    if (imp is Map && imp['model'] != null) {
      model = '${imp['model']}';
    } else if (task['model'] != null) {
      model = '${task['model']}';
    }

    final hasReport = task['executionHistory'] is Map;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        key: ValueKey('work-${task['id'] ?? title}'),
        title: Text(title),
        subtitle: state.isNotEmpty ? Text(state) : null,
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        children: [
          if (criteria.isNotEmpty)
            Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text('Criteria: $criteria'),
              ),
            ),
          if (model.isNotEmpty)
            Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text('Assigned model: $model'),
              ),
            ),
          if (size.isNotEmpty)
            Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text('Size: $size'),
              ),
            ),
          if (hasReport)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => onOpenReport(task),
                icon: const Icon(Icons.description_outlined, size: 18),
                label: const Text('Report'),
              ),
            ),
        ],
      ),
    );
  }

  Widget _knowledgeTab(BuildContext context) {
    final k = knowledge;
    final mode = '${k?['mode'] ?? ''}'.toLowerCase();
    if (k == null || mode == 'off') {
      return const Text('Project knowledge is off.');
    }

    final status = '${k['status'] ?? ''}';
    final error = '${k['error'] ?? ''}';
    final nextCursor = k['nextCursor'];
    final items = (k['items'] as List? ?? [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (status.isNotEmpty) ...[
          if (status == 'loading') const Text('Loading knowledge...'),
          const SizedBox(height: 8),
        ],
        if (error.isNotEmpty) ...[
          Text(
            'Error: $error',
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
          const SizedBox(height: 8),
        ],
        if (items.isEmpty && status != 'loading' && error.isEmpty)
          const Text('No knowledge entries.'),
        for (final item in items) ...[
          _knowledgeItemTile(context, item),
          const SizedBox(height: 4),
        ],
        if (nextCursor != null) ...[
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: onLoadMore,
              child: const Text('Load more'),
            ),
          ),
        ],
      ],
    );
  }

  Widget _knowledgeItemTile(BuildContext context, Map<String, dynamic> item) {
    final id = '${item['id'] ?? ''}';
    final title = '${item['title'] ?? id}';

    return ListTile(
      key: ValueKey('knowledge-$id'),
      dense: true,
      title: Text(title),
      subtitle: title != id && id.isNotEmpty ? Text(id) : null,
      trailing: Text(
        'Unverified',
        style: TextStyle(
          color: Theme.of(context).colorScheme.onSurfaceVariant,
          fontWeight: FontWeight.bold,
        ),
      ),
      onTap: () => onReadSection(id),
    );
  }
}
