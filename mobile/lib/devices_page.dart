import 'package:flutter/material.dart';

import 'dock_client.dart';
import 'dock_style.dart';
import 'saved_devices.dart';
import 'pair_page.dart';

Future<void> openDevices(BuildContext context, DockClient client) =>
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => DevicesPage(client: client)),
    );

class DevicesPage extends StatefulWidget {
  final DockClient client;
  const DevicesPage({super.key, required this.client});
  @override
  State<DevicesPage> createState() => _DevicesPageState();
}

class _DevicesPageState extends State<DevicesPage> {
  DockClient get c => widget.client;
  bool busy = false;
  String error = '';
  Future<void> run(Future<void> Function() action) async {
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await action();
    } catch (e) {
      if (mounted) {
        setState(
          () => error = e.toString().replaceFirst(
            RegExp(r'^(Bad state: |FormatException: )'),
            '',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> rename({Map<String, dynamic>? pc}) async {
    final input = TextEditingController(
      text: pc == null ? c.phoneName : SavedDevices.label(pc),
    );
    final value = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(pc == null ? 'This phone’s name' : 'Computer name'),
        content: TextField(
          controller: input,
          autofocus: true,
          maxLength: 64,
          decoration: const InputDecoration(labelText: 'Name'),
          onSubmitted: (value) => Navigator.pop(ctx, value),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, input.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    // The dialog may still animate out with its field mounted.
    await Future<void>.delayed(const Duration(milliseconds: 250));
    input.dispose();
    if (value == null || !mounted) return;
    await run(
      () => pc == null
          ? c.renamePhone(value)
          : c.renamePC(pc['pin'] as String, value),
    );
  }

  Future<void> forget(Map<String, dynamic> pc) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Forget ${SavedDevices.label(pc)}?'),
        content: const Text(
          'You’ll need to pair this computer again. Other computers stay saved. Remove this phone in that PC’s setup to revoke access and stop its alerts.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Forget'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await run(() => c.forgetPC(pc['pin'] as String));
    }
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: c,
    builder: (context, _) => Scaffold(
      appBar: AppBar(title: const Text('Devices')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.smartphone, color: pink),
              title: Text(c.phoneName),
              subtitle: const Text('This phone'),
              trailing: IconButton(
                tooltip: 'Rename this phone',
                onPressed: busy ? null : () => rename(),
                icon: Icon(Icons.edit_outlined, color: blue),
              ),
            ),
            const Divider(height: 32),
            Text(
              'Computers',
              style: TextStyle(
                fontSize: 22,
                color: pink,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 12),
            ...c.devices.pcs.map((pc) {
              final active = pc['pin'] == c.activePC;
              final host =
                  Uri.tryParse((pc['manualUrl'] ?? pc['url']) as String? ?? '')
                      ?.host ??
                  '';
              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: BorderSide(
                    color: active ? pink : blue.withValues(alpha: .4),
                  ),
                ),
                child: ListTile(
                  contentPadding: const EdgeInsets.fromLTRB(16, 8, 4, 8),
                  leading: Icon(
                    active ? Icons.desktop_windows : Icons.computer,
                    color: active ? pink : blue,
                  ),
                  title: Text(SavedDevices.label(pc)),
                  subtitle: Text(
                    '${active ? (c.connected ? 'Connected' : 'Selected · ${c.status}') : 'Saved'}\n$host',
                  ),
                  isThreeLine: true,
                  onTap: busy || active
                      ? null
                      : () => run(() async {
                          await c.switchPC(pc['pin'] as String);
                          if (context.mounted) Navigator.pop(context);
                        }),
                  trailing: PopupMenuButton<String>(
                    enabled: !busy,
                    tooltip: 'Options for ${SavedDevices.label(pc)}',
                    onSelected: (action) =>
                        action == 'rename' ? rename(pc: pc) : forget(pc),
                    itemBuilder: (_) => const [
                      PopupMenuItem(
                        value: 'rename',
                        child: Text('Rename on this phone'),
                      ),
                      PopupMenuItem(
                        value: 'forget',
                        child: Text('Forget computer'),
                      ),
                    ],
                  ),
                ),
              );
            }),
            FilledButton.icon(
              onPressed: busy
                  ? null
                  : () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => PairPage(client: c, adding: true),
                      ),
                    ),
              icon: const Icon(Icons.add),
              label: const Text('Add computer'),
            ),
            if (error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 16),
                child: Text(error, style: TextStyle(color: pink)),
              ),
          ],
        ),
      ),
    ),
  );
}
