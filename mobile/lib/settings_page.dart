import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'account_usage.dart';
import 'project_turn_usage.dart';
import 'dock_client.dart';
import 'dock_style.dart';
import 'help_link.dart';
import 'update_panel.dart';
import 'connection_panel.dart';
import 'devices_page.dart';
import 'main.dart' show formatBytes;
import 'pc_settings_page.dart';
import 'console_appearance_controls.dart';

class SettingsPage extends StatefulWidget {
  final DockClient client;
  final bool usageOnly;
  const SettingsPage({super.key, required this.client, this.usageOnly = false});
  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  String category = 'General';
  Map<String, dynamic>? usage;
  String usageError = '', message = '';
  bool loading = false, busy = false;
  bool wasConnected = false, refreshPending = false;
  double textScale = 1.0;
  Timer? usageTimer;
  int turnRefreshRevision = 0;

  @override
  void initState() {
    super.initState();
    wasConnected = widget.client.connected;
    textScale = widget.client.textScale;
    widget.client.addListener(connectionChanged);
    if (widget.usageOnly) loadUsage();
    usageTimer = Timer.periodic(const Duration(minutes: 2), (_) {
      if (mounted && widget.usageOnly && widget.client.connected) loadUsage();
    });
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
    usageTimer?.cancel();
    widget.client.removeListener(connectionChanged);
    super.dispose();
  }

