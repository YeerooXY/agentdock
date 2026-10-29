import 'package:flutter/material.dart';

import 'dock_client.dart';
import 'results_page.dart';

class ImageJobsPage extends StatefulWidget {
  final DockClient client;
  const ImageJobsPage({super.key, required this.client});

  @override
  State<ImageJobsPage> createState() => _ImageJobsPageState();
}

class _ImageJobsPageState extends State<ImageJobsPage> {
  String error = '';
  bool resuming = false;

  String usage(Map job) {
    final values = job['usage'] as Map? ?? {};
    if (values.values.every((value) => value == null)) return 'Usage: not reported';
    return {'input': 'Input tokens', 'output': 'Output tokens', 'total': 'Total tokens', 'credits': 'Credits'}
        .entries.map((entry) => '${entry.value}: ${values[entry.key] ?? 'not reported'}').join(', ');
  }

  String time(dynamic value) => value is num
      ? DateTime.fromMillisecondsSinceEpoch(value.toInt()).toLocal().toString().substring(0, 16)
      : 'Not reported';

  Future<void> resume(Map job) async {
    final pc = widget.client.activePC, generation = widget.client.generation;
    final confirmed = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
      title: const Text('Resume image job?'),
      content: const Text('Resume this job on your PC? It may use credits.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Resume')),
      ],
    ));
    if (confirmed != true || !mounted) return;
    if (!widget.client.connected || widget.client.activePC != pc || widget.client.generation != generation) {
      setState(() => error = 'PC connection changed. Open the job again.');
      return;
    }
    setState(() { resuming = true; error = ''; });
    try {
      await widget.client.request('image.resume', {'id': job['id']});
    } catch (e) {
      if (mounted) setState(() => error = e.toString().replaceFirst('Bad state: ', ''));
    } finally {
      if (mounted) setState(() => resuming = false);
    }
  }

  Future<void> openResult(String id) async {
    try {
      final results = await widget.client.request('results.list') as List;
      final item = results.whereType<Map>().where((x) => x['id'] == id).firstOrNull;
      if (item == null) throw StateError('This saved result is no longer available.');
      if (!mounted) return;
      await Navigator.push(context, MaterialPageRoute(builder: (_) => ResultDetail(
        client: widget.client, item: Map<String, dynamic>.from(item), ids: [id],
      )));
    } catch (e) {
      if (mounted) setState(() => error = e.toString().replaceFirst('Bad state: ', ''));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Image jobs')),
    body: ListenableBuilder(animation: widget.client, builder: (context, _) {
      final jobs = (widget.client.state['imageJobs'] as List? ?? []).whereType<Map>().toList();
      return ListView(padding: const EdgeInsets.all(16), children: [
        if (error.isNotEmpty) Text(error, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        if (jobs.isEmpty) const Text('No image jobs.'),
        for (final job in jobs) Card(child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${job['provider'] ?? 'Unknown'}${job['model'] == null ? '' : ' · ${job['model']}'}', style: Theme.of(context).textTheme.titleMedium),
            if ((job['promptSummary'] as String? ?? '').isNotEmpty) Text(job['promptSummary'] as String),
            Text('Status: ${job['status'] ?? 'Unknown'}'),
            Text('Started: ${time(job['startedAt'])}'),
            Text('Finished: ${time(job['finishedAt'])}'),
            Text(usage(job)),
            Wrap(spacing: 8, children: [
              if (job['resultId'] is String) TextButton.icon(
                onPressed: () => openResult(job['resultId'] as String),
                icon: const Icon(Icons.image_outlined), label: const Text('View result'),
              ),
              if (job['canResume'] == true) TextButton(
                onPressed: resuming || !widget.client.connected ? null : () => resume(job),
                child: const Text('Resume'),
              ),
            ]),
          ]),
        )),
      ]);
    }),
  );
}
