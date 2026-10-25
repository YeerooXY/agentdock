import 'dart:async';

import 'package:flutter/material.dart';
import 'package:xterm/xterm.dart';

import 'agent_identity.dart';
import 'agent_menu.dart';
import 'agent_selection.dart';
import 'dock_client.dart';
import 'dock_style.dart';

/// The terminal receives commands only after an explicit Apply.
class LiveAgentControls extends StatefulWidget {
  final DockClient client;
  final String action;
  const LiveAgentControls({
    super.key,
    required this.client,
    required this.action,
  });
  @override
  State<LiveAgentControls> createState() => _LiveAgentControlsState();
}

class _LiveAgentControlsState extends State<LiveAgentControls> {
  DockClient get c => widget.client;
  late final pc = c.activePC, id = c.selected, generation = c.generation;
  late final String initialProvider;
  late final dynamic chat;
  late final AgentSelection initial;
  Terminal? terminal;
  List<Map<String, dynamic>> models = [];
  String? model, effort;
  String error = '';
  bool loading = true, busy = false, attempted = false;
  Map get session => c.sessions.where((s) => s['id'] == id).firstOrNull ?? {};
  String get provider => '${session['provider']}'.toLowerCase();
  bool get current =>
      mounted &&
      c.connected &&
      c.foreground &&
      c.activePC == pc &&
      c.selected == id &&
      c.generation == generation &&
      provider == initialProvider &&
      session['providerSessionId'] == chat;
  AgentMenu? get menu =>
      terminal == null ? null : AgentMenu.parse(activeTerminalText(terminal!));
  bool get idle =>
      current &&
      terminal != null &&
      ['open', 'ready', 'idle'].contains(session['state']) &&
      hasEmptyAgentPrompt(terminal!, provider);
  Map<String, dynamic>? get chosen =>
      models.where((x) => x['id'] == model).firstOrNull;
  List<String> get efforts =>
      (chosen?['efforts'] as List? ?? []).whereType<String>().toList();
  bool get unchanged =>
      model == initial.model && (effort == initial.effort || efforts.isEmpty);

  @override
  void initState() {
    super.initState();
    initialProvider = provider;
    chat = session['providerSessionId'];
    initial = c.agentSelection(id);
    model = initial.model;
    effort = initial.effort;
    c.addListener(changed);
    listenToTerminal();
    load();
  }

  void listenToTerminal() {
    final next = c.screens[id]?.terminal;
    if (next == terminal) return;
    terminal?.removeListener(changed);
    terminal = next;
    terminal?.addListener(changed);
  }

  void changed() {
    if (mounted) {
      listenToTerminal();
      setState(() {});
    }
  }

