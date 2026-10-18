import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import 'dock_client.dart';
import 'main.dart' show blue, pink, formatBytes;

class ResultsPage extends StatefulWidget {
  final DockClient client;
  const ResultsPage({super.key, required this.client});
  @override
  State<ResultsPage> createState() => _ResultsPageState();
}

class _ResultsPageState extends State<ResultsPage> {
  List<dynamic>? items;
  String error = '';
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final result = await widget.client.request('results.list');
      if (mounted) {
        setState(() {
          items = result as List;
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
        title: const Text('Delete this turn’s results?'),
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
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.photo_library_outlined, color: blue),
      title: Text('${pictures.length} pictures'),
      subtitle: Text('$viewed of ${pictures.length} viewed'),
      trailing: const Icon(Icons.chevron_right, color: pink),
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
    );
  }

  @override
  Widget build(BuildContext context) {
    final groups = <String, List<dynamic>>{};
    for (final item in items ?? []) {
      final key = jsonEncode([
        item['projectId'] ?? item['project'],
        item['consoleKey'] ?? item['sessionId'],
        item['groupId'] ?? item['id'],
      ]);
      groups.putIfAbsent(key, () => []).add(item);
    }
    return RefreshIndicator(
      onRefresh: load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (error.isNotEmpty)
            Text(error, style: const TextStyle(color: pink)),
          if (items == null && error.isEmpty)
            const Center(child: CircularProgressIndicator()),
          if (items?.isEmpty == true)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Text('Finished work will appear here.'),
            ),
          for (final group in groups.values)
            Card(
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
                            projectLabel(group.first),
                            style: const TextStyle(
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
                          onPressed: () => remove(group),
                          icon: const Icon(Icons.delete_outline, color: blue),
                          tooltip: 'Delete this turn’s results',
                        ),
                      ],
                    ),
                    Text(
                      "${group.first['consoleName'] ?? 'Console'} · ${DateTime.fromMillisecondsSinceEpoch((group.first['at'] as num).toInt()).toLocal().toString().substring(0, 16)}",
                      style: const TextStyle(
                        color: Color(0xffafb7cd),
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 8),
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
                          '${item['kind']} · ${formatBytes((item['size'] as num).toInt())}',
                        ),
                        trailing: const Icon(Icons.chevron_right, color: pink),
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
      ),
    );
  }
}

class ResultDetail extends StatefulWidget {
  final DockClient client;
  final Map<String, dynamic> item;
  final List<dynamic> ids;
  final List<Map<String, dynamic>> images;
  const ResultDetail({
    super.key,
    required this.client,
    required this.item,
    required this.ids,
    this.images = const [],
  });
  @override
  State<ResultDetail> createState() => _ResultDetailState();
}

class _ResultDetailState extends State<ResultDetail> {
  Map<String, dynamic>? content;
  String error = '';
  bool full = false;
  late Map<String, dynamic> item;
  int version = 0;
  @override
  void initState() {
    super.initState();
    item = widget.item;
    load();
  }

  Future<void> load() async {
    final current = ++version, id = item['id'];
    try {
      final result = await widget.client.request('results.preview', {
        'id': id,
        'thumbnail': !full,
      });
      if (mounted && current == version) {
        setState(() {
          content = result as Map<String, dynamic>;
          error = '';
        });
      }
      if (!mounted || current != version) return;
      await widget.client.request('results.seen', {
        'ids': [id],
      });
      if (mounted && current == version) {
        setState(() => item['seenAt'] = DateTime.now().millisecondsSinceEpoch);
      }
    } catch (e) {
      if (mounted && current == version) setState(() => error = e.toString());
    }
  }