  Future<void> loadUsage() async {
    if (loading) return;
    setState(() {
      loading = true;
      usageError = '';
      turnRefreshRevision++;
    });
    try {
      var next = await widget.client.request('usage', {
        'refresh': true,
      }) as Map<String, dynamic>;
      if (mounted) setState(() => usage = next);
      final deadline = DateTime.now().add(const Duration(seconds: 70));
      while (mounted &&
          next['refreshing'] == true &&
          DateTime.now().isBefore(deadline)) {
        await Future<void>.delayed(const Duration(seconds: 1));
        if (!mounted) return;
        next = await widget.client.request('usage') as Map<String, dynamic>;
        if (mounted) setState(() => usage = next);
      }
      if (mounted && next['refreshing'] == true) {
        setState(
          () => usageError =
              'Some accounts are still being checked. Refresh again shortly.',
        );
      }
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
        setState(
          () => message = e is PlatformException
              ? e.message ?? 'This action is unavailable.'
              : e.toString().replaceFirst('Bad state: ', ''),
        );
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
    final accounts =
        (usage?['accounts'] is List ? usage!['accounts'] as List : [])
            .whereType<Map>();
    final summary = usage?['summary'];
    final usagePanels = <Widget>[
      LayoutBuilder(
        builder: (context, constraints) {
          final heading = Column(
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
          );
          final refresh = IconButton(
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
                : Icon(Icons.refresh, color: blue),
          );
          if (constraints.maxWidth < 360) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                heading,
                Align(alignment: Alignment.centerRight, child: refresh),
              ],
            );
          }
          return Row(
            children: [
              Expanded(child: heading),
              refresh,
            ],
          );
        },
      ),
      if (usageError.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 16),
          child: Semantics(
            liveRegion: true,
            child: Text(
              '$usageError${usage == null ? '' : ' Showing previous data.'}',
              style: TextStyle(color: pink),
            ),
          ),
        ),
      if (!loading && usage != null && accounts.isEmpty && limits.isEmpty)
        panel(
          const Text(
            'No account limits reported yet. Open your agent on the PC, then refresh.',
            style: TextStyle(color: muted, height: 1.5),
          ),
        ),
      if (accounts.isNotEmpty)
        for (final account in accounts)
          for (final limit in limits.where(
            (value) =>
                '${value['accountId'] ?? (value['provider'] == 'codex'
                        ? 'codex:default'
                        : value['id'] == 'claude:account'
                        ? 'claude:default'
                        : '')}' ==
                '${account['id']}',
          ))
            Padding(
              padding: const EdgeInsets.only(top: 14),
              child: AccountUsageCard(
                account: {
                  ...limit,
                  'accountLabel': account['label'],
                  'usageCheck': account['usageCheck'],
                },
              ),
            ),
      if (accounts.isNotEmpty)
        for (final account in accounts)
          if (!limits.any(
            (value) =>
                '${value['accountId'] ?? (value['provider'] == 'codex'
                        ? 'codex:default'
                        : value['id'] == 'claude:account'
                        ? 'claude:default'
                        : '')}' ==
                '${account['id']}',
          ))
            Padding(
              padding: const EdgeInsets.only(top: 14),
              child: AccountUsageCard(
                account: {
                  'provider': account['provider'],
                  'accountLabel': account['label'],
                  'name': account['label'],
                  'observedAt': null,
                  'windows': const [],
                  'usageCheck': account['usageCheck'],
                },
              ),
            ),
      for (final limit in limits.where(
        (value) => !accounts.any(
          (account) =>
              '${value['accountId'] ?? (value['provider'] == 'codex'
                      ? 'codex:default'
                      : value['id'] == 'claude:account'
                      ? 'claude:default'
                      : '')}' ==
              '${account['id']}',
        ),
      ))
        Padding(
          padding: const EdgeInsets.only(top: 14),
          child: AccountUsageCard(
            account: {
              ...limit,
              'accountLabel': limit['name'] ?? limit['provider'] ?? 'Account',
            },
          ),
        ),
      ProjectTurnUsage(
        key: const ValueKey('project-turn-usage'),
        client: c,
        refreshRevision: turnRefreshRevision,
      ),
      if (usage?['threshold'] is num)
        Padding(
          padding: const EdgeInsets.only(top: 14),
          child: panel(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Switch offer threshold: ${usage!['threshold']}% · Automatic switching ${usage!['autoSwitch'] == true ? 'on' : 'off'}',
                  style: const TextStyle(color: muted),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Use subscriptions within provider terms. Switching accounts must respect each provider?s rate limits and restrictions.',
                  style: TextStyle(color: muted, height: 1.45),
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
    ];
    final generalPanels = <Widget>[
      panel(const UpdatePanel()),
      panel(
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Mobile data', style: TextStyle(fontSize: 18, color: blue)),
            const SizedBox(height: 8),
            Text(
              '${formatBytes(c.received + c.sent)} this app session',
              style: TextStyle(fontSize: 22, color: pink),
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
            Text('Notifications', style: TextStyle(fontSize: 18, color: blue)),
            const SizedBox(height: 10),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Stay connected'),
              subtitle: const Text(
                'Alerts come straight from the selected PC. Uses extra battery and data; Android may delay alerts in power-saving mode.',
              ),
              value: c.stayConnected,
              onChanged: busy
                  ? null
                  : (value) => action(() async {
                      await c.setStayConnected(value);
                      return value
                          ? 'Direct alerts enabled. Keep the PC running.'
                          : 'Direct alerts disabled.';
                    }),
            ),
            TextButton(
              onPressed: () => action(() async {
                await DockClient.background.invokeMethod('settings');
                return null;
              }),
              child: const Text('Android notification & battery settings'),
            ),
          ],
        ),
      ),
      if (message.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Semantics(
            liveRegion: true,
            child: Text(message, style: TextStyle(color: pink)),
          ),
        ),
      const SizedBox(height: 12),
      const HelpLink(),
      TextButton(
        onPressed: () => showLicensePage(
          context: context,
          applicationName: 'Paddock',
          applicationVersion: '0.6 preview',
        ),
        child: const Text('Open-source licenses'),
      ),
    ];
    final appearancePanels = <Widget>[
      panel(ConsoleAppearanceControls(client: c)),
      panel(
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Text size', style: TextStyle(fontSize: 18, color: blue)),
            Text(
              '${(textScale * 100).round()}% · applies to menus and controls',
              style: const TextStyle(color: muted, fontSize: 12),
            ),
            Slider(
              value: textScale,
              min: .85,
              max: 1.15,
              divisions: 6,
              label: '${(textScale * 100).round()}%',
              onChanged: (value) => setState(() => textScale = value),
              onChangeEnd: (value) => action(() async {
                await c.setTextScale(value);
                return null;
              }),
            ),
            const Wrap(
              alignment: WrapAlignment.spaceBetween,
              runSpacing: 4,
              children: [
                Text('Smaller', style: TextStyle(color: muted, fontSize: 12)),
                Text('Larger', style: TextStyle(color: muted, fontSize: 12)),
              ],
            ),
          ],
        ),
      ),
    ];
    final devicePanels = <Widget>[
      panel(
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(c.pcName, style: TextStyle(color: blue, fontSize: 18)),
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
    ];
    if (!widget.usageOnly &&
        ['API', 'Keys', 'Tools', 'Instructions'].contains(category)) {
      return Column(
        children: [
          categoryNavigation(),
          Expanded(
            child: PCSettingsPage(client: c, category: category),
          ),
        ],
      );
    }
    final panels = widget.usageOnly
        ? usagePanels
        : category == 'Appearance'
        ? appearancePanels
        : category == 'Devices'
        ? devicePanels
        : generalPanels;
    return Column(
      children: [
        if (!widget.usageOnly) categoryNavigation(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: widget.usageOnly ? loadUsage : () async {},
            color: pink,
            child: ListView(
              key: PageStorageKey(
                'mobile-settings-$category-${widget.usageOnly}',
              ),
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              children: panels,
            ),
          ),
        ),
      ],
    );
  }

  Widget categoryNavigation() => Padding(
    padding: const EdgeInsets.all(12),
    child: Wrap(
      spacing: 8,
      runSpacing: 4,
      children:
          [
                'General',
                'Appearance',
                'Devices',
                'API',
                'Keys',
                'Tools',
                'Instructions',
              ]
              .map(
                (name) => ChoiceChip(
                  label: Text(name),
                  selected: category == name,
                  onSelected: (_) => setState(() => category = name),
                ),
              )
              .toList(),
    ),
  );
}
