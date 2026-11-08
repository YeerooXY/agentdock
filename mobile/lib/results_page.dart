import 'dart:convert';

import 'package:flutter/material.dart';

import 'dock_client.dart';
import 'image_jobs_page.dart';
import 'core/format.dart';
import 'dock_style.dart' show blue, pink;
import 'result_revision.dart';

import 'features/results/result_detail.dart';
export 'features/results/result_detail.dart' show ResultDetail, ResultThumbnail;

class ResultsPage extends StatefulWidget {
  final DockClient client;
  const ResultsPage({super.key, required this.client});
  @override
  State<ResultsPage> createState() => _ResultsPageState();
}

class _ResultsPageState extends State<ResultsPage> {
  List<dynamic>? items;
  String error = '';
  final search = TextEditingController();
  late Map<String, String> filters;
  @override
  void initState() {
    super.initState();
    filters = widget.client.resultFilters.putIfAbsent(
      widget.client.activePC,
      () => {},
    );
    search.text = filters['search'] ?? '';
    load();
  }

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  String projectKey(dynamic item) =>
      (item['projectId'] ?? item['project'] ?? 'unassigned').toString();
  String consoleKey(dynamic item) =>
      (item['consoleKey'] ??
              item['sessionId'] ??
              jsonEncode([
                'legacy',
                projectKey(item),
                item['source'] ?? 'Dock',
              ]))
          .toString();
  String turnKey(dynamic item) => jsonEncode([
    projectKey(item),
    consoleKey(item),
    (item['groupId'] as String? ?? '').isEmpty ? item['id'] : item['groupId'],
  ]);
  String resultType(dynamic item) {
    if (item['image'] == true) return 'Images';
    if (item['kind'] == 'code') return 'Code';
    if (['.md', '.txt', '.json', '.log', '.html', '.pdf'].contains(item['ext'])) {
      return 'Documents';
    }
    return 'Other';
  }

  bool matches(dynamic item) =>
      (filters['type'] == null || resultType(item) == filters['type']) &&
      (filters['project'] == null || projectKey(item) == filters['project']) &&
      (filters['console'] == null || consoleKey(item) == filters['console']) &&
      '${item['title'] ?? ''} ${item['summary'] ?? ''} ${item['consoleName'] ?? ''}'
          .toLowerCase()
          .contains((filters['search'] ?? '').trim().toLowerCase());

  Widget filterMenu(String key, String label, Map<String, String> options) =>
      PopupMenuButton<String>(
        tooltip: label,
        onSelected: (value) => setState(() {
          if (value.isEmpty) {
            filters.remove(key);
          } else {
            filters[key] = value;
          }
        }),
        itemBuilder: (_) => [
          PopupMenuItem(value: '', child: Text('All ${label.toLowerCase()}s')),
          for (final entry in options.entries)
            PopupMenuItem(value: entry.key, child: Text(entry.value)),
        ],
        child: Chip(
          label: Text(
            '$label: ${options[filters[key]] ?? filters[key] ?? 'All'}',
            overflow: TextOverflow.ellipsis,
          ),
        ),
      );

  Future<void> load() async {
    try {
      final result = await widget.client.request('results.list');
      if (mounted) {
        setState(() {
          items = result as List;
          final projects = items!.map(projectKey).toSet();
          final consoles = items!.map(consoleKey).toSet();
          if (!projects.contains(filters['project'])) filters.remove('project');
          if (!consoles.contains(filters['console'])) filters.remove('console');
          error = '';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Bad state: ', ''));
      }
    }
  }

  Future<void> remove(List<dynamic> group) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
          'Delete ${group.length} saved ${group.length == 1 ? 'result' : 'results'} from this turn?',
        ),
        content: const Text(
          'Saved copies will be removed. Your project files stay where they are.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      final result = await widget.client.request('results.delete', {
        'ids': group.map((x) => x['id']).toList(),
      });
      if ((result['failed'] as List).isNotEmpty) {
        throw StateError('Some saved copies could not be deleted. Try again.');
      }
      for (final id in result['deleted'] as List) {
        widget.client.forgetResultThumbnail(id as String);
      }
      await load();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  String projectLabel(dynamic item) {
    final projects = widget.client.state['projects'] as List? ?? [];
    final found = projects
        .where((p) => item['projectId'] != null && p['id'] == item['projectId'])
        .firstOrNull;
    return found?['name'] as String? ??
        (item['project'] as String? ?? '')
            .split(RegExp(r'[\\/]'))
            .where((x) => x.isNotEmpty)
            .lastOrNull ??
        'Unassigned';
  }

