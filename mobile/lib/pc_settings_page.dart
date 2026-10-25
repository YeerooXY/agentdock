import 'package:flutter/material.dart';

import 'dock_client.dart';
import 'dock_style.dart';

class PCSettingsPage extends StatefulWidget {
  final DockClient client;
  final String category;
  const PCSettingsPage({
    super.key,
    required this.client,
    required this.category,
  });
  @override
  State<PCSettingsPage> createState() => _PCSettingsPageState();
}

class _PCSettingsPageState extends State<PCSettingsPage> {
  Map? data;
  String error = '';
  bool loading = true;
  late String? pc;
  late int generation;
  int request = 0;
  @override
  void initState() {
    super.initState();
    pc = widget.client.activePC;
    generation = widget.client.generation;
    widget.client.addListener(connectionChanged);
    load();
  }

  void connectionChanged() {
    final c = widget.client;
    if (c.activePC == pc && c.generation == generation) return;
    pc = c.activePC;
    generation = c.generation;
    data = null;
    load();
  }

  @override
  void dispose() {
    widget.client.removeListener(connectionChanged);
    request++;
    super.dispose();
  }

  Future<void> load() async {
    final currentRequest = ++request;
    final c = widget.client,
        pc = widget.client.activePC,
        generation = widget.client.generation;
    setState(() {
      loading = true;
      error = '';
      data = null;
    });
    try {
      final value = await c.request('settings.summary');
      if (!mounted ||
          currentRequest != request ||
          c.activePC != pc ||
          c.generation != generation) {
        return;
      }
      if (value is! Map) {
        throw StateError('Update Paddock on your PC to view these settings.');
      }
      setState(() => data = value);
    } catch (e) {
      if (mounted && currentRequest == request) {
        setState(() => error = e.toString().replaceFirst('Bad state: ', ''));
      }
    } finally {
      if (mounted && currentRequest == request) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final key = {
      'API': 'apis',
      'Keys': 'keys',
      'Tools': 'tools',
    }[widget.category];
    final items = key == null ? <dynamic>[] : data?[key] as List? ?? [];
    return RefreshIndicator(
      onRefresh: load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(widget.category, style: TextStyle(fontSize: 22, color: pink)),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text(
              'Edit these settings in Paddock on your PC.',
              style: TextStyle(color: muted),
            ),
          ),
          if (loading) const LinearProgressIndicator(),
          if (error.isNotEmpty) ...[
            Text(error, style: TextStyle(color: pink)),
            TextButton(onPressed: load, child: const Text('Retry')),
          ],
          if (!loading && error.isEmpty && widget.category == 'Instructions')
            SelectableText(data?['instructions'] as String? ?? ''),
          if (!loading &&
              error.isEmpty &&
              widget.category != 'Instructions' &&
              items.isEmpty)
            const Text('None configured.'),
          for (final item in items)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('${item['name'] ?? item['id']}'),
              subtitle: Text(
                widget.category == 'Tools'
                    ? item['enabled'] == true
                          ? 'Enabled'
                          : 'Disabled'
                    : '${item['protocol'] ?? item['id']}',
              ),
            ),
        ],
      ),
    );
  }
}
