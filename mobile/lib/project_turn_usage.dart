import 'package:flutter/material.dart';

import 'account_usage.dart';
import 'dock_client.dart';
import 'dock_style.dart';

String turnNumber(dynamic value) {
  if (value is! num || !value.isFinite || value < 0) return '—';
  String decimal(num n) => n.toStringAsFixed(1).replaceFirst(RegExp(r'\.0$'), '');
  if (value >= 10000) {
    for (final unit in [(1e12, 'T'), (1e9, 'B'), (1e6, 'M'), (1e3, 'K')]) {
      if (value >= unit.$1) return '${decimal(value / unit.$1)}${unit.$2}';
    }
  }
  final parts = decimal(value).split('.');
  final digits = parts.first.replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]},');
  return parts.length == 1 ? digits : '$digits.${parts[1]}';
}

String turnWindow(dynamic minutes) {
  if (minutes == 10080) return 'Weekly';
  if (minutes is! num || !minutes.isFinite || minutes <= 0) return 'Account window';
  return minutes % 60 == 0 ? '${turnNumber(minutes / 60)}h' : '${turnNumber(minutes)} min';
}

class ProjectTurnUsage extends StatefulWidget {
  final DockClient client;
  final int refreshRevision;
  const ProjectTurnUsage({super.key, required this.client, this.refreshRevision = 0});

  @override
  State<ProjectTurnUsage> createState() => _ProjectTurnUsageState();
}

class _ProjectTurnUsageState extends State<ProjectTurnUsage> {
  List<Map> turns = [], projects = [];
  String filter = '', error = '';
  String? before;
  bool loading = false, started = false;
  bool wasConnected = false, refreshPending = false;
  int transportGeneration = -1;
  int revision = 0;
  String connection = '';
  bool get supported => (widget.client.state['capabilities'] as List? ?? []).contains('usage.turns');

  @override
  void initState() {
    super.initState();
    widget.client.addListener(changed);
    changed();
  }

  void changed() {
    final connected = widget.client.connected;
    final transportChanged = transportGeneration != widget.client.generation;
    final reconnected = connected && !wasConnected;
    transportGeneration = widget.client.generation;
    wasConnected = connected;
    final next = '${widget.client.activePC}:$supported';
    if (next != connection) {
      connection = next;
      revision++;
      turns = []; projects = []; before = null;
      filter = ''; error = ''; loading = false; started = false;
      refreshPending = false;
    }
    if (transportChanged || !connected) {
      revision++;
      loading = false;
      refreshPending = false;
    }
    if (supported && connected && (!started || reconnected || transportChanged)) {
      started = true;
      load();
    }
    if (mounted) setState(() {});
  }

