import 'package:flutter/material.dart';

import '../../console_actions.dart';
import '../../dock_client.dart';
import 'command_target.dart';
import 'composer_controller.dart';

/// Console changes confirmed in a dialog: create, close, rename, project and
/// account switching.
///
/// Every request is checked against the console, launch, PC and connection
/// the dialog was opened for. A change in between drops the request.
class ConsoleCommands {
  ConsoleCommands({
    required this.client,
    required this.run,
    required this.releaseInput,
    required this.onConsolePage,
  });

  final DockClient client;
  final RunAction run;

  /// Stops terminal typing and closes the keyboard before a dialog opens.
  final VoidCallback releaseInput;

  /// Whether the console page is showing in a mounted home screen.
  final bool Function() onConsolePage;

  void _tell(BuildContext context, String message) =>
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));

  /// Opens the new-console sheet and creates the console on the same PC and
  /// connection. [onCreated] receives the new console's ID.
  Future<void> create(
    BuildContext context, {
    required Future<void> Function(String id, bool chooseModel) onCreated,
  }) async {
    final pc = client.activePC, generation = client.generation;
    bool sameConnection() =>
        client.connected &&
        client.activePC == pc &&
        client.generation == generation;
    releaseInput();
    final value = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => NewConsoleSheet(client: client),
    );
    if (value == null || !context.mounted || !sameConnection()) return;
    await run(() async {
      final session = await client.request('console.create', value);
      if (context.mounted && sameConnection()) {
        await onCreated(session['id'] as String, value['chooseModel'] == true);
      }
    });
  }

  /// Closes the selected console, or stops its worker for task consoles.
  Future<void> close(BuildContext context, Map<String, dynamic> session) async {
    if (session['taskId'] != null) {
      await _stopWorker(context, LaunchTarget.capture(client, session));
      return;
    }
    if (!client.supports('console.close')) {
      _tell(context, 'Update Paddock on your PC to close consoles here.');
      return;
    }
    final target = CommandTarget.capture(client);
    if (target == null) return;
    bool current() => onConsolePage() && target.isCurrent(client);
    releaseInput();
    final tree = session['worktree'] as Map?;
    Map? status;
    if (tree != null) {
      try {
        status = await client.request('console.worktree.status', {
          'id': target.session,
          'launchId': session['launchId'],
        }) as Map;
      } catch (_) {
        status = null;
      }
      if (!context.mounted || !current()) return;
    }
    final choice = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Close ${session['name']}?'),
        content: Text(
          tree != null
              ? 'This ends the console and its running task. ${status?['dirty'] == false
                    ? 'The worktree is clean. Removing the folder keeps branch ${tree['branch']} and its commits.'
                    : status?['dirty'] == true
                    ? 'The worktree has uncommitted changes and will be kept at ${tree['path']}.'
                    : 'Worktree status is unavailable. The folder will be kept at ${tree['path']}.'}'
              : session['remote'] != null
              ? 'This ends the remote tmux session, including its running task. SSH-key login is required.'
              : 'This ends the console on your PC, including any running task.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Keep open'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, 'keep'),
            child: const Text('Close console'),
          ),
          if (tree != null && status?['dirty'] == false)
            FilledButton(
              onPressed: () => Navigator.pop(ctx, 'remove'),
              child: const Text('Close and remove worktree'),
            ),
        ],
      ),
    );
    if (choice != null && current()) {
      await run(
        () => client.request('console.close', {
          'id': target.session,
          'confirm': true,
          if (tree != null) ...{
            'worktree': choice,
            'launchId': session['launchId'],
          },
        }),
      );
    }
  }

  Future<void> _stopWorker(BuildContext context, LaunchTarget target) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Stop worker for ${target.session['name']}?'),
        content: const Text('All work is kept.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep running'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Stop worker'),
          ),
        ],
      ),
    );
    if (context.mounted &&
        confirmed == true &&
        client.activePC == target.pc &&
        client.generation == target.generation &&
        client.selected == target.id) {
      await run(
        () => client.request('worker.stop', {
          ...target.identity,
          'sliceId': target.session['sliceId'],
          'confirm': true,
        }),
      );
    }
  }

  /// Renames the console or changes its project (`rename` or `project`).
  Future<void> manage(
    BuildContext context,
    String action,
    LaunchTarget target,
  ) async {
    if (!client.supports('console.manage')) return;
    final session = target.session;
    Future<void> submit(Map<String, dynamic> value) => run(() async {
      if (!context.mounted || !target.isLiveLaunch(client)) {
        throw StateError('This console changed. Open its menu again.');
      }
      await client.request('console.$action', {...target.identity, ...value});
    });
    if (action == 'rename') {
      var editedName = session['name'] as String;
      final name = await showDialog<String>(
        context: context,
        builder: (ctx) => StatefulBuilder(
          builder: (ctx, update) => AlertDialog(
            title: const Text('Rename console'),
            content: TextFormField(
              initialValue: editedName,
              autofocus: true,
              maxLength: 64,
              decoration: const InputDecoration(labelText: 'Name'),
              onChanged: (value) => update(() => editedName = value),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: editedName.trim().isEmpty
                    ? null
                    : () => Navigator.pop(ctx, editedName.trim()),
                child: const Text('Save'),
              ),
            ],
          ),
        ),
      );
      if (name != null && context.mounted) await submit({'name': name});
      return;
    }
    final projects = (client.state['projects'] as List? ?? []).whereType<Map>();
    final missingProject =
        session['projectId'] != null &&
        !projects.any((project) => project['id'] == session['projectId']);
    final choice = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * .75,
      ),
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            if (missingProject)
              const ListTile(
                title: Text('Archived project'),
                enabled: false,
                selected: true,
                trailing: Icon(Icons.check),
              ),
            for (final project in <Map>[
              {'id': null, 'name': 'No project'},
              ...projects,
            ])
              ListTile(
                title: Text(project['name'] as String),
                selected: project['id'] == session['projectId'],
                trailing: project['id'] == session['projectId']
                    ? const Icon(Icons.check)
                    : null,
                onTap: () => Navigator.pop(ctx, {'projectId': project['id']}),
              ),
          ],
        ),
      ),
    );
    if (choice != null && context.mounted) await submit(choice);
  }

  Map<String, dynamic> _accountPayload(LaunchTarget target, String accountId) =>
      {
        'id': target.id,
        'launchId': target.session['launchId'],
        'consoleKey': target.session['consoleKey'],
        'accountId': target.session['accountId'],
        'targetAccountId': accountId,
      };

  /// Switches the console's CLI to another signed-in account.
  Future<void> switchAccount(
    BuildContext context,
    LaunchTarget target,
    String accountId,
  ) async {
    if (!context.mounted) return;
    if (!target.isSameAccount(client)) {
      _tell(context, 'Console changed. Open its account menu again.');
      return;
    }
    try {
      await client.request(
        'console.switch',
        _accountPayload(target, accountId),
      );
      if (!context.mounted) return;
      if (target.switchedTo(client, accountId)) {
        final label = target.launch.switchTargets
            .where((item) => item.id == accountId)
            .firstOrNull
            ?.label;
        _tell(
          context,
          'Switched to ${label == null || label.isEmpty ? 'account' : label}.',
        );
      }
    } catch (error) {
      if (!context.mounted) return;
      if (target.isSameAccount(client)) _tell(context, '$error');
    }
  }

  /// Opens a setup console on the PC for an account that needs sign-in.
  Future<void> setupAccount(
    BuildContext context,
    LaunchTarget target,
    String accountId,
  ) async {
    if (!context.mounted) return;
    if (!target.isSameAccount(client)) {
      _tell(context, 'Console changed. Open its account menu again.');
      return;
    }
    try {
      final setup = await client.request(
        'console.setup',
        _accountPayload(target, accountId),
      );
      if (!context.mounted) return;
      if (target.isSameAccount(client)) {
        _tell(context, 'Setup console opened on the PC in ${setup['cwd']}.');
      }
    } catch (error) {
      if (!context.mounted) return;
      if (target.isSameAccount(client)) _tell(context, '$error');
    }
  }
}
