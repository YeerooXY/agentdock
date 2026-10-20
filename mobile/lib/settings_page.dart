import 'package:flutter/material.dart';

import 'account_usage.dart';
import 'dock_client.dart';
import 'dock_style.dart';
import 'help_link.dart';
import 'update_panel.dart';
import 'connection_panel.dart';
import 'devices_page.dart';
import 'main.dart' show formatBytes;

class SettingsPage extends StatefulWidget {
  final DockClient client;
  const SettingsPage({super.key, required this.client});
  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  Map<String, dynamic>? usage;
  String usageError = '', message = '';
  bool loading = false, busy = false;
  bool wasConnected = false, refreshPending = false;

  @override
  void initState() {
    super.initState();
    wasConnected = widget.client.connected;
    widget.client.addListener(connectionChanged);
    loadUsage();
  }

  void connectionChanged() {
    final connected = widget.client.connected;
    if (connected && !wasConnected) {
      if (loading) {
        refreshPending = true;
      } else {
        loadUsage();
      }
    }
    wasConnected = connected;
  }

  @override
  void dispose() {
    widget.client.removeListener(connectionChanged);
    super.dispose();
  }

  Future<void> loadUsage() async {
    if (loading) return;
    setState(() {
      loading = true;
      usageError = '';
    });
    try {
      final next = await widget.client.request('usage') as Map<String, dynamic>;
      if (mounted) setState(() => usage = next);
    } catch (_) {
      if (mounted) {
        setState(
          () => usageError = widget.client.connected
              ? 'Could not refresh usage. Try again.'
              : 'Connect to your PC to refresh usage.',
        );
      }
    } finally {
      if (mounted) setState(() => loading = false);
      if (mounted && refreshPending && widget.client.connected) {
        refreshPending = false;
        loadUsage();
      }
    }
  }

  Future<void> action(Future<String?> Function() fn) async {
    if (busy) return;
    setState(() {
      busy = true;
      message = '';
    });
    try {
      final next = await fn();
      if (mounted) setState(() => message = next ?? '');
    } catch (e) {
      if (mounted) {
        setState(() => message = e.toString().replaceFirst('Bad state: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget panel(Widget child) => Padding(
    padding: const EdgeInsets.only(top: 14),
    child: DockFrame(
      child: Padding(padding: const EdgeInsets.all(18), child: child),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final c = widget.client;
    final limits = (usage?['limits'] is List ? usage!['limits'] as List : [])
        .whereType<Map>();
    final summary = usage?['summary'];
    return RefreshIndicator(
      onRefresh: loadUsage,
      color: pink,
      child: ListView(
        key: const PageStorageKey('mobile-usage'),
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          Row(
            children: [
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Account usage',
                      style: TextStyle(fontSize: 23, color: pink),
                    ),
                    Text(
                      'Shared across your consoles',
                      style: TextStyle(color: muted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Refresh usage',
                onPressed: loading || !c.connected ? null : loadUsage,
                icon: loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          semanticsLabel: 'Loading account usage',
                        ),
                      )
                    : const Icon(Icons.refresh, color: blue),
              ),
            ],
          ),
          if (usageError.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: Semantics(
                liveRegion: true,
                child: Text(
                  '$usageError${usage == null ? '' : ' Showing previous data.'}',
                  style: const TextStyle(color: pink),
                ),
              ),
            ),
          if (!loading && usage != null && limits.isEmpty)
            panel(
              const Text(
                'No account limits reported yet. Open your agent on the PC, then refresh.',
                style: TextStyle(color: muted, height: 1.5),
              ),
            ),
          for (final limit in limits)
            Padding(
              padding: const EdgeInsets.only(top: 14),
              child: AccountUsageCard(account: limit),
            ),
          if (!loading &&
              usage != null &&
              widget.client.sessions.any(
                (s) => '${s['provider']}'.toLowerCase() == 'claude',
              ) &&
              !limits.any(
                (limit) => '${limit['provider']}'.toLowerCase() == 'claude',
              ))
            Padding(
              padding: const EdgeInsets.only(top: 14),
              child: panel(
                const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AccountProviderHeader(provider: 'claude', name: 'Claude'),
                    SizedBox(height: 8),
                    Text(
                      'Waiting for subscription usage. Claude reports its limits after an AI response. Then refresh here.',
                      style: TextStyle(color: muted, height: 1.5),
                    ),
                  ],
                ),
              ),
            ),
          if (summary is Map)
            Padding(
              padding: const EdgeInsets.only(top: 14),
              child: ApiUsageCard(summary: summary),
            ),
          const SizedBox(height: 28),
          const Text(
            'App & connection',
            style: TextStyle(color: pink, fontSize: 20),
          ),
          panel(const UpdatePanel()),
          panel(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Mobile data',
                  style: TextStyle(fontSize: 18, color: blue),
                ),
                const SizedBox(height: 8),
                Text(
                  '${formatBytes(c.received + c.sent)} this app session',
                  style: const TextStyle(fontSize: 22, color: pink),
                ),
                const Text(
                  'App traffic only. Excludes updates, TLS, VPN and push overhead.',
                  style: TextStyle(color: muted, fontSize: 12, height: 1.5),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Data saver'),
                  subtitle: const Text(
                    'Batch terminal updates. Load images on demand.',
                  ),
                  value: c.dataSaver,
                  onChanged: busy
                      ? null
                      : (value) => action(() async {
                          await c.setSaver(value);
                          return null;
                        }),
                ),
              ],
            ),
          ),
          panel(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Notifications',
                  style: TextStyle(fontSize: 18, color: blue),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Console badges work while Dock is open. Background alerts currently use optional Firebase setup on your PC.',
                  style: TextStyle(color: muted, height: 1.5),
                ),
                const SizedBox(height: 12),
                ExpansionTile(
                  key: const PageStorageKey('firebase-alerts'),
                  tilePadding: EdgeInsets.zero,
                  childrenPadding: const EdgeInsets.only(top: 8),
                  title: const Text(
                    'Firebase alerts',
                    style: TextStyle(color: pink),
                  ),
                  subtitle: Text(c.alerts),
                  children: [
                    const Text(
                      'PC setup → Alerts. Google Play services are required.',
                      style: TextStyle(color: muted, fontSize: 12),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        FilledButton.icon(
                          onPressed: busy || !c.connected
                              ? null
                              : () => action(() async {
                                  await c.enableAlerts();
                                  return 'Alerts enabled. Send a test to check delivery.';
                                }),
                          icon: const Icon(Icons.notifications_outlined),
                          label: const Text('Enable alerts'),
                        ),
                        TextButton(
                          onPressed: busy || !c.connected
                              ? null
                              : () => action(() async {
                                  await c.request('push.test');
                                  return 'Test alert sent. Put Dock in the background to check it.';
                                }),
                          child: const Text('Send test alert'),
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (message.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Semantics(
                liveRegion: true,
                child: Text(message, style: const TextStyle(color: pink)),
              ),
            ),
          panel(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  c.pcName,
                  style: const TextStyle(color: blue, fontSize: 18),
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: () => openConnection(context, c),
                  child: const Text('Connection settings'),
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: () => openDevices(context, c),
                  child: const Text('Manage devices'),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Your terminals and Results stay on the PC. Removing a phone in PC setup revokes its access.',
                  style: TextStyle(color: muted, fontSize: 12, height: 1.5),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
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
      ),
    );
  }
}
