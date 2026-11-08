// Typed phone slice items. Fields follow tests/fixtures/state/dto/phone-*.json.
// Unknown fields are ignored so a newer PC does not break an older phone.

String? _str(Object? v) => v is String ? v : null;
int? _int(Object? v) => v is num ? v.toInt() : null;
bool _bool(Object? v, [bool fallback = false]) => v is bool ? v : fallback;
Map<String, dynamic>? _map(Object? v) =>
    v is Map ? Map<String, dynamic>.from(v) : null;
List<Map<String, dynamic>> _maps(Object? v) => [
  if (v is List)
    for (final item in v)
      if (item is Map) Map<String, dynamic>.from(item),
];

class SwitchTarget {
  final String id, label;
  final bool ready;
  const SwitchTarget({required this.id, required this.label, required this.ready});
  factory SwitchTarget.fromJson(Map<String, dynamic> j) => SwitchTarget(
    id: _str(j['id']) ?? '',
    label: _str(j['label']) ?? '',
    ready: _bool(j['ready']),
  );
}

class Session {
  final String id, name, provider, state;
  final int? slot, cols, rows, updatedAt, settingsAt;
  final bool alive, switching, steeringSupported, draftSupported;
  final String? consoleKey,
      projectId,
      providerSessionId,
      model,
      modelName,
      effort,
      launchId,
      accountId,
      accountLabel,
      purpose,
      taskId,
      sliceId,
      steeringState;
  final Map<String, dynamic>? remote, consoleCapabilities, switchOffer;
  final String? worktreeBranch, worktreePath;
  final List<SwitchTarget> switchTargets;

  const Session({
    required this.id,
    required this.name,
    required this.provider,
    required this.state,
    this.slot,
    this.cols,
    this.rows,
    this.updatedAt,
    this.settingsAt,
    this.alive = false,
    this.switching = false,
    this.steeringSupported = false,
    this.draftSupported = false,
    this.consoleKey,
    this.projectId,
    this.providerSessionId,
    this.model,
    this.modelName,
    this.effort,
    this.launchId,
    this.accountId,
    this.accountLabel,
    this.purpose,
    this.taskId,
    this.sliceId,
    this.steeringState,
    this.remote,
    this.consoleCapabilities,
    this.switchOffer,
    this.worktreeBranch,
    this.worktreePath,
    this.switchTargets = const [],
  });

  factory Session.fromJson(Map<String, dynamic> j) {
    final worktree = _map(j['worktree']);
    return Session(
      id: _str(j['id']) ?? '',
      name: _str(j['name']) ?? '',
      provider: _str(j['provider']) ?? '',
      state: _str(j['state']) ?? '',
      slot: _int(j['slot']),
      cols: _int(j['cols']),
      rows: _int(j['rows']),
      updatedAt: _int(j['updatedAt']),
      settingsAt: _int(j['settingsAt']),
      alive: _bool(j['alive']),
      switching: _bool(j['switching']),
      steeringSupported: _bool(j['steeringSupported']),
      draftSupported: _bool(j['draftSupported']),
      consoleKey: _str(j['consoleKey']),
      projectId: _str(j['projectId']),
      providerSessionId: _str(j['providerSessionId']),
      model: _str(j['model']),
      modelName: _str(j['modelName']),
      effort: _str(j['effort']),
      launchId: _str(j['launchId']),
      accountId: _str(j['accountId']),
      accountLabel: _str(j['accountLabel']),
      purpose: _str(j['purpose']),
      taskId: _str(j['taskId']),
      sliceId: _str(j['sliceId']),
      steeringState: _str(j['steeringState']),
      remote: _map(j['remote']),
      consoleCapabilities: _map(j['consoleCapabilities']),
      switchOffer: _map(j['switchOffer']),
      worktreeBranch: _str(worktree?['branch']),
      worktreePath: _str(worktree?['path']),
      switchTargets: [for (final t in _maps(j['switchTargets'])) SwitchTarget.fromJson(t)],
    );
  }
}

class Project {
  final String id, name, status;
  final String? color;
  final int progressDone, progressTotal;
  final int? lastActiveAt;
  const Project({
    required this.id,
    required this.name,
    required this.status,
    this.color,
    this.progressDone = 0,
    this.progressTotal = 0,
    this.lastActiveAt,
  });
  factory Project.fromJson(Map<String, dynamic> j) {
    final progress = _map(j['progress']);
    return Project(
      id: _str(j['id']) ?? '',
      name: _str(j['name']) ?? '',
      status: _str(j['status']) ?? '',
      color: _str(j['color']),
      progressDone: _int(progress?['done']) ?? 0,
      progressTotal: _int(progress?['total']) ?? 0,
      lastActiveAt: _int(j['lastActiveAt']),
    );
  }
}

class TaskWorker {
  final String? accountId, provider, label, model;
  const TaskWorker({this.accountId, this.provider, this.label, this.model});
  static TaskWorker? fromJson(Object? v) {
    final j = _map(v);
    return j == null
        ? null
        : TaskWorker(
            accountId: _str(j['accountId']),
            provider: _str(j['provider']),
            label: _str(j['label']),
            model: _str(j['model']),
          );
  }
}