  Widget imageGroup(List<dynamic> group) {
    final pictures = group
        .where((x) => x['image'] == true)
        .cast<Map<String, dynamic>>()
        .toList();
    final viewed = pictures.where((x) => x['seenAt'] != null).length;
    return Column(
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(Icons.photo_library_outlined, color: blue),
          title: Text(
            pictures.length == 1 ? '1 picture' : '${pictures.length} pictures',
          ),
          subtitle: Text('$viewed of ${pictures.length} viewed'),
          trailing: Icon(Icons.chevron_right, color: pink),
          onTap: () async {
            await Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => ResultDetail(
                  client: widget.client,
                  item:
                      pictures.where((x) => x['seenAt'] == null).firstOrNull ??
                      pictures.first,
                  ids: pictures.map((x) => x['id']).toList(),
                  images: pictures,
                ),
              ),
            );
            await load();
          },
        ),
        if (widget.client.supportsResult('results.thumbnails'))
          SizedBox(
            height: 80,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: pictures.length,
              itemBuilder: (_, index) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: InkWell(
                  onTap: () async {
                    await Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => ResultDetail(
                          client: widget.client,
                          item: pictures[index],
                          ids: pictures.map((x) => x['id']).toList(),
                          images: pictures,
                        ),
                      ),
                    );
                    await load();
                  },
                  child: ResultThumbnail(
                    client: widget.client,
                    item: pictures[index],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final groups = <String, List<dynamic>>{};
    final fullGroups = <String, List<dynamic>>{};
    for (final item in items ?? []) {
      final key = turnKey(item);
      fullGroups.putIfAbsent(key, () => []).add(item);
      if (matches(item)) groups.putIfAbsent(key, () => []).add(item);
    }
    final chats = <String, List<List<dynamic>>>{};
    for (final group in groups.values) {
      final first = group.first;
      final key = consoleKey(first);
      chats.putIfAbsent(key, () => []).add(group);
    }
    final projects = <String, String>{
      for (final item in items ?? []) projectKey(item): projectLabel(item),
    };
    final consoles = <String, String>{
      for (final item in items ?? [])
        consoleKey(item): item['consoleName'] as String? ?? 'Earlier console',
    };
    final active = <String>[
      if ((filters['search'] ?? '').isNotEmpty)
        'Search: "${filters['search']}"',
      if (filters['type'] != null) 'Type: ${filters['type']}',
      if (filters['project'] != null)
        'Project: ${projects[filters['project']] ?? filters['project']}',
      if (filters['console'] != null)
        'Console: ${consoles[filters['console']] ?? filters['console']}',
    ];
    final children = <Widget>[
      if (error.isNotEmpty) Text(error, style: TextStyle(color: pink)),
      if (items == null && error.isEmpty)
        const Center(child: CircularProgressIndicator()),
      if (items != null && chats.isEmpty && error.isEmpty)
        Padding(
          padding: EdgeInsets.all(32),
          child: Text(
            active.isEmpty
                ? 'Finished work will appear here.'
                : 'No results for ${active.join('; ')}.',
          ),
        ),
      for (final chat in chats.values) ...[
        Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 12),
          child: Text(
            chat.first.first['consoleName'] as String? ?? 'Earlier console',
            style: TextStyle(fontSize: 22, color: pink),
          ),
        ),
        for (final group in chat)
          Card(
            key: ValueKey(turnKey(group.first)),
            margin: const EdgeInsets.only(bottom: 18),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
              side: const BorderSide(color: Color(0xff494061)),
            ),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          fullGroups[turnKey(group.first)]!
                                      .where(
                                        (x) =>
                                            x['kind'] != 'code' &&
                                            x['image'] != true &&
                                            x['ext'] != '.json',
                                      )
                                      .firstOrNull?['title']
                                  as String? ??
                              'Completed prompt',
                          style: TextStyle(
                            color: pink,
                            fontWeight: FontWeight.w600,
                            fontSize: 18,
                          ),
                        ),
                      ),
                      if (group.any((x) => x['seenAt'] == null))
                        const Padding(
                          padding: EdgeInsets.all(8),
                          child: Badge(label: Text('New')),
                        ),
                      IconButton(
                        onPressed: () =>
                            remove(fullGroups[turnKey(group.first)]!),
                        icon: Icon(Icons.delete_outline, color: blue),
                        tooltip: 'Delete this turn’s results',
                      ),
                    ],
                  ),
                  Text(
                    DateTime.fromMillisecondsSinceEpoch(
                      (group.first['at'] as num).toInt(),
                    ).toLocal().toString().substring(0, 16),
                    style: const TextStyle(
                      color: Color(0xffafb7cd),
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (group.any(
                    (x) =>
                        (x['summary'] as String? ?? '').isNotEmpty &&
                        x['kind'] != 'code',
                  ))
                    Text(
                      group.firstWhere(
                            (x) =>
                                (x['summary'] as String? ?? '').isNotEmpty &&
                                x['kind'] != 'code',
                          )['summary']
                          as String,
                    ),
                  ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    title: const Text('Details'),
                    children: [
                      Text(projectLabel(group.first)),
                      for (final git in turnRevisions(group))
                        ResultRevision(git),
                    ],
                  ),
                  if (group.any((x) => x['image'] == true)) imageGroup(group),
                  for (final item in group.where(
                    (x) =>
                        x['image'] != true &&
                        !(x['kind'] == 'code' && x['changeCount'] == 0),
                  ))
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        item['kind'] == 'code'
                            ? Icons.code
                            : item['image'] == true
                            ? Icons.image_outlined
                            : Icons.description_outlined,
                        color: blue,
                      ),
                      title: Text(item['title'] as String),
                      subtitle: Text(
                        '${item['kind']}, ${formatBytes((item['size'] as num).toInt())}',
                      ),
                      trailing: Icon(Icons.chevron_right, color: pink),
                      onTap: () async {
                        await Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => ResultDetail(
                              client: widget.client,
                              item: item as Map<String, dynamic>,
                              ids: group.map((x) => x['id']).toList(),
                            ),
                          ),
                        );
                        load();
                      },
                    ),
                ],
              ),
            ),
          ),
      ],
    ];
    return Column(
      children: [
        if (widget.client.supportsResult('image.jobs'))
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ImageJobsPage(client: widget.client),
                ),
              ),
              icon: const Icon(Icons.image_outlined),
              label: const Text('Image jobs'),
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: TextField(
            controller: search,
            decoration: const InputDecoration(
              labelText: 'Search results',
              prefixIcon: Icon(Icons.search),
            ),
            onChanged: (value) => setState(() {
              if (value.isEmpty) {
                filters.remove('search');
              } else {
                filters['search'] = value;
              }
            }),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Wrap(
            spacing: 8,
            children: [
              for (final type in ['Images', 'Documents', 'Code', 'Other'])
                FilterChip(
                  label: Text(type),
                  selected: filters['type'] == type,
                  onSelected: (selected) => setState(() {
                    if (selected) {
                      filters['type'] = type;
                    } else {
                      filters.remove('type');
                    }
                  }),
                ),
              filterMenu('project', 'Project', projects),
              filterMenu('console', 'Console', consoles),
              if (active.isNotEmpty)
                TextButton(
                  onPressed: () => setState(() {
                    filters.clear();
                    search.clear();
                  }),
                  child: const Text('Clear filters'),
                ),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: load,
            child: ListView.builder(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              itemCount: children.length,
              itemBuilder: (_, index) => children[index],
            ),
          ),
        ),
      ],
    );
  }
}
