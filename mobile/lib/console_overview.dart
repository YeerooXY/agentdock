import 'package:flutter/material.dart';

import 'agent_identity.dart';
import 'dock_client.dart';
import 'dock_style.dart';
import 'terminal_reading.dart';

enum ConsoleFilter {
  all('All'),
  needsYou('Needs you'),
  working('Working'),
  ready('Ready');

  final String label;
  const ConsoleFilter(this.label);

  bool matches(Map<String, dynamic> session) => switch (this) {
    all => true,
    needsYou => ['attention', 'error'].contains(session['state']),
    working => ['working', 'active'].contains(session['state']),
    // Acknowledging a ready console changes its host state to open.
    ready => ['ready', 'open', 'idle'].contains(session['state']),
  };
}

class ConsoleOverview extends StatefulWidget {
  final DockClient client;
  final ValueChanged<String> onSelected;
  final VoidCallback onNewConsole;
  const ConsoleOverview({
    super.key,
    required this.client,
    required this.onSelected,
    required this.onNewConsole,
  });

  @override
  State<ConsoleOverview> createState() => _ConsoleOverviewState();
}

class _ConsoleOverviewState extends State<ConsoleOverview> {
  ConsoleFilter? _filter;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.client,
    builder: (context, _) {
      final client = widget.client;
      final sessions = client.sessions;
      final filter = _filter ??
          (sessions.any(ConsoleFilter.needsYou.matches)
              ? ConsoleFilter.needsYou
              : ConsoleFilter.all);
      final visible = sessions.where(filter.matches).toList();
      return CustomScrollView(
        key: const PageStorageKey('all-consoles-scroll'),
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            sliver: SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text('All consoles',
                            style: Theme.of(context).textTheme.titleMedium),
                      ),
                      IconButton(
                        tooltip: 'New console',
                        onPressed: client.connected ? widget.onNewConsole : null,
                        icon: const Icon(Icons.add),
                      ),
                    ],
                  ),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      for (final value in ConsoleFilter.values)
                        FilterChip(
                          key: ValueKey('console-filter-${value.name}'),
                          label: Text('${value.label} ${sessions.where(value.matches).length}'),
                          selected: filter == value,
                          onSelected: (_) => setState(() => _filter = value),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          if (visible.isEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(sessions.isEmpty ? 'No consoles' : 'No matching consoles',
                    style: const TextStyle(color: muted)),
              ),
            ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            sliver: SliverList.builder(
              itemCount: visible.length,
              itemBuilder: (context, index) {
                final session = visible[index];
                final id = session['id'] as String;
                final project = (client.state['projects'] as List? ?? [])
                    .whereType<Map>()
                    .where((p) => p['id'] == session['projectId'])
                    .firstOrNull;
                final hex = '${project?['color'] ?? ''}'.replaceFirst('#', '');
                final color = hex.length == 6 ? int.tryParse(hex, radix: 16) : null;
                final (label, statusColor) = switch (session['state']) {
                  'working' || 'active' => ('Working', blue),
                  'ready' || 'open' || 'idle' => ('Ready', const Color(0xff74c69a)),
                  'attention' => ('Needs you', const Color(0xffffcd75)),
                  'error' => ('Error', const Color(0xffff8a94)),
                  'ended' || 'closed' => ('Ended', muted),
                  _ => ('Unknown', muted),
                };
                final details = [
                  session['modelName'] ?? session['model'],
                  session['accountLabel'],
                ].whereType<String>().where((s) => s.isNotEmpty).join(' · ');
                final screen = client.screens[id];
                // Only use output already cached on this phone. This may be
                // older than the live output of a console that is not selected.
                final output = screen == null ? '' : terminalReadingText(screen.terminal);
                final lastLine = output.substring(output.lastIndexOf('\n') + 1).trim();
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: DockFrame(
                    ready: ConsoleFilter.ready.matches(session),
                    radius: 12,
                    child: InkWell(
                      key: ValueKey('console-card-$id'),
                      onTap: client.connected ? () => widget.onSelected(id) : null,
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            AgentMark(session['provider'] as String, size: 24),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(session['name'] as String,
                                      maxLines: 2, overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontWeight: FontWeight.w600)),
                                  if (session['projectId'] != null)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 4),
                                      child: Row(
                                        children: [
                                          if (color != null) ...[
                                            CircleAvatar(radius: 4,
                                                backgroundColor: Color(0xff000000 | color)),
                                            const SizedBox(width: 6),
                                          ],
                                          Expanded(child: Text('${project?['name'] ?? 'Archived project'}',
                                              maxLines: 2, overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(color: muted, fontSize: 12))),
                                        ],
                                      ),
                                    ),
                                  const SizedBox(height: 4),
                                  Text(label, style: TextStyle(color: statusColor)),
                                  if (details.isNotEmpty)
                                    Text(details, maxLines: 2, overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(color: muted, fontSize: 12)),
                                  if (lastLine.isNotEmpty)
                                    Text(lastLine, maxLines: 1, overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(color: muted, fontSize: 12)),
                                ],
                              ),
                            ),
                            if (id == client.selected)
                              Icon(Icons.check, size: 18, color: pink),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      );
    },
  );
}
