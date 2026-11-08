import 'package:flutter/material.dart';

import '../../console_switcher.dart';
import '../../core/widgets/status_dot.dart';
import '../../dock_client.dart';
import '../../dock_style.dart';

/// App bar title on the console page: console switcher, state and PC name.
class ConsoleTitle extends StatelessWidget {
  const ConsoleTitle({
    super.key,
    required this.client,
    required this.current,
    required this.overviewShown,
    required this.onOpened,
    required this.onSelected,
  });

  final DockClient client;
  final Map<String, dynamic>? current;
  final bool overviewShown;
  final VoidCallback onOpened;

  /// A console ID, [ConsoleSwitcher.allConsoles] or `+` for a new console.
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final c = client, current = this.current;
    return Row(
      children: [
        Expanded(
          child: ConsoleSwitcher(
            client: c,
            name: overviewShown || current == null
                ? 'All consoles'
                : current['name'] as String,
            showAgentMark: false,
            showProjectName: !overviewShown,
            onOpened: onOpened,
            onSelected: onSelected,
          ),
        ),
        if (!overviewShown)
          StatusDot(
            state: !c.connected
                ? 'disconnected'
                : current?['state'] as String? ?? 'active',
          ),
        const SizedBox(width: 5),
        Icon(Icons.desktop_windows, size: 14, color: blue),
        const SizedBox(width: 3),
        ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: MediaQuery.sizeOf(context).width * .23,
          ),
          child: Text(
            c.pcName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 11, color: blue),
          ),
        ),
      ],
    );
  }
}