class Task {
  final String id, title, state;
  final String? parentId, projectId, workflow, resultId, supersededBy;
  final bool split;
  final int? startedAt, finishedAt, acknowledgedAt, dismissedAt;
  final int round, maxRounds, unresolved;
  final String error;
  final TaskWorker? implementer, reviewer;
  const Task({
    required this.id,
    required this.title,
    required this.state,
    this.parentId,
    this.projectId,
    this.workflow,
    this.resultId,
    this.supersededBy,
    this.acknowledgedAt,
    this.dismissedAt,
    this.split = false,
    this.startedAt,
    this.finishedAt,
    this.round = 0,
    this.maxRounds = 0,
    this.unresolved = 0,
    this.error = '',
    this.implementer,
    this.reviewer,
  });
  factory Task.fromJson(Map<String, dynamic> j) => Task(
    id: _str(j['id']) ?? '',
    title: _str(j['title']) ?? '',
    state: _str(j['state']) ?? '',
    parentId: _str(j['parentId']),
    projectId: _str(j['projectId']),
    workflow: _str(j['workflow']),
    resultId: _str(j['resultId']),
    supersededBy: _str(j['supersededBy']),
    acknowledgedAt: _int(j['acknowledgedAt']),
    dismissedAt: _int(j['dismissedAt']),
    split: _bool(j['split']),
    startedAt: _int(j['startedAt']),
    finishedAt: _int(j['finishedAt']),
    round: _int(j['round']) ?? 0,
    maxRounds: _int(j['maxRounds']) ?? 0,
    unresolved: _int(j['unresolved']) ?? 0,
    error: _str(j['error']) ?? '',
    implementer: TaskWorker.fromJson(j['implementer']),
    reviewer: TaskWorker.fromJson(j['reviewer']),
  );
}

class UsageCheck {
  final String? status, staleReason, message, failure;
  final bool stale;
  final int? observedAt, checkedAt;
  const UsageCheck({
    this.status,
    this.staleReason,
    this.message,
    this.failure,
    this.stale = false,
    this.observedAt,
    this.checkedAt,
  });
  factory UsageCheck.fromJson(Map<String, dynamic>? j) => UsageCheck(
    status: _str(j?['status']),
    staleReason: _str(j?['staleReason']),
    message: _str(j?['message']),
    failure: _str(j?['failure']),
    stale: _bool(j?['stale']),
    observedAt: _int(j?['observedAt']),
    checkedAt: _int(j?['checkedAt']),
  );
}

class UsageWindow {
  final String key, label;
  final String? scope, modelGroup, resetLabel;

  /// Null means the provider did not report a percentage. Never show it as 0.
  final num? usedPercent;
  final int? minutes, resetsAt, observedAt;
  final bool unlimited, notApplicable;
  const UsageWindow({
    required this.key,
    required this.label,
    this.scope,
    this.modelGroup,
    this.resetLabel,
    this.usedPercent,
    this.minutes,
    this.resetsAt,
    this.observedAt,
    this.unlimited = false,
    this.notApplicable = false,
  });
  factory UsageWindow.fromJson(Map<String, dynamic> j) => UsageWindow(
    key: _str(j['key']) ?? '',
    label: _str(j['label']) ?? '',
    scope: _str(j['scope']),
    modelGroup: _str(j['modelGroup']),
    resetLabel: _str(j['resetLabel']),
    usedPercent: j['usedPercent'] is num ? j['usedPercent'] as num : null,
    minutes: _int(j['minutes']),
    resetsAt: _int(j['resetsAt']),
    observedAt: _int(j['observedAt']),
    unlimited: _bool(j['unlimited']),
    notApplicable: _bool(j['notApplicable']),
  );
}

class UsageAccount {
  final String id, provider, label;
  final bool hasUsage, inUse;
  final UsageCheck check;
  final List<UsageWindow> windows;
  const UsageAccount({
    required this.id,
    required this.provider,
    required this.label,
    this.hasUsage = false,
    this.inUse = false,
    this.check = const UsageCheck(),
    this.windows = const [],
  });
  factory UsageAccount.fromJson(Map<String, dynamic> j) => UsageAccount(
    id: _str(j['id']) ?? '',
    provider: _str(j['provider']) ?? '',
    label: _str(j['label']) ?? '',
    hasUsage: _bool(j['hasUsage']),
    inUse: _bool(j['inUse']),
    check: UsageCheck.fromJson(_map(j['check'])),
    windows: [for (final w in _maps(j['windows'])) UsageWindow.fromJson(w)],
  );
}

/// Items of a `{byId, order}` collection in order. Malformed entries are skipped.
List<T> collectionItems<T>(Object? collection, T Function(Map<String, dynamic>) parse) {
  if (collection is! Map) return const [];
  final byId = collection['byId'], order = collection['order'];
  if (byId is! Map || order is! List) return const [];
  return [
    for (final id in order)
      if (byId[id] is Map) parse(Map<String, dynamic>.from(byId[id] as Map)),
  ];
}
