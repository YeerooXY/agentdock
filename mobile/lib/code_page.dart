import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'console_drafts.dart';
import 'dock_client.dart';

String formatCodeContext({required String path, required String folder,
  required int from, required int to, required String text, String note = ''}) {
  const languages = {'js': 'javascript', 'mjs': 'javascript', 'cjs': 'javascript',
    'jsx': 'jsx', 'ts': 'typescript', 'tsx': 'tsx', 'py': 'python', 'rb': 'ruby',
    'rs': 'rust', 'sh': 'bash', 'ps1': 'powershell', 'yml': 'yaml',
    'md': 'markdown', 'h': 'c', 'cpp': 'cpp', 'cs': 'csharp'};
  final extension = path.split('.').last.toLowerCase();
  final language = languages[extension] ??
      (path.contains('.') && RegExp(r'^[a-z0-9]+$').hasMatch(extension) ? extension : '');
  var length = 3;
  for (final match in RegExp(r'`+').allMatches(text)) {
    length = math.max(length, match.group(0)!.length + 1);
  }
  final fence = '`' * length;
  final result = '${note.trim().isEmpty ? '' : '${note.trim()}\n\n'}'
      'File: $path:$from-$to  ($folder)\n$fence$language\n$text\n$fence';
  if (result.length > 60000) throw StateError('Select fewer than 60,000 characters.');
  return result;
}

class CodePage extends StatefulWidget {
  final DockClient client;
  final String consoleId;
  const CodePage({super.key, required this.client, required this.consoleId});
  @override
  State<CodePage> createState() => _CodePageState();
}

class _CodePageState extends State<CodePage> {
  late final pc = widget.client.activePC;
  late final generation = widget.client.generation;
  Map<String, dynamic> listing = {}, file = {};
  String error = '', query = '';
  bool loading = true;
  int? anchor, end;
  int revision = 0;
  List<String> content = [''];
  String? measuredText;
  TextScaler? measuredScale;
  double measuredWidth = 0, gutter = 72;
  final find = TextEditingController();
  bool get current => widget.client.connected && widget.client.foreground &&
      widget.client.activePC == pc && widget.client.generation == generation &&
      widget.client.selected == widget.consoleId &&
      widget.client.sessions.any((s) => s['id'] == widget.consoleId);

  @override
  void initState() { super.initState(); load('code.list', ''); }
  @override
  void dispose() { find.dispose(); super.dispose(); }

