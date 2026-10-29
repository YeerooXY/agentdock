import 'package:flutter/material.dart';

import 'dock_client.dart';

class PreviewListPage extends StatelessWidget {
  final DockClient client;
  const PreviewListPage({super.key, required this.client});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Previews')),
    body: ListenableBuilder(
      listenable: client,
      builder: (context, _) {
        final panels = (client.state['previews'] as List? ?? []).whereType<Map>().toList();
        if (panels.isEmpty) return const Center(child: Text('No open previews on the PC.'));
        return ListView.builder(
          itemCount: panels.length,
          itemBuilder: (context, index) {
            final panel = panels[index];
            return ListTile(
              title: Text('${panel['name'] ?? 'Preview'}'),
              subtitle: Text('${panel['url'] ?? ''}\n${panel['phoneAllowed'] == true ? 'Allowed on the PC' : 'Not allowed on the PC'} · ${panel['state'] ?? 'unknown'}'),
              isThreeLine: true,
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                builder: (_) => PreviewStatusPage(client: client, id: '${panel['id']}'),
              )),
            );
          },
        );
      },
    ),
  );
}

class PreviewStatusPage extends StatefulWidget {
  final DockClient client;
  final String id;
  const PreviewStatusPage({super.key, required this.client, required this.id});
  @override
  State<PreviewStatusPage> createState() => _PreviewStatusPageState();
}

class _PreviewStatusPageState extends State<PreviewStatusPage> {
  String status = '';
  bool loading = false;
  Map? get panel => (widget.client.state['previews'] as List? ?? [])
      .whereType<Map>().where((p) => p['id'] == widget.id).firstOrNull;

  Future<void> reload() async {
    final current = panel;
    if (current == null || current['phoneAllowed'] != true) return;
    setState(() { loading = true; status = 'Loading'; });
    try {
      final code = await widget.client.previewStatus(widget.id, '${current['url']}');
      if (mounted) setState(() => status = code == 403 ? 'Not allowed on the PC' : 'HTTP $code');
    } catch (_) {
      if (mounted) setState(() => status = 'Could not load preview.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.client,
    builder: (context, _) {
      final current = panel;
      final allowed = current?['phoneAllowed'] == true;
      return Scaffold(
        appBar: AppBar(title: Text('${current?['name'] ?? 'Preview'}'), actions: [
          IconButton(tooltip: 'Reload', onPressed: allowed && !loading ? reload : null, icon: const Icon(Icons.refresh)),
        ]),
        body: SingleChildScrollView(child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${current?['url'] ?? ''}'),
            const SizedBox(height: 12),
            Text(current == null ? 'Preview closed on the PC.' : !allowed ? 'Not allowed on the PC' : status.isEmpty ? 'Allowed on the PC' : status, semanticsLabel: current == null ? 'Preview closed on the PC.' : !allowed ? 'Not allowed on the PC' : status.isEmpty ? 'Allowed on the PC' : status),
            const SizedBox(height: 12),
            const Text('This app cannot display web previews yet. WebSocket reloads are not supported.'),
          ]),
        )),
      );
    },
  );
}