  int get imageIndex => widget.images.indexWhere((x) => x['id'] == item['id']);
  void switchImage(int index) {
    setState(() {
      item = widget.images[index];
      content = null;
      full = false;
      error = '';
    });
    load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(item['title'] as String, overflow: TextOverflow.ellipsis),
    ),
    bottomNavigationBar: widget.images.length > 1
        ? SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      IconButton(
                        tooltip: 'Previous picture',
                        onPressed: imageIndex > 0
                            ? () => switchImage(imageIndex - 1)
                            : null,
                        icon: const Icon(Icons.chevron_left),
                      ),
                      Text('${imageIndex + 1} / ${widget.images.length}'),
                      IconButton(
                        tooltip: 'Next picture',
                        onPressed: imageIndex < widget.images.length - 1
                            ? () => switchImage(imageIndex + 1)
                            : null,
                        icon: const Icon(Icons.chevron_right),
                      ),
                    ],
                  ),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        for (var i = 0; i < widget.images.length; i++)
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: ChoiceChip(
                              label: Text(
                                '${i + 1}${widget.images[i]['seenAt'] != null ? ' · Viewed' : ''}',
                              ),
                              tooltip: widget.images[i]['title'] as String,
                              selected: i == imageIndex,
                              onSelected: (_) => switchImage(i),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          )
        : null,
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (error.isNotEmpty)
            Text(error, style: const TextStyle(color: pink)),
          if (content == null && error.isEmpty)
            const Center(child: CircularProgressIndicator()),
          if (content?['image'] != null) ...[
            InteractiveViewer(
              child: Image.memory(
                base64Decode((content!['image'] as String).split(',').last),
                semanticLabel: item['title'] as String,
              ),
            ),
            if (!full)
              TextButton(
                onPressed: () {
                  full = true;
                  load();
                },
                child: const Text('Load larger image'),
              ),
          ],
          if (content?['text'] != null && item['ext'] == '.md')
            MarkdownBody(
              data: content!['text'] as String,
              selectable: true,
              softLineBreak: false,
              imageBuilder: (uri, title, alt) => Text(
                'Image: ${alt ?? title ?? "see saved images in Results"}',
                style: const TextStyle(
                  color: Color(0xffb9c2d7),
                  fontStyle: FontStyle.italic,
                ),
              ),
              onTapLink: (text, href, title) async {
                final url = Uri.tryParse(href ?? '');
                if (url == null ||
                    !['https', 'http'].contains(url.scheme) ||
                    url.host.isEmpty ||
                    url.userInfo.isNotEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Open local files on your PC.'),
                    ),
                  );
                  return;
                }
                try {
                  if (!await launchUrl(
                    url,
                    mode: LaunchMode.externalApplication,
                  )) {
                    throw StateError('No browser available');
                  }
                } catch (_) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Could not open this link.'),
                      ),
                    );
                  }
                }
              },
              styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context))
                  .copyWith(
                    h1: const TextStyle(
                      color: blue,
                      fontSize: 28,
                      fontWeight: FontWeight.w600,
                    ),
                    h2: const TextStyle(
                      color: pink,
                      fontSize: 23,
                      fontWeight: FontWeight.w600,
                    ),
                    h3: const TextStyle(
                      color: blue,
                      fontSize: 19,
                      fontWeight: FontWeight.w600,
                    ),
                    p: const TextStyle(
                      color: Color(0xffdce1ef),
                      fontSize: 15,
                      height: 1.65,
                    ),
                    a: const TextStyle(
                      color: blue,
                      decoration: TextDecoration.underline,
                    ),
                    code: const TextStyle(
                      fontFamily: 'monospace',
                      color: Color(0xffe9d5f6),
                      fontSize: 12,
                    ),
                    codeblockDecoration: BoxDecoration(
                      color: const Color(0xff080911),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    blockquoteDecoration: const BoxDecoration(
                      color: Color(0xff181528),
                      border: Border(left: BorderSide(color: pink, width: 3)),
                    ),
                    tableBorder: TableBorder.all(
                      color: const Color(0xff49475c),
                    ),
                  ),
            )
          else if (content?['text'] != null && item['ext'] == '.json')
            ExpansionTile(
              title: const Text('Supporting data'),
              children: [SelectableText(content!['text'] as String)],
            )
          else if (content?['text'] != null)
            SelectableText(
              content!['text'] as String,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
            ),
          if (content?['truncated'] == true)
            const Text('Preview shortened. Open the full file on your PC.'),
          if (content?['diff'] != null) ...[
            for (final note in (content!['diff']['notes'] as List? ?? []))
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  note as String,
                  style: const TextStyle(color: pink),
                ),
              ),
            for (final file in content!['diff']['changes'] as List)
              ExpansionTile(
                initiallyExpanded: true,
                tilePadding: EdgeInsets.zero,
                title: Text(
                  file['file'] as String,
                  style: const TextStyle(color: blue),
                ),
                subtitle: Text(file['type'] as String),
                children: [
                  if (file['patch'] == null)
                    Text(file['omitted'] as String? ?? 'No text preview')
                  else
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          for (final line in (file['patch'] as String).split(
                            '\n',
                          ))
                            Text(
                              line.isEmpty ? ' ' : line,
                              style: TextStyle(
                                fontFamily: 'monospace',
                                fontSize: 12,
                                color: line.startsWith('+')
                                    ? const Color(0xffb9edcd)
                                    : line.startsWith('-')
                                    ? const Color(0xffffb5cb)
                                    : const Color(0xffd0d7e5),
                                backgroundColor: line.startsWith('+')
                                    ? const Color(0xff123725)
                                    : line.startsWith('-')
                                    ? const Color(0xff401b29)
                                    : null,
                              ),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
          ],
        ],
      ),
    ),
  );
}