  @override
  void didUpdateWidget(covariant ProjectTurnUsage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.refreshRevision != oldWidget.refreshRevision && supported) load();
  }

  Future<void> load({bool more = false}) async {
    if (!supported || !widget.client.connected) return;
    if (loading) {
      if (!more) refreshPending = true;
      return;
    }
    final current = ++revision;
    setState(() { loading = true; error = ''; });
    try {
      final page = await widget.client.request('usage.turns', {
        if (filter.isNotEmpty) 'projectId': filter,
        if (more && before != null) 'before': before,
      }) as Map;
      if (!mounted || revision != current) return;
      setState(() {
        turns = [...(more ? turns : <Map>[]), ...(page['turns'] as List).whereType<Map>()];
        projects = (page['projects'] as List? ?? []).whereType<Map>().toList();
        before = page['before'] as String?;
      });
    } catch (_) {
      if (mounted && revision == current) setState(() => error = 'Could not load turns. Try again.');
    } finally {
      if (mounted && revision == current) {
        setState(() => loading = false);
        if (refreshPending) {
          refreshPending = false;
          load();
        }
      }
    }
  }

  @override
  void dispose() {
    widget.client.removeListener(changed);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!supported) return const SizedBox.shrink();
    final names = <String, String>{
      for (final p in (widget.client.state['projects'] as List? ?? []).whereType<Map>()) '${p['id']}': '${p['name']}',
      for (final p in projects) '${p['id']}': '${p['name']}',
    };
    if (filter.isNotEmpty && filter != 'unassigned') {
      names.putIfAbsent(filter, () => 'Removed project');
    }
    final groups = <String, List<Map>>{};
    for (final turn in turns) {
      final id = '${turn['projectId'] ?? 'unassigned'}';
      (groups[id] ??= []).add(turn);
    }
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: DockFrame(child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('By project', style: TextStyle(fontSize: 20, color: blue)),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            key: ValueKey(filter),
            initialValue: filter,
            isExpanded: true,
            isDense: false,
            itemHeight: null,
            decoration: const InputDecoration(labelText: 'Project'),
            items: [
              const DropdownMenuItem(value: '', child: Text('All')),
              for (final p in names.entries)
                DropdownMenuItem(value: p.key, child: Text(p.value, maxLines: 2, overflow: TextOverflow.ellipsis)),
              const DropdownMenuItem(value: 'unassigned', child: Text('Unassigned')),
            ],
            selectedItemBuilder: (context) => [
              for (final name in ['All', ...names.values, 'Unassigned'])
                Align(alignment: AlignmentDirectional.centerStart, child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis)),
            ],
            onChanged: loading || !widget.client.connected ? null : (value) {
              setState(() { filter = value ?? ''; turns = []; before = null; });
              load();
            },
          ),
          const SizedBox(height: 12),
          const Text('Quota changes are observed per account and may include other use.', style: TextStyle(color: muted)),
          if (!widget.client.connected) const Text('Connect to your PC to update turns. Previous data may be stale.'),
          for (final group in groups.entries) ...[
            const SizedBox(height: 20),
            Text(group.key == 'unassigned' ? 'Unassigned' : names[group.key] ?? 'Removed project', key: ValueKey('turn-project-${group.key}'), style: const TextStyle(fontWeight: FontWeight.w600)),
            for (final row in group.value) _TurnRow(row: row),
          ],
          if (widget.client.connected && started && !loading && error.isEmpty && turns.isEmpty) const Padding(
            padding: EdgeInsets.only(top: 12), child: Text('No recorded turns for this project.'),
          ),
          if (error.isNotEmpty) ...[
            Text(error, style: TextStyle(color: pink)),
            if (turns.isNotEmpty) const Text('Showing previous turns. Data may be stale.'),
            TextButton(onPressed: () => load(more: before != null), child: const Text('Retry')),
          ],
          if (loading) const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator(semanticsLabel: 'Loading turns'))),
          if (before != null && error.isEmpty) TextButton(
            onPressed: loading || !widget.client.connected ? null : () => load(more: true),
            child: const Text('Load more'),
          ),
        ]),
      )),
    );
  }
}

class _TurnRow extends StatelessWidget {
  final Map row;
  const _TurnRow({required this.row});

  @override
  Widget build(BuildContext context) {
    final usage = row['usage'] is Map ? row['usage'] as Map : const {};
    final windows = (row['quota'] as List? ?? []).whereType<Map>();
    final at = usageDate(row['at']);
    String? label(dynamic value) => value is String && value.trim().isNotEmpty ? value : null;
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(label(row['model']) ?? label(row['provider']) ?? 'Not reported'),
        Text('${at == null ? 'Time unknown' : localUsageDate(context, at)} · ${row['consoleName'] ?? row['provider'] ?? 'Console'}', style: const TextStyle(color: muted)),
        Wrap(spacing: 12, runSpacing: 4, children: [
          Text('Input ${turnNumber(usage['input'])}'),
          Text('Output ${turnNumber(usage['output'])}'),
          Text('Cache reads ${turnNumber(usage['cached'])}'),
        ]),
        if (row['source'] == 'Dock API') const Text('API billing')
        else if (windows.isEmpty) const Text('Quota change: —')
        else for (final window in windows) Text(
          usagePercent(window['changePercent']) == null
            ? 'Quota change: —${label(window['reason']) == null ? '' : ' (${window['reason']})'} of ${turnWindow(window['minutes'])}'
            : 'Observed ~${turnNumber(window['changePercent'])}% of ${turnWindow(window['minutes'])}',
        ),
      ]),
    );
  }
}
