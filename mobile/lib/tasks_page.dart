import 'package:flutter/material.dart';

import 'dock_client.dart';
import 'state_models.dart';

// Same rule as the desktop (src/project-activity.js): a task needs the owner
// while it is waiting on them, has not been seen, closed or replaced, and did
// not merely stop because Paddock closed.
const _attentionStates = {'needs-you', 'plan-ready', 'interrupted', 'failed'};
const _runningStates = {'planning', 'reviewing-plan', 'building', 'implementing', 'checking', 'reviewing', 'queued'};

bool taskRunning(Task task) => _runningStates.contains(task.state);

bool taskNeedsAttention(Task task) =>
    _attentionStates.contains(task.state) &&
    !(task.state == 'interrupted' && task.error.startsWith('Paddock closed before this task finished')) &&
    task.acknowledgedAt == null &&
    task.dismissedAt == null &&
    task.supersededBy == null;

String taskStateLabel(String state) => switch (state) {
  'needs-you' => 'Needs you',
  'plan-ready' => 'Waiting for approval',
  'passed' || 'accepted' => 'Passed',
  'failed' => 'Failed',
  'interrupted' => 'Interrupted',
  'stopped' || 'cancelled' => 'Stopped',
  _ when _runningStates.contains(state) => 'Running',
  _ => state.isEmpty ? 'Unknown' : state,
};

// "1h 5m", "12m" or "less than a minute", no leading zeros or zero units.
String taskElapsed(Task task, DateTime now) {
  final start = task.startedAt;
  if (start == null) return '';
  final end = task.finishedAt ?? now.millisecondsSinceEpoch;
  final minutes = ((end - start) / 60000).floor();
  if (minutes < 1) return 'less than a minute';
  final h = minutes ~/ 60, m = minutes % 60;
  return h == 0 ? '${m}m' : (m == 0 ? '${h}h' : '${h}h ${m}m');
}

/// Tasks shown on the phone: not closed, newest first.
List<Task> visibleTasks(Object? raw) {
  final list = (raw is List ? raw : const [])
      .whereType<Map>()
      .map((item) => Task.fromJson(Map<String, dynamic>.from(item)))
      .where((task) => task.dismissedAt == null && task.parentId == null)
      .toList();
  list.sort((a, b) => (b.startedAt ?? 0).compareTo(a.startedAt ?? 0));
  return list;
}

int tasksNeedingAttention(Object? raw) => visibleTasks(raw).where(taskNeedsAttention).length;

class TasksPage extends StatefulWidget {
  final DockClient client;
  const TasksPage({super.key, required this.client});

  @override
  State<TasksPage> createState() => _TasksPageState();
}

class _TasksPageState extends State<TasksPage> {
  String error = '';
  final busy = <String>{};

  Future<void> run(String id, String method, [Map<String, dynamic> extra = const {}]) async {
    setState(() { busy.add(id); error = ''; });
    try {
      await widget.client.request(method, {'id': id, ...extra});
    } catch (e) {
      if (mounted) setState(() => error = e.toString().replaceFirst('Bad state: ', ''));
    } finally {
      if (mounted) setState(() => busy.remove(id));
    }
  }

  Future<void> close(Task task) async {
    final reason = await showDialog<String>(context: context, builder: (_) => _CloseTaskDialog(title: task.title));
    if (reason != null && reason.isNotEmpty && mounted) await run(task.id, 'tasks.close', {'reason': reason});
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Tasks')),
    body: ListenableBuilder(listenable: widget.client, builder: (context, _) {
      final tasks = visibleTasks(widget.client.state['tasks']);
      final actions = (widget.client.state['capabilities'] as List? ?? const []).contains('tasks.actions');
      final now = DateTime.now();
      final theme = Theme.of(context);
      return ListView(padding: const EdgeInsets.all(16), children: [
        if (error.isNotEmpty) Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text(error, style: TextStyle(color: theme.colorScheme.error)),
        ),
        if (tasks.isEmpty) const Text('No delegated tasks.'),
        for (final task in tasks) Card(child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: Text(task.title.isEmpty ? 'Untitled task' : task.title, style: theme.textTheme.titleMedium)),
              const SizedBox(width: 8),
              Chip(
                label: Text(taskStateLabel(task.state)),
                visualDensity: VisualDensity.compact,
                backgroundColor: taskNeedsAttention(task) ? theme.colorScheme.errorContainer : null,
              ),
            ]),
            if (task.implementer?.label != null) Text('Worker: ${task.implementer!.label}'),
            if (task.reviewer?.label != null) Text('Reviewer: ${task.reviewer!.label}'),
            if (taskElapsed(task, now).isNotEmpty) Text('${taskRunning(task) ? 'Running for' : 'Took'} ${taskElapsed(task, now)}'),
            if (task.error.isNotEmpty) Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(task.error, maxLines: 3, overflow: TextOverflow.ellipsis),
            ),
            if (task.plan case final plan? when plan.items.isNotEmpty) _PlanItems(plan: plan, open: task.state == 'plan-ready'),
            if (actions && !taskRunning(task)) Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
              if (task.state == 'plan-ready' && task.plan != null) FilledButton(
                key: ValueKey('approve-${task.id}'),
                onPressed: busy.contains(task.id) || !widget.client.connected ? null : () => run(task.id, 'tasks.approve'),
                child: Text('Approve and start', semanticsLabel: 'Approve and start ${task.title}'),
              ),
              if (taskNeedsAttention(task)) TextButton(
                onPressed: busy.contains(task.id) || !widget.client.connected ? null : () => run(task.id, 'tasks.seen'),
                child: Text('Mark as seen', semanticsLabel: 'Mark ${task.title} as seen'),
              ),
              TextButton(
                onPressed: busy.contains(task.id) || !widget.client.connected ? null : () => close(task),
                child: Text('Close', semanticsLabel: 'Close ${task.title}'),
              ),
            ]),
          ]),
        )),
      ]);
    }),
  );
}