  @override
  void dispose() {
    c.removeListener(changed);
    terminal?.removeListener(changed);
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = '';
    });
    try {
      final result = await c.request('console.models', {'provider': provider});
      if (!current) return;
      final values = (result is Map ? result['models'] as List? : null) ?? [];
      models = values
          .whereType<Map>()
          .map((x) => Map<String, dynamic>.from(x))
          .toList();
      if (models.isEmpty) {
        throw StateError(
          'Model choices are unavailable. Retry or use the terminal.',
        );
      }
      if (model != null && chosen == null) {
        models.insert(0, {
          'id': model,
          'name': modelLabel(model!),
          'efforts': provider == 'claude'
              ? models.first['efforts'] ?? <String>[]
              : <String>[],
        });
      }
      if (effort != null && !efforts.contains(effort)) effort = null;
    } catch (e) {
      if (mounted) error = e.toString().replaceFirst('Bad state: ', '');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> waitFor(bool Function() ready) async {
    final done = Completer<void>();
    Timer? poll, deadline;
    void check() {
      if (done.isCompleted) return;
      try {
        if (!current) {
          throw StateError('Connection or chat changed. Reopen the chooser.');
        }
        if (ready()) done.complete();
      } catch (e, stack) {
        done.completeError(e, stack);
      }
    }

    check();
    if (!done.isCompleted) {
      poll = Timer.periodic(const Duration(milliseconds: 50), (_) => check());
      deadline = Timer(const Duration(seconds: 6), () {
        if (!done.isCompleted) {
          done.completeError(
            StateError(
              'Could not confirm the change. Check the terminal before trying again.',
            ),
          );
        }
      });
    }
    try {
      await done.future;
    } finally {
      poll?.cancel();
      deadline?.cancel();
    }
  }

  int optionIndex(AgentMenu live, String value, {String? name}) {
    final labels = {
      value.toLowerCase(),
      if (name != null) name.toLowerCase(),
      if (value == 'xhigh') 'extra high',
    };
    return live.options.indexWhere(
      (text) => labels.any(
        (label) => RegExp(
          '(^|[^a-z0-9])${RegExp.escape(label)}(?=[^a-z0-9]|\$)',
          caseSensitive: false,
        ).hasMatch(text),
      ),
    );
  }

  Future<void> choose(AgentMenu expected, int index) async {
    if (index < 0) {
      throw StateError(
        'The agent does not offer this choice. Refresh the chooser.',
      );
    }
    AgentMenu checked() {
      final now = menu;
      if (!current || now == null || now.signature != expected.signature) {
        throw StateError('The agent menu changed. Check the terminal.');
      }
      return now;
    }

    var now = checked();
    while (now.selected != index) {
      final next = now.selected + (index > now.selected ? 1 : -1);
      await c.input(index > now.selected ? '\x1b[B' : '\x1b[A', id: id);
      await waitFor(() => menu != null && checked().selected == next);
      now = checked();
    }
    final before = activeTerminalText(terminal!);
    checked();
    await c.input(now.sessionOnly ? 's' : '\r', id: id);
    await waitFor(() => activeTerminalText(terminal!) != before);
  }

  Future<void> apply() async {
    if (!current || busy || loading) return;
    if (unchanged) {
      Navigator.pop(context);
      return;
    }
    if (!idle || menu != null) {
      setState(
        () => error = 'Wait for the agent and clear its terminal input first.',
      );
      return;
    }
    final latest = c.agentSelection(id);
    if (latest.model != initial.model || latest.effort != initial.effort) {
      setState(
        () => error = 'The active settings changed. Reopen the chooser.',
      );
      return;
    }
    setState(() {
      busy = true;
      attempted = true;
      error = '';
    });
    try {
      final before = activeTerminalText(terminal!);
      if (provider == 'codex' || model != initial.model) {
        await c.submit('/model', command: true, canContinue: () => current);
        await waitFor(() => menu != null);
        final live = menu!;
        await choose(
          live,
          optionIndex(live, model!, name: chosen?['name'] as String?),
        );
      }
      if (provider == 'codex' && efforts.isNotEmpty) {
        await waitFor(
          () =>
              menu != null &&
              RegExp(
                r'reasoning|effort',
                caseSensitive: false,
              ).hasMatch(menu!.title) &&
              !menu!.title.toLowerCase().contains('model and effort'),
        );
        final live = menu!;
        await choose(live, optionIndex(live, effort!));
      } else if (provider == 'claude' &&
          effort != null &&
          effort != initial.effort) {
        await waitFor(
          () => menu == null && hasEmptyAgentPrompt(terminal!, provider),
        );
        await c.submit(
          '/effort $effort',
          command: true,
          canContinue: () => current,
        );
      }
      await waitFor(() {
        final text = activeTerminalText(terminal!);
        if (text == before || menu != null) return false;
        final confirmation = selectionConfirmation(text),
            reported = AgentSelection.fromSession(session);
        final modelConfirmed =
            confirmation?.model?.toLowerCase() == model?.toLowerCase() ||
            (reported.at > initial.at && reported.model == model) ||
            (provider == 'claude' && model == initial.model);
        final effortConfirmed =
            effort == null ||
            confirmation?.effort == effort ||
            (reported.at > initial.at && reported.effort == effort) ||
            (provider == 'claude' &&
                RegExp(
                  '(?:effort|Effort)[^\\n]{0,30}\\b${RegExp.escape(effort!)}\\b',
                ).hasMatch(text));
        return modelConfirmed && effortConfirmed;
      });
      if (current) {
        c.rememberAgentSelection(
          id,
          AgentSelection(
            model: model,
            effort: effort,
            at: DateTime.now().millisecondsSinceEpoch,
          ),
        );
        if (mounted) Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Bad state: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                AgentMark(provider, size: 26),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Model & effort',
                    style: TextStyle(fontSize: 20, color: pink),
                  ),
                ),
                IconButton(
                  tooltip: 'Close chooser',
                  onPressed: busy ? null : () => Navigator.pop(context),
                  icon: Icon(Icons.close, color: blue),
                ),
              ],
            ),
            if (loading || busy) const LinearProgressIndicator(minHeight: 2),
            if (!loading && models.isNotEmpty) ...[
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: model,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Model',
                  hintText: 'Choose model',
                ),
                items: models
                    .map(
                      (x) => DropdownMenuItem(
                        value: x['id'] as String,
                        child: Text(
                          x['name'] as String? ?? x['id'] as String,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    )
                    .toList(),
                onChanged: busy || attempted || !current
                    ? null
                    : (value) => setState(() {
                        model = value;
                        if (!efforts.contains(effort)) {
                          effort = chosen?['defaultEffort'] as String?;
                        }
                      }),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                key: ValueKey('$model:$effort'),
                initialValue: effort,
                isExpanded: true,
                autofocus: widget.action == 'Effort',
                decoration: InputDecoration(
                  labelText: 'Effort',
                  hintText: model == null
                      ? 'Choose a model first'
                      : efforts.isEmpty
                      ? 'Not reported for this model'
                      : 'Choose effort',
                ),
                items: efforts
                    .map(
                      (x) => DropdownMenuItem(
                        value: x,
                        child: Text(effortLabel(x)),
                      ),
                    )
                    .toList(),
                onChanged: busy || attempted || !current || efforts.isEmpty
                    ? null
                    : (value) => setState(() => effort = value),
              ),
              if (provider == 'claude')
                const Padding(
                  padding: EdgeInsets.only(top: 12),
                  child: Text(
                    'Available effort levels depend on the model.',
                    style: TextStyle(color: muted),
                  ),
                ),
            ],
            if (error.isNotEmpty || !current)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text(
                  current
                      ? error
                      : 'Connection or chat changed. Reopen the chooser.',
                  style: TextStyle(color: pink),
                ),
              ),
            if (!loading && models.isEmpty)
              TextButton(
                onPressed: current ? load : null,
                child: const Text('Retry loading choices'),
              ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: busy ? null : () => Navigator.pop(context),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed:
                        !loading &&
                            !busy &&
                            !attempted &&
                            current &&
                            model != null &&
                            (efforts.isEmpty || effort != null)
                        ? apply
                        : null,
                    child: Text(
                      busy
                          ? 'Applying…'
                          : unchanged
                          ? 'Done'
                          : 'Apply',
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}