  Future<void> load(String method, String path) async {
    final request = ++revision;
    setState(() { loading = true; error = ''; anchor = end = null; });
    try {
      if (!current) throw StateError('Connection changed. Reopen Code.');
      final value = await widget.client.request(method, {'consoleId': widget.consoleId, 'path': path});
      if (!mounted || revision != request) return;
      if (!current) throw StateError('Connection changed. Reopen Code.');
      setState(() {
        if (method == 'code.list') { listing = Map<String, dynamic>.from(value); file = {}; content = ['']; }
        else {
          file = Map<String, dynamic>.from(value);
          content = (file['text'] as String? ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
        }
        query = ''; find.clear(); loading = false;
      });
    } catch (e) {
      if (mounted && revision == request) {
        setState(() {
          loading = false; error = e.toString().replaceFirst('Bad state: ', '');
        });
      }
    }
  }

  Future<void> ask() async {
    if (anchor == null || end == null) return;
    if (!current) {
      setState(() => error = 'Console or connection changed. Reopen Code.');
      return;
    }
    final from = math.min(anchor!, end!), to = math.max(anchor!, end!);
    final snippet = content.sublist(from - 1, to).join('\n');
    var destination = widget.consoleId;
    var sheetError = '';
    final targets = widget.client.sessions.where((s) => s['purpose'] != 'code' &&
        s['purpose'] != 'web').toList();
    await showModalBottomSheet<void>(context: context, isScrollControlled: true,
      showDragHandle: true, builder: (context) => _CodeNoteScope(
        builder: (context, note) => StatefulBuilder(builder: (context, update) {
        return SafeArea(child: Padding(
          padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
          child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('${file['path']}:$from-$to', style: Theme.of(context).textTheme.titleMedium),
              ConstrainedBox(constraints: const BoxConstraints(maxHeight: 180),
                child: SingleChildScrollView(child: SelectableText(snippet,
                  style: const TextStyle(fontFamily: 'monospace')))),
              const SizedBox(height: 12),
              TextField(controller: note, decoration: const InputDecoration(labelText: 'Note'), maxLines: null),
              Wrap(spacing: 8, children: [for (final label in ['Explain this', 'Look for a bug', 'Propose a fix'])
                ActionChip(label: Text(label), onPressed: () { note.text = label; })]),
              DropdownButtonFormField<String>(initialValue: destination, isExpanded: true,
                decoration: const InputDecoration(labelText: 'Console'),
                items: [for (final target in targets) DropdownMenuItem(value: target['id'] as String,
                  child: Text(target['name'] as String? ?? 'Console', overflow: TextOverflow.ellipsis))],
                onChanged: (value) { if (value != null) update(() => destination = value); }),
              if (sheetError.isNotEmpty) Text(sheetError),
              const SizedBox(height: 12),
              FilledButton(onPressed: () {
                final target = widget.client.sessions.where((s) => s['id'] == destination).firstOrNull;
                if (!current || target == null) {
                  update(() => sheetError = 'Console or connection changed. Reopen Code.'); return;
                }
                try {
                  final context = formatCodeContext(path: file['path'] as String,
                    folder: file['folder'] as String, from: from, to: to, text: snippet, note: note.text);
                  final key = ConsoleDrafts.key(pc, (target['consoleKey'] ?? target['id']) as String);
                  final before = widget.client.drafts.get(key);
                  widget.client.drafts.set(key, '${before.isEmpty ? '' : '$before\n\n'}$context');
                  Navigator.pop(this.context);
                  ScaffoldMessenger.of(this.context).showSnackBar(const SnackBar(content: Text('Added to draft')));
                } catch (e) { update(() => sheetError = e.toString().replaceFirst('Bad state: ', '')); }
              }, child: const Text('Add to draft')),
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            ])),
        ));
      })));
  }

  @override
  Widget build(BuildContext context) {
    final visible = [for (var i = 0; i < content.length; i++)
      if (query.isEmpty || content[i].toLowerCase().contains(query.toLowerCase())) i];
    return Scaffold(appBar: AppBar(title: const Text('Code'), actions: [
      if (file.isNotEmpty) IconButton(tooltip: 'Back to folder', icon: const Icon(Icons.folder_open),
        onPressed: () => load('code.list', listing['path'] as String? ?? '')),
    ]), body: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Padding(padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8), child: Text('Read only')),
      if (!loading && file.isEmpty) Wrap(children: [
        if (listing['parent'] != null) IconButton(tooltip: 'Up', icon: const Icon(Icons.arrow_upward),
          onPressed: () => load('code.list', listing['parent'] as String)),
        for (final crumb in listing['breadcrumbs'] as List? ?? []) TextButton(
          onPressed: () => load('code.list', crumb['path'] as String), child: Text(crumb['name'] as String)),
      ]),
      if (!loading && file['text'] != null) ...[
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Text(file['path'] as String)),
        Padding(padding: const EdgeInsets.all(8), child: TextField(controller: find,
          decoration: const InputDecoration(labelText: 'Find in file', prefixIcon: Icon(Icons.search)),
          onChanged: (value) => setState(() => query = value))),
        if (query.isNotEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text('${visible.length} matching lines')),
      ],
      if (error.isNotEmpty) Padding(padding: const EdgeInsets.all(16), child: Text(error)),
      Expanded(child: loading ? const Center(child: CircularProgressIndicator()) :
        error.isNotEmpty ? Center(child: TextButton(onPressed: () => load('code.list', listing['path'] as String? ?? ''), child: const Text('Retry'))) :
        file.isEmpty ? ListView(children: [
          if ((listing['entries'] as List? ?? []).isEmpty) const ListTile(title: Text('Folder is empty')),
          for (final entry in listing['entries'] as List? ?? []) ListTile(
            leading: Icon(entry['directory'] == true ? Icons.folder : Icons.description_outlined),
            title: Text(entry['name'] as String), onTap: () => load(entry['directory'] == true ? 'code.list' : 'code.read', entry['path'] as String)),
          if (listing['truncated'] == true) const ListTile(title: Text('Showing the first 500 entries.')),
        ]) : file['text'] == null ? Padding(padding: const EdgeInsets.all(16), child: Text(file['omitted'] as String? ?? 'Preview unavailable.')) :
        LayoutBuilder(builder: (context, constraints) {
          const style = TextStyle(fontFamily: 'monospace', fontSize: 14);
          final scale = MediaQuery.textScalerOf(context);
          if (measuredText != file['text'] || measuredScale != scale) {
            measuredText = file['text'] as String;
            measuredScale = scale;
            measuredWidth = 0;
            final numbers = TextPainter(text: TextSpan(text: '${content.length}  ', style: style),
              textDirection: TextDirection.ltr, textScaler: scale)..layout();
            gutter = math.max(72.0, numbers.width + 8);
            numbers.dispose();
            for (final line in content.toSet()) {
              if (line.isEmpty) continue;
              final painter = TextPainter(text: TextSpan(text: line, style: style),
                textDirection: TextDirection.ltr, textScaler: scale)..layout();
              measuredWidth = math.max(measuredWidth, painter.width);
              painter.dispose();
            }
          }
          final width = math.max(constraints.maxWidth, measuredWidth + gutter + 16);
          return SingleChildScrollView(scrollDirection: Axis.horizontal, child: SizedBox(width: width,
            child: ListView.builder(itemCount: visible.length, itemBuilder: (context, index) {
              final i = visible[index], number = i + 1;
              final selected = anchor != null && number >= math.min(anchor!, end!) && number <= math.max(anchor!, end!);
              return Semantics(label: 'Line $number', selected: selected,
                child: InkWell(key: ValueKey('code-line-$number'),
                  onLongPress: () => setState(() { anchor = end = number; }),
                  onTap: () { if (anchor != null) setState(() => end = number); },
                  child: Container(color: selected ? Theme.of(context).colorScheme.secondaryContainer : null,
                    constraints: const BoxConstraints(minHeight: 44), padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      SizedBox(width: gutter, child: Text('$number  ', textAlign: TextAlign.right, style: style)),
                      Text(content[i], style: style),
                    ]))));
            })));
        })),
      if (anchor != null) SafeArea(top: false, child: Padding(padding: const EdgeInsets.all(8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          const Text('Tap another line to extend.'),
          Wrap(alignment: WrapAlignment.spaceBetween, children: [
            TextButton(onPressed: () => setState(() { anchor = end = null; }), child: const Text('Clear selection')),
            FilledButton(onPressed: ask, child: Text('Ask agent: ${math.min(anchor!, end!)}-${math.max(anchor!, end!)}')),
          ]),
        ]))),
    ]));
  }
}

// The controller lives as long as the sheet, including its closing animation.
class _CodeNoteScope extends StatefulWidget {
  final Widget Function(BuildContext, TextEditingController) builder;
  const _CodeNoteScope({required this.builder});

  @override
  State<_CodeNoteScope> createState() => _CodeNoteScopeState();
}

class _CodeNoteScopeState extends State<_CodeNoteScope> {
  final note = TextEditingController();

  @override
  void dispose() {
    note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(context, note);
}
