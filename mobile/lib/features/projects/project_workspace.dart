import 'package:flutter/material.dart';

class ProjectWorkspace extends StatelessWidget {
  final Map<String, dynamic>? knowledge;
  final ValueChanged<String> onReadSection;
  final VoidCallback? onLoadMore;

  const ProjectWorkspace({
    super.key,
    this.knowledge,
    required this.onReadSection,
    this.onLoadMore,
  });

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 16),
    child: _knowledgeTab(context),
  );

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
