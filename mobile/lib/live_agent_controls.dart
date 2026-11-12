import 'package:flutter/material.dart';

import 'agent_identity.dart';
import 'agent_selection.dart';
import 'dock_client.dart';
import 'dock_style.dart';

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
  late final dynamic chat, launch, account, consoleKey;
  late final AgentSelection initial;
  final modelFocus = FocusNode(), effortFocus = FocusNode();
  List<Map<String, dynamic>> models = [];
  String? model, effort;
  String error = '';
  bool loading = true, busy = false, supported = false;
  Map get session => c.sessions.where((s) => s['id'] == id).firstOrNull ?? {};
  String get provider => (session['provider'] ?? '').toString().toLowerCase();
  bool get sameChat =>
      mounted &&
      c.connected &&
      c.foreground &&
      c.activePC == pc &&
      c.selected == id &&
      c.generation == generation &&
      provider == initialProvider &&
      session['providerSessionId'] == chat &&
      session['accountId'] == account &&
      session['consoleKey'] == consoleKey;
  bool get current => sameChat && session['launchId'] == launch;
  bool get idle =>
      ['open', 'ready', 'idle'].contains(session['state']) &&
      session['switching'] != true &&
      session['taskId'] == null &&
      session['remote'] == null;
  Map<String, dynamic>? get chosen =>
      models.where((x) => x['id'] == model).firstOrNull;
  List<String> get efforts =>
      (chosen?['efforts'] as List? ?? []).whereType<String>().toList();
  bool get unchanged =>
      (model == initial.model || chosen?['resolvedModel'] == initial.model) &&
      effort == initial.effort;
  Map<String, dynamic> get identity => {
    'id': id,
    'launchId': launch,
    'accountId': account,
    'consoleKey': consoleKey,
  };

  @override
  void initState() {
    super.initState();
    initialProvider = provider;
    chat = session['providerSessionId'];
    launch = session['launchId'];
    account = session['accountId'];
    consoleKey = session['consoleKey'];
    initial = c.agentSelection(id);
    model = initial.model;
    effort = initial.effort;
    c.addListener(changed);
    load();
  }

  void changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    c.removeListener(changed);
    modelFocus.dispose();
    effortFocus.dispose();
    super.dispose();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = '';
    });
    try {
      final result = await c.request('console.models', {
        'provider': provider,
        ...identity,
      });
      if (!current) return;
      supported = result is Map && result['settingsSupported'] == true;
      final values = (result is Map ? result['models'] as List? : null) ?? [];
      models = values
          .whereType<Map>()
          .map((x) => Map<String, dynamic>.from(x))
          .toList();
      if (models.isEmpty) {
        throw StateError(
          'Model choices are unavailable. Retry loading choices.',
        );
      }
      if (chosen == null) {
        final matching = models
            .where((x) => x['resolvedModel'] == model)
            .firstOrNull;
        model = matching?['id'] as String?;
      }
      if (effort != null && !efforts.contains(effort)) effort = null;
      if (!supported) {
        error = 'Update Paddock on your PC to apply model settings.';
      }
    } catch (e) {
      if (mounted) error = e.toString().replaceFirst('Bad state: ', '');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> apply() async {
    if (!current || busy || loading || !supported) return;
    if (unchanged) {
      Navigator.pop(context);
      return;
    }
    if (!idle) {
      setState(
        () => error = 'Wait until this chat is idle before applying settings.',
      );
      return;
    }
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final result = await c.request('console.settings', {
        ...identity,
        'model': model,
        'effort': effort,
        'confirmConversationReload': true,
      });
      if (!sameChat) return;
      if (result is! Map ||
          result['launchId'] == null ||
          result['requestedSettings'] is! Map) {
        throw StateError(
          'The PC did not confirm the resumed chat. Check the console before trying again.',
        );
      }
      if (mounted) Navigator.pop(context);
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
                focusNode: modelFocus,
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
                onChanged: busy || !current
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
                initialValue: effort ?? '',
                focusNode: effortFocus,
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
                items: [
                  const DropdownMenuItem(
                    value: '',
                    child: Text('Agent default'),
                  ),
                  ...efforts.map(
                    (x) =>
                        DropdownMenuItem(value: x, child: Text(effortLabel(x))),
                  ),
                ],
                onChanged: busy || !current || efforts.isEmpty
                    ? null
                    : (value) =>
                          setState(() => effort = value == '' ? null : value),
              ),
              const Padding(
                padding: EdgeInsets.only(top: 12),
                child: Text(
                  'Applying settings resumes this chat and reloads its saved conversation. The next message may process earlier messages again and use extra tokens.',
                  style: TextStyle(color: muted),
                ),
              ),
              if (!idle && !busy)
                const Padding(
                  padding: EdgeInsets.only(top: 12),
                  child: Text(
                    'Wait until this chat is idle before applying settings.',
                    style: TextStyle(color: muted),
                  ),
                ),
            ],
            if (error.isNotEmpty || !current && !busy)
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
                            supported &&
                            idle &&
                            current &&
                            model != null &&
                            chosen != null
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