/// A plan's items, readable before approval: each shows its kind, size and
/// worker, and expands to the acceptance criteria or a question's answer.
class _PlanItems extends StatelessWidget {
  final TaskPlan plan;
  final bool open;
  const _PlanItems({required this.plan, required this.open});

  String _worker(TaskWorker? worker) => [
    if (worker?.label != null) worker!.label!,
    if (worker?.model != null) worker!.model!,
  ].join(', ');

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final work = plan.items.where((item) => item.kind != 'question').length;
    return Theme(
      data: theme.copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        key: PageStorageKey('plan-${plan.items.first.id}'),
        initiallyExpanded: open,
        tilePadding: EdgeInsets.zero,
        childrenPadding: EdgeInsets.zero,
        title: Text(work == 1 ? 'Plan: 1 task' : 'Plan: $work tasks'),
        children: [
          for (final (index, item) in plan.items.indexed) ExpansionTile(
            tilePadding: const EdgeInsets.only(left: 4),
            childrenPadding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
            expandedCrossAxisAlignment: CrossAxisAlignment.start,
            leading: CircleAvatar(radius: 14, child: Text('${index + 1}', style: const TextStyle(fontSize: 12))),
            title: Text(item.title.isEmpty ? item.id : item.title),
            subtitle: Text([
              item.kind == 'question' ? 'Question' : item.kind[0].toUpperCase() + item.kind.substring(1),
              if (item.size != null) item.size!,
              if (_worker(item.worker).isNotEmpty) _worker(item.worker),
            ].join(', '), style: muted),
            children: [
              Text(item.kind == 'question' && item.answer.isNotEmpty ? item.answer : item.criteria),
              if (item.reviewer?.label != null) Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('Reviewed by ${_worker(item.reviewer)}', style: muted),
              ),
            ],
          ),
          if (plan.contracts.isNotEmpty) Padding(
            padding: const EdgeInsets.only(top: 4, bottom: 8),
            child: Text(plan.contracts, style: muted, maxLines: 6, overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    );
  }
}

/// Asks for the reason before a task is closed. It owns its text controller,
/// so the controller lives until the dialog has finished closing.
class _CloseTaskDialog extends StatefulWidget {
  final String title;
  const _CloseTaskDialog({required this.title});

  @override
  State<_CloseTaskDialog> createState() => _CloseTaskDialogState();
}

class _CloseTaskDialogState extends State<_CloseTaskDialog> {
  final reason = TextEditingController();

  @override
  void dispose() {
    reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Close task?'),
    scrollable: true,
    content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(widget.title, maxLines: 2, overflow: TextOverflow.ellipsis),
      const SizedBox(height: 12),
      TextField(
        controller: reason,
        autofocus: true,
        maxLength: 300,
        onChanged: (_) => setState(() {}),
        decoration: const InputDecoration(labelText: 'Reason', hintText: 'For example: replaced by a newer task'),
      ),
      const Text('The task leaves this list. Its report stays in Results.'),
    ]),
    actions: [
      TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
      FilledButton(
        onPressed: reason.text.trim().isEmpty ? null : () => Navigator.pop(context, reason.text.trim()),
        child: const Text('Close task'),
      ),
    ],
  );
}
