import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../dock_client.dart';

import '../../dock_style.dart' show blue, pink;
import '../../result_revision.dart';

class ResultThumbnail extends StatelessWidget {
  final DockClient client;
  final Map<String, dynamic> item;
  const ResultThumbnail({super.key, required this.client, required this.item});

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 72,
    height: 72,
    child: FutureBuilder<Uint8List?>(
      key: ValueKey('${client.activePC}:${item['id']}'),
      future: client.resultThumbnail(item['id'] as String),
      builder: (_, snapshot) => snapshot.data == null
          ? Semantics(
              label: item['title'] as String,
              child: const Icon(Icons.image_outlined),
            )
          : Image.memory(
              snapshot.data!,
              fit: BoxFit.cover,
              semanticLabel: item['title'] as String,
              errorBuilder: (_, error, stack) =>
                  const Icon(Icons.broken_image_outlined),
            ),
    ),
  );
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
  bool acting = false;
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
  Future<void> act(bool deleting) async {
    if (acting || (!deleting && item['seenAt'] != null)) return;
    final id = item['id'];
    setState(() => acting = true);
    try {
      if (deleting) {
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: Text('Delete "${item['title']}"?'),
            content: const Text(
              'The saved copy will be removed. Your project files stay where they are.',
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
        if (confirmed != true || !mounted) return;
        final result = await widget.client.request('results.delete', {
          'ids': [id],
        });
        if ((result['failed'] as List).isNotEmpty) {
          throw StateError('The saved copy could not be deleted. Try again.');
        }
        widget.client.forgetResultThumbnail(id as String);
        if (mounted) Navigator.pop(context);
      } else {
        await widget.client.request('results.seen', {
          'ids': [id],
        });
        if (mounted) {
          setState(
            () => item['seenAt'] = DateTime.now().millisecondsSinceEpoch,
          );
          ScaffoldMessenger.of(context)
              .showSnackBar(const SnackBar(content: Text('Marked viewed.')));
        }
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => acting = false);
    }
  }

  void switchImage(int index) {
    if (acting) return;
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
      actions: [
        if (widget.client.supportsResult('results.actions'))
          PopupMenuButton<String>(
            tooltip: 'Result actions',
            enabled: !acting,
            onSelected: (value) => act(value == 'delete'),
            itemBuilder: (_) => [
              if (item['seenAt'] == null)
                const PopupMenuItem(value: 'seen', child: Text('Mark viewed')),
              const PopupMenuItem(value: 'delete', child: Text('Delete')),
            ],
          ),
      ],
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
                  if (widget.client.supportsResult('results.thumbnails'))
                    SizedBox(
                      height: 100,
                      child: ListView.builder(
                        scrollDirection: Axis.horizontal,
                        itemCount: widget.images.length,
                        itemBuilder: (_, i) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: Semantics(
                            label:
                                'Image ${i + 1} of ${widget.images.length}${widget.images[i]['seenAt'] != null ? ', viewed' : ''}',
                            selected: i == imageIndex,
                            child: InkWell(
                              onTap: acting ? null : () => switchImage(i),
                              child: Container(
                                decoration: BoxDecoration(
                                  border: Border.all(
                                    color: i == imageIndex
                                        ? pink
                                        : Colors.transparent,
                                    width: 2,
                                  ),
                                ),
                                child: Column(
                                  children: [
                                    ResultThumbnail(
                                      client: widget.client,
                                      item: widget.images[i],
                                    ),
                                    Text(
                                      '${i + 1}${widget.images[i]['seenAt'] != null ? ', Viewed' : ''}',
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    )
                  else
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          for (var i = 0; i < widget.images.length; i++)
                            Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: ChoiceChip(
                                label: Text(
                                  '${i + 1}${widget.images[i]['seenAt'] != null ? ', Viewed' : ''}',
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
          if (resultRevision(item) != null)
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text('Details'),
              children: [ResultRevision(resultRevision(item))],
            ),
          if (error.isNotEmpty) Text(error, style: TextStyle(color: pink)),
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
                    h1: TextStyle(
                      color: blue,
                      fontSize: 28,
                      fontWeight: FontWeight.w600,
                    ),
                    h2: TextStyle(
                      color: pink,
                      fontSize: 23,
                      fontWeight: FontWeight.w600,
                    ),
                    h3: TextStyle(
                      color: blue,
                      fontSize: 19,
                      fontWeight: FontWeight.w600,
                    ),
                    p: const TextStyle(
                      color: Color(0xffdce1ef),
                      fontSize: 15,
                      height: 1.65,
                    ),
                    a: TextStyle(
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
                    blockquoteDecoration: BoxDecoration(
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
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text('Capture details'),
              children: [
                if (content!['diff']['git']?['before'] != null)
                  Text(
                    'Started at ${revisionLabel(content!['diff']['git']['before'] as Map)}',
                    style: TextStyle(color: blue, fontSize: 12),
                  ),
                if (content!['diff']['git']?['after'] != null)
                  ResultRevision(content!['diff']['git']['after'] as Map),
                for (final note in (content!['diff']['notes'] as List? ?? []))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(note as String, style: TextStyle(color: pink)),
                  ),
              ],
            ),
            for (final file in content!['diff']['changes'] as List)
              ExpansionTile(
                initiallyExpanded: false,
                tilePadding: EdgeInsets.zero,
                title: Text(
                  file['file'] as String,
                  style: TextStyle(color: blue),
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
