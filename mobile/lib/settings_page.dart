import 'package:flutter/material.dart';

import 'dock_client.dart';
import 'help_link.dart';
import 'main.dart' show blue, pink, formatBytes;

class SettingsPage extends StatefulWidget {
  final DockClient client;
  const SettingsPage({super.key, required this.client});
  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  Map<String, dynamic>? usage;
  String message = '';
  bool busy = false;
  @override
  void initState() {
    super.initState();
    action(() async {
      usage = await widget.client.request('usage') as Map<String, dynamic>;
    });
  }

  Future<void> action(Future<void> Function() fn) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await fn();
    } catch (e) {
      message = e.toString().replaceFirst('Bad state: ', '');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.client;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text('Mobile data', style: TextStyle(fontSize: 23, color: pink)),
        const SizedBox(height: 12),
        Text(
          '${formatBytes(c.received + c.sent)} this app session',
          style: const TextStyle(fontSize: 19, color: blue),
        ),
        const Text(
          'Compressed app traffic. VPN, TLS and push overhead are not included.',
          style: TextStyle(color: Color(0xffb3bad0), height: 1.5),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Data saver'),
          subtitle: const Text(
            'Batch terminal updates. Images load only when opened.',
          ),
          value: c.dataSaver,
          onChanged: (value) => action(() => c.setSaver(value)),
        ),
        const Divider(height: 34),
        const Text('Cloud alerts', style: TextStyle(fontSize: 23, color: pink)),
        const SizedBox(height: 10),
        const Text(
          'Configure your own Firebase project in PC setup → Alerts. Google Play services are required.',
        ),
        const SizedBox(height: 14),
        FilledButton.icon(
          onPressed: busy
              ? null
              : () => action(() async {
                  await c.enableAlerts();
                  message = 'Alerts enabled. Send a test to check delivery.';
                }),
          icon: const Icon(Icons.notifications_outlined),
          label: const Text('Enable alerts'),
        ),
        TextButton(
          onPressed: busy || !c.connected
              ? null
              : () => action(() async {
                  await c.request('push.test');
                  message = 'Test alert sent. Put Dock in the background to check it.';
                }),
          child: const Text('Send test alert'),
        ),
        if (message.isNotEmpty)
          Text(message, style: const TextStyle(color: pink)),
        const Divider(height: 34),
        const Text(
          'Account usage',
          style: TextStyle(fontSize: 23, color: pink),
        ),
        const SizedBox(height: 12),
        ...usageViews(),
        const Divider(height: 34),
        Text(
          c.pairing?['name'] as String? ?? 'Your PC',
          style: const TextStyle(color: blue, fontSize: 20),
        ),
        const SizedBox(height: 12),
        OutlinedButton(
          onPressed: () => action(c.forget),
          child: const Text('Forget this PC'),
        ),
        const SizedBox(height: 12),
        const Text(
          'Your terminals and Results stay on the PC. Removing a phone in PC setup revokes its access.',
          style: TextStyle(color: Color(0xffb3bad0), height: 1.6),
        ),
        const HelpLink(),
        TextButton(
          onPressed: () => showLicensePage(
            context: context,
            applicationName: 'Agent Dock',
            applicationVersion: '0.6 preview',
          ),
          child: const Text('Open-source licenses'),
        ),
      ],
    );
  }

  List<Widget> usageViews() {
    final limits = usage?['limits'] as List? ?? [],
        summary = usage?['summary'] as Map<String, dynamic>?;
    return [
      if (limits.isEmpty) const Text('No account limits available yet.'),
      for (final limit in limits) ...[
        Text(
          '${limit['name'] ?? limit['provider']}',
          style: const TextStyle(color: blue),
        ),
        Text(
          limit['observedAt'] == null
              ? 'Last update unknown'
              : '${DateTime.now().millisecondsSinceEpoch - (limit['observedAt'] as num) > 600000 ? 'Stale · ' : ''}Updated ${DateTime.fromMillisecondsSinceEpoch((limit['observedAt'] as num).toInt()).toLocal().toString().substring(0, 16)}',
          style: const TextStyle(fontSize: 12),
        ),
        for (final window in limit['windows'] as List? ?? [])
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(
              window['minutes'] == 300
                  ? '5 hours'
                  : window['minutes'] == 10080
                  ? 'Weekly'
                  : window['minutes'] == null
                  ? 'Account window'
                  : '${window['minutes']} minutes',
            ),
            subtitle: Text(
              '${window['usedPercent'] ?? 'Unknown'}% used${window['resetsAt'] == null ? '' : ' · Resets ${DateTime.fromMillisecondsSinceEpoch((window['resetsAt'] as num).toInt()).toLocal().toString().substring(0, 16)}'}',
            ),
          ),
        const SizedBox(height: 12),
      ],
      if (summary != null)
        Text(
          'Known API estimate: ${summary['cost'] == null ? 'Unknown' : '\$${(summary['cost'] as num).toStringAsFixed(4)}'} · last 30 days\n${summary['unpriced'] ?? 0} unpriced requests · ${summary['unknownUsage'] ?? 0} with unknown usage\nOnly requests made through Dock are included.',
          style: const TextStyle(height: 1.7, fontSize: 12),
        ),
    ];
  }
}
