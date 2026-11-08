import 'package:flutter/material.dart';

import '../../dock_client.dart';
import '../../dock_style.dart';
import 'command_target.dart';

/// The app bar's More options menu.
///
/// Console items act on the launch that was showing when the menu opened.
/// That launch is pinned, so a console change while the menu is open cannot
/// redirect a rename, project change or account switch to another console.
class ConsoleMoreMenu extends StatefulWidget {
  const ConsoleMoreMenu({
    super.key,
    required this.client,
    required this.consoleItems,
    required this.current,
    required this.onOpened,
    required this.onCode,
    required this.onManage,
    required this.onSwitchAccount,
    required this.onSetupAccount,
    required this.onApp,
    required this.onView,
    required this.onConsoleAction,
  });

  final DockClient client;

  /// Whether console items are shown (the console page with a console open).
  final bool consoleItems;

  /// The console showing now, or null on the overview.
  final Map<String, dynamic>? current;
  final VoidCallback onOpened;
  final ValueChanged<LaunchTarget> onCode;
  final void Function(String action, LaunchTarget target) onManage;
  final void Function(LaunchTarget target, String accountId) onSwitchAccount;
  final void Function(LaunchTarget target, String accountId) onSetupAccount;
  final VoidCallback onApp;
  final ValueChanged<Map<String, dynamic>> onView;
  final void Function(String action, Map<String, dynamic> session)
  onConsoleAction;

  @override
  State<ConsoleMoreMenu> createState() => _ConsoleMoreMenuState();
}

class _ConsoleMoreMenuState extends State<ConsoleMoreMenu> {
  LaunchTarget? pinned;

  void _tell(String message) =>
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));

  void _selected(String action) {
    final c = widget.client, current = widget.current;
    final target = pinned;
    pinned = null;
    if (action == 'code') {
      if (target != null &&
          c.activePC == target.pc &&
          c.generation == target.generation &&
          c.connected) {
        widget.onCode(target);
      }
      return;
    }
    if (action == 'rename' || action == 'project') {
      if (target != null) {
        widget.onManage(action, target);
      } else {
        _tell('This console changed. Open its menu again.');
      }
      return;
    }
    const setup = 'account-setup:', change = 'account-switch:';
    if (action.startsWith(change) || action.startsWith(setup)) {
      if (target == null) {
        _tell('Console changed. Open its account menu again.');
      } else if (action.startsWith(setup)) {
        widget.onSetupAccount(target, action.substring(setup.length));
      } else {
        widget.onSwitchAccount(target, action.substring(change.length));
      }
      return;
    }
    if (action == 'app') widget.onApp();
    if (action == 'view' && current != null) {
      widget.onView(Map<String, dynamic>.from(current));
    }
    if (current != null) widget.onConsoleAction(action, current);
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.client;
    final menuSession = pinned?.session ?? widget.current;
    return PopupMenuButton<String>(
      tooltip: 'More options',
      icon: Icon(Icons.more_vert, color: pink),
      onOpened: () {
        final current = widget.current;
        pinned = current == null ? null : LaunchTarget.capture(c, current);
        widget.onOpened();
      },
      onCanceled: () => pinned = null,
      onSelected: _selected,
      itemBuilder: (_) => [
        if (widget.consoleItems && menuSession != null)
          ..._consoleItems(c, menuSession),
        const PopupMenuItem(value: 'app', child: Text('App & connection')),
      ],
    );
  }

  List<PopupMenuEntry<String>> _consoleItems(
    DockClient c,
    Map<String, dynamic> session,
  ) {
    final worker = session['taskId'] != null;
    final readyTargets = (session['switchTargets'] as List? ?? [])
        .whereType<Map>()
        .where((target) => target['ready'] == true);
    return [
      if (c.supports('code.read') &&
          session['remote'] == null &&
          !['code', 'web'].contains(session['purpose']))
        PopupMenuItem(
          value: 'code',
          enabled: c.connected,
          child: const Text('Code'),
        ),
      if (c.supports('console.manage') && !worker) ...[
        PopupMenuItem(
          value: 'rename',
          enabled: c.connected && session['alive'] == true,
          child: const Text('Rename'),
        ),
        PopupMenuItem(
          value: 'project',
          enabled: c.connected && session['alive'] == true,
          child: const Text('Project'),
        ),
      ],
      if (!worker &&
          (session['switchMethod'] == 'resume' ||
              (session['switchMethod'] == null &&
                  ['codex', 'claude'].contains(session['provider']))) &&
          session['draftSupported'] == true &&
          session['switching'] != true) ...[
        for (final target in readyTargets)
          PopupMenuItem(
            value: 'account-switch:${target['id']}',
            child: Text('Switch to ${target['label']}'),
          ),
        for (final target in readyTargets)
          PopupMenuItem(
            value: 'account-setup:${target['id']}',
            child: Text('Set up ${target['label']}'),
          ),
      ],
      if (session['accountLabel'] is String)
        PopupMenuItem(
          enabled: false,
          child: Text('Account, ${session['accountLabel']}'),
        ),
      const PopupMenuItem(value: 'view', child: Text('View options')),
      PopupMenuItem(
        value: 'keyboard',
        enabled: c.connected && !worker,
        child: const Text('Type directly in terminal'),
      ),
      PopupMenuItem(
        value: 'close',
        enabled: c.connected,
        child: Text(worker ? 'Stop worker' : 'Close console'),
      ),
      const PopupMenuDivider(),
    ];
  }
}
