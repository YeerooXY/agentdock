import 'package:flutter/material.dart';

import '../../console_appearance_controls.dart';
import '../../dock_client.dart';
import '../../dock_style.dart';
import '../../preview_page.dart';
import '../../update_panel.dart';
import 'composer_controller.dart';

Widget _row(
  BuildContext context,
  String label,
  IconData icon,
  VoidCallback open,
) => ListTile(
  leading: Icon(icon),
  title: Text(label),
  onTap: () {
    Navigator.pop(context);
    open();
  },
);

Future<void> _menuSheet(BuildContext context, List<Widget> rows) =>
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => SafeArea(
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: rows),
        ),
      ),
    );

/// Display, style, copy, links and history options for one console.
Future<void> showConsoleViewOptions(
  BuildContext context, {
  required VoidCallback onDisplay,
  required VoidCallback onStyle,
  required VoidCallback onCopy,
  required VoidCallback onLinks,
  required VoidCallback onClearHistory,
}) => _menuSheet(context, [
  _row(context, 'Text & display', Icons.text_fields, onDisplay),
  _row(context, 'Console style', Icons.palette_outlined, onStyle),
  _row(context, 'Copy text', Icons.copy, onCopy),
  _row(context, 'Console links', Icons.link, onLinks),
  _row(
    context,
    'Clear mobile history',
    Icons.delete_sweep_outlined,
    onClearHistory,
  ),
]);

/// Previews, updates and reconnect.
Future<void> showAppOptions(
  BuildContext context,
  DockClient client,
  RunAction run,
) => _menuSheet(context, [
  _row(context, 'Previews', Icons.visibility_outlined, () {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => PreviewListPage(client: client)),
    );
  }),
  _row(context, 'App updates', Icons.system_update, () => openUpdates(context)),
  _row(context, 'Reconnect', Icons.sync, () => run(client.reconnect)),
]);

/// Wrap/grid layout and the app's text size.
Future<void> showDisplaySettings(
  BuildContext context,
  DockClient client, {
  required bool Function() fitWidth,
  required ValueChanged<bool> onFitWidth,
  required RunAction run,
}) => showModalBottomSheet<void>(
  context: context,
  showDragHandle: true,
  isScrollControlled: true,
  builder: (context) => StatefulBuilder(
    builder: (context, update) => SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Text & display',
                style: TextStyle(fontSize: 22, color: pink),
              ),
            ),
            const SizedBox(height: 16),
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(
                  value: false,
                  icon: Icon(Icons.wrap_text),
                  label: Text('Wrap text'),
                ),
                ButtonSegment(
                  value: true,
                  icon: Icon(Icons.grid_view),
                  label: Text('Grid'),
                ),
              ],
              selected: {fitWidth()},
              onSelectionChanged: (value) {
                onFitWidth(value.single);
                update(() {});
              },
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                const Expanded(child: Text('Text size')),
                Text(
                  '${(client.textScale * 100).round()}%',
                  style: TextStyle(color: blue),
                ),
              ],
            ),
            Slider(
              value: client.textScale,
              min: .85,
              max: 1.15,
              divisions: 6,
              label: '${(client.textScale * 100).round()}%',
              onChanged: (value) {
                run(() => client.setTextScale(value, save: false));
                update(() {});
              },
              onChangeEnd: (value) => run(() => client.setTextScale(value)),
            ),
            if (fitWidth())
              const Text(
                'Grid fits the PC’s columns. Use Wrap text for larger terminal text.',
                style: TextStyle(color: muted),
              ),
          ],
        ),
      ),
    ),
  ),
);

/// Theme, lighting and motion for consoles.
Future<void> showAppearanceSettings(BuildContext context, DockClient client) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (context) => SizedBox(
        height: MediaQuery.sizeOf(context).height * .85,
        child: SafeArea(
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: IconButton(
                  tooltip: 'Close appearance',
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                  child: ConsoleAppearanceControls(client: client),
                ),
              ),
            ],
          ),
        ),
      ),
    );
