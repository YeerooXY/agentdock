// State sync protocol 2, phone side. Mirrors electron/state-protocol.cjs;
// tests replay tests/fixtures/state/*.json through it. See docs/state-protocol.md.
import 'dart:convert';

const stateProtocol = 2;
const _compression = ['gzip', 'none'];
const _changeKinds = ['patch', 'replace', 'reset'];
const _errorCodes = [
  'invalid',
  'epoch',
  'subscription',
  'duplicate',
  'gap',
  'unauthorized',
  'unsupported',
];

enum SliceKind { value, collection }

/// Slices one view may subscribe to, with their kinds.
class StateView {
  final String name;
  final Map<String, SliceKind> slices;
  const StateView(this.name, this.slices);
}

/// The phone allowlist (`PHONE_SLICES`).
const phoneView = StateView('phone', {
  'shell': SliceKind.value,
  'sessions': SliceKind.collection,
  'queues': SliceKind.value,
  'prompts': SliceKind.collection,
  'projects': SliceKind.collection,
  'tasks': SliceKind.collection,
  'usage': SliceKind.collection,
  'results': SliceKind.value,
});

class ProtocolError implements Exception {
  final String code, message;
  ProtocolError(this.code, this.message);
  @override
  String toString() => 'ProtocolError($code): $message';
}

Never _fail(String code, String message) => throw ProtocolError(code, message);

final _secretKey = RegExp(
  r'^(?:token|accesstoken|refreshtoken|idtoken|bearertoken|authtoken|devicetoken|pushtoken|secret|clientsecret|password|passphrase|apikey|api_key|privatekey|private_key|authorization|cookie|cookies|env|environment|credential|credentials|pairingcode|pairingsecret|usercode|requestkey|vaultkey)$',
  caseSensitive: false,
);
final _envKey = RegExp(r'^(?:env|environment)$', caseSensitive: false);

bool _isRev(Object? v) => v is int && v >= 0 && v <= 9007199254740991;
bool _isId(Object? v) => v is String && v.isNotEmpty && v.length <= 256;
bool _isText(Object? v, [int max = 256]) =>
    v is String && v.isNotEmpty && v.length <= max;

void _onlyKeys(Map value, List<String> allowed, String label) {
  for (final key in value.keys) {
    if (!allowed.contains(key)) _fail('invalid', '$label has an unknown field: $key.');
  }
}

void _sliceList(Object? value, StateView view) {
  if (value is! List || value.isEmpty || value.length > view.slices.length) {
    _fail('invalid', 'slices must list known slices.');
  }
  for (final name in value) {
    if (name is! String || !view.slices.containsKey(name)) {
      _fail('invalid', 'Unknown slice.');
    }
  }
  if (value.toSet().length != value.length) _fail('invalid', 'slices repeats a slice.');
}

void _assertNoSecrets(Object? value, String path) {
  if (value is Map) {
    value.forEach((key, item) {
      final isSecret = _secretKey.hasMatch('$key') &&
          (!_envKey.hasMatch('$key') || item is Map || item is List);
      if (isSecret) _fail('invalid', '$path contains private fields: $key.');
      _assertNoSecrets(item, '$path.$key');
    });
  } else if (value is List) {
    for (final item in value) {
      _assertNoSecrets(item, path);
    }
  }
}

void _assertJson(Object? value, String path) {
  if (value == null || value is String || value is bool) return;
  if (value is num) {
    if (!value.isFinite) _fail('invalid', '$path is not a finite number.');
    return;
  }
  if (value is List) {
    for (final item in value) {
      _assertJson(item, path);
    }
    return;
  }
  if (value is Map) {
    value.forEach((k, v) => _assertJson(v, '$path.$k'));
    return;
  }
  _fail('invalid', '$path is not JSON data.');
}

/// Throws [ProtocolError] unless [value] is `{byId, order, meta?}` with
/// `order` listing every key of `byId` once.
Map<String, dynamic> validateCollection(Object? value, [String label = 'collection']) {
  if (value is! Map) _fail('invalid', '$label must be {byId, order}.');
  _onlyKeys(value, ['byId', 'order', 'meta'], label);
  final byId = value['byId'], order = value['order'];
  if (byId is! Map || order is! List) _fail('invalid', '$label must be {byId, order}.');
  if (value['meta'] != null && value['meta'] is! Map) {
    _fail('invalid', '$label.meta must be an object.');
  }
  if (byId.length != order.length || order.toSet().length != order.length) {
    _fail('invalid', '$label.order must list each id once.');
  }
  for (final id in order) {
    if (!_isId(id) || !byId.containsKey(id)) {
      _fail('invalid', '$label.order lists a missing id.');
    }
    final item = byId[id];
    if (item is! Map) _fail('invalid', '$label item $id must be an object.');
    if (item['id'] != null && '${item['id']}' != id) {
      _fail('invalid', '$label item $id has a different id.');
    }
  }
  return Map<String, dynamic>.from(value);
}

Map<String, dynamic> emptyCollection() =>
    {'byId': <String, dynamic>{}, 'order': <dynamic>[], 'meta': <String, dynamic>{}};

void _validateCursor(Object? value, String label, StateView view) {
  if (value is! Map) _fail('invalid', '$label must be {epoch, revs}.');
  _onlyKeys(value, ['epoch', 'revs'], label);
  if (!_isText(value['epoch'], 64)) _fail('invalid', '$label.epoch must be text.');
  final revs = value['revs'];
  if (revs is! Map) _fail('invalid', '$label.revs must be an object.');
  revs.forEach((slice, rev) {
    if (!view.slices.containsKey(slice)) _fail('invalid', 'Unknown slice.');
    if (!_isRev(rev)) _fail('invalid', '$label.revs.$slice must be a revision.');
  });
}

void validateChange(Object? change, StateView view) {
  if (change is! Map || !_changeKinds.contains(change['kind'])) {
    _fail('invalid', 'Unknown change kind.');
  }
  final slice = change['slice'];
  if (slice is! String || !view.slices.containsKey(slice)) {
    _fail('invalid', 'Unknown slice.');
  }
  final kind = view.slices[slice]!;
  if (!_isRev(change['rev'])) _fail('invalid', 'Change rev must be a revision.');
  if (change['kind'] == 'reset') {
    _onlyKeys(change, ['kind', 'slice', 'rev', 'value'], 'reset');
    if (!change.containsKey('value')) _fail('invalid', 'reset needs a value.');
    if (kind == SliceKind.collection) validateCollection(change['value'], '$slice reset');
    _assertJson(change['value'], '$slice.value');
    return;
  }
  if (!_isRev(change['baseRev']) || (change['rev'] as int) <= (change['baseRev'] as int)) {
    _fail('invalid', 'Change rev must follow baseRev.');
  }
  if (change['kind'] == 'replace') {
    _onlyKeys(change, ['kind', 'slice', 'baseRev', 'rev', 'value'], 'replace');
    if (kind != SliceKind.value) _fail('invalid', '$slice is a collection; use patch.');
    if (!change.containsKey('value')) _fail('invalid', 'replace needs a value.');
    _assertJson(change['value'], '$slice.value');
    return;
  }
  _onlyKeys(change, ['kind', 'slice', 'baseRev', 'rev', 'upsert', 'remove', 'order', 'meta'], 'patch');
  if (kind != SliceKind.collection) _fail('invalid', '$slice is a value; use replace.');
  final upsert = change['upsert'], remove = change['remove'], order = change['order'];
  if (upsert is! Map || remove is! List) _fail('invalid', 'patch needs upsert and remove.');
  upsert.forEach((id, item) {
    if (!_isId(id) || item is! Map) _fail('invalid', 'patch upsert items must be objects.');
    if (item['id'] != null && '${item['id']}' != id) {
      _fail('invalid', 'patch item $id has a different id.');
    }
  });
  if (remove.any((id) => !_isId(id)) || remove.toSet().length != remove.length) {
    _fail('invalid', 'patch remove must list ids once.');
  }
  if (remove.any(upsert.containsKey)) {
    _fail('invalid', 'patch cannot upsert and remove the same id.');
  }
  if (order != null &&
      (order is! List || order.any((id) => !_isId(id)) || order.toSet().length != order.length)) {
    _fail('invalid', 'patch order must list ids once.');
  }
  if (change['meta'] != null && change['meta'] is! Map) {
    _fail('invalid', 'patch meta must be an object.');
  }
  _assertJson(upsert, '$slice.upsert');
}

/// Validates a message the phone would send. Used by tests and before sending.
void validateClientMessage(Object? message, StateView view) {
  if (message is! Map) _fail('invalid', 'A message must be an object.');
  switch (message['type']) {
    case 'hello':
      _onlyKeys(message, ['type', 'protocol', 'lastRev', 'slices', 'compression'], 'hello');
      if (message['protocol'] != stateProtocol) _fail('unsupported', 'Unsupported protocol.');
      if (message['lastRev'] != null) _validateCursor(message['lastRev'], 'hello.lastRev', view);
      _sliceList(message['slices'], view);
      final c = message['compression'];
      if (c is! List || c.isEmpty || c.any((x) => !_compression.contains(x)) || c.toSet().length != c.length) {
        _fail('invalid', 'hello.compression must list gzip or none.');
      }
    case 'subscribe':
      _onlyKeys(message, ['type', 'slices'], 'subscribe');
      _sliceList(message['slices'], view);
    case 'ack':
      _onlyKeys(message, ['type', 'subscription', 'batch'], 'ack');
      if (!_isText(message['subscription'], 64) || message['batch'] is! int || (message['batch'] as int) < 1) {
        _fail('invalid', 'ack needs a subscription and batch.');
      }
    case 'resync':
      _onlyKeys(message, ['type', 'subscription', 'slices'], 'resync');
      if (!_isText(message['subscription'], 64)) _fail('invalid', 'resync needs a subscription.');
      _sliceList(message['slices'], view);
    case 'pong':
      _onlyKeys(message, ['type', 'nonce'], 'pong');
      if (!_isText(message['nonce'], 64)) _fail('invalid', 'pong needs a nonce.');
    default:
      _fail('invalid', 'Unknown client message type.');
  }
}

void validateServerMessage(Object? message, StateView view) {
  if (message is! Map) _fail('invalid', 'A message must be an object.');
  switch (message['type']) {
    case 'welcome':
      _onlyKeys(message, ['type', 'protocol', 'epoch', 'subscription', 'slices', 'compression'], 'welcome');
      if (message['protocol'] != stateProtocol) _fail('unsupported', 'Unsupported protocol.');
      if (!_isText(message['epoch'], 64) || !_isText(message['subscription'], 64)) {
        _fail('invalid', 'welcome needs an epoch and subscription.');
      }
      _sliceList(message['slices'], view);
      if (!_compression.contains(message['compression'])) {
        _fail('invalid', 'welcome.compression must be gzip or none.');
      }
    case 'changes':
      _onlyKeys(message, ['type', 'epoch', 'subscription', 'batch', 'changes'], 'changes');
      if (!_isText(message['epoch'], 64) || !_isText(message['subscription'], 64)) {
        _fail('invalid', 'changes needs an epoch and subscription.');
      }
      if (message['batch'] is! int || (message['batch'] as int) < 1) {
        _fail('invalid', 'changes needs a batch number.');
      }
      final changes = message['changes'];
      if (changes is! List || changes.isEmpty) _fail('invalid', 'changes needs at least one change.');
      final slices = <String>[];
      for (final change in changes) {
        validateChange(change, view);
        slices.add((change as Map)['slice'] as String);
      }
      if (slices.toSet().length != slices.length) _fail('invalid', 'A batch changes each slice once.');
      _assertNoSecrets(changes, 'changes');
    case 'ping':
      _onlyKeys(message, ['type', 'nonce'], 'ping');
      if (!_isText(message['nonce'], 64)) _fail('invalid', 'ping needs a nonce.');
    case 'error':
      _onlyKeys(message, ['type', 'code', 'message'], 'error');
      if (!_errorCodes.contains(message['code']) ||
          message['message'] is! String ||
          (message['message'] as String).length > 500) {
        _fail('invalid', 'error needs a known code and a message.');
      }
    default:
      _fail('invalid', 'Unknown server message type.');
  }
}

List<String> _implicitOrder(Map<String, dynamic> previous, Map upsert, List remove) {
  final removed = remove.toSet();
  final order = [
    for (final id in previous['order'] as List)
      if (!removed.contains(id)) id as String,
  ];
  final present = order.toSet();
  for (final id in upsert.keys) {
    if (present.add(id as String)) order.add(id);
  }
  return order;
}

Map<String, dynamic> applyPatch(Map<String, dynamic> previous, Map change) {
  final byId = Map<String, dynamic>.from(previous['byId'] as Map);
  final upsert = (change['upsert'] as Map?) ?? const {};
  final remove = (change['remove'] as List?) ?? const [];
  for (final id in remove) {
    byId.remove(id);
  }
  upsert.forEach((id, item) => byId[id as String] = item);
  return validateCollection({
    'byId': byId,
    'order': change['order'] != null
        ? List<dynamic>.from(change['order'] as List)
        : _implicitOrder(previous, upsert, remove),
    'meta': change['meta'] ?? previous['meta'] ?? <String, dynamic>{},
  }, 'patched collection');
}

/// Client cache for one subscription. Treated as immutable: [applyServerMessage]
/// returns a new instance.
class ClientState {
  final StateView view;
  final String? epoch, subscription;
  final List<String> slices;
  final Map<String, int> revs;
  final Map<String, dynamic> values;
  final int lastBatch;
  const ClientState({
    required this.view,
    this.epoch,
    this.subscription,
    this.slices = const [],
    this.revs = const {},
    this.values = const {},
    this.lastBatch = 0,
  });

  ClientState copyWith({
    String? epoch,
    String? subscription,
    List<String>? slices,
    Map<String, int>? revs,
    Map<String, dynamic>? values,
    int? lastBatch,
  }) => ClientState(
    view: view,
    epoch: epoch ?? this.epoch,
    subscription: subscription ?? this.subscription,
    slices: slices ?? this.slices,
    revs: revs ?? this.revs,
    values: values ?? this.values,
    lastBatch: lastBatch ?? this.lastBatch,
  );

  /// JSON shape used by tests/fixtures/state/sequences.json.
  Map<String, dynamic> toJson() => {
    'view': view.name,
    'epoch': epoch,
    'subscription': subscription,
    'slices': slices,
    'revs': revs,
    'values': values,
    'lastBatch': lastBatch,
  };

  factory ClientState.fromJson(Map<String, dynamic> json, StateView view) => ClientState(
    view: view,
    epoch: json['epoch'] as String?,
    subscription: json['subscription'] as String?,
    slices: [for (final s in json['slices'] as List) s as String],
    revs: {for (final e in (json['revs'] as Map).entries) e.key as String: e.value as int},
    values: Map<String, dynamic>.from(json['values'] as Map),
    lastBatch: json['lastBatch'] as int,
  );
}

enum Outcome { welcome, applied, duplicate, ignored, resync, reconnect, pong, error }

class ApplyResult {
  final ClientState state;
  final Outcome outcome;
  final String? error, nonce;
  final int? batch;
  final List<String> slices;
  const ApplyResult(this.state, this.outcome, {this.error, this.nonce, this.batch, this.slices = const []});
}

/// Reference behaviour from `applyServerMessage` in state-protocol.cjs.
ApplyResult applyServerMessage(ClientState state, Object? message) {
  try {
    validateServerMessage(message, state.view);
  } on ProtocolError catch (e) {
    return ApplyResult(state, Outcome.reconnect, error: e.code);
  }
  final m = message as Map;
  switch (m['type']) {
    case 'ping':
      return ApplyResult(state, Outcome.pong, nonce: m['nonce'] as String);
    case 'error':
      return ApplyResult(state, Outcome.error, error: m['code'] as String);
    case 'welcome':
      final slices = [for (final s in m['slices'] as List) s as String];
      final same = state.epoch == m['epoch'];
      final revs = <String, int>{}, values = <String, dynamic>{};
      if (same) {
        for (final s in slices) {
          if (state.revs.containsKey(s)) {
            revs[s] = state.revs[s]!;
            values[s] = state.values[s];
          }
        }
      }
      return ApplyResult(
        ClientState(
          view: state.view,
          epoch: m['epoch'] as String,
          subscription: m['subscription'] as String,
          slices: slices,
          revs: revs,
          values: values,
        ),
        Outcome.welcome,
      );
  }
  if (m['epoch'] != state.epoch) return ApplyResult(state, Outcome.reconnect, error: 'epoch');
  if (m['subscription'] != state.subscription) {
    return ApplyResult(state, Outcome.ignored, error: 'subscription');
  }
  final batch = m['batch'] as int;
  if (batch <= state.lastBatch) return ApplyResult(state, Outcome.duplicate, batch: batch);
  final revs = Map<String, int>.from(state.revs);
  final values = Map<String, dynamic>.from(state.values);
  final gaps = <String>[];
  for (final raw in m['changes'] as List) {
    final change = raw as Map;
    final slice = change['slice'] as String;
    if (!state.slices.contains(slice)) {
      return ApplyResult(state, Outcome.reconnect, error: 'subscription');
    }
    if (change['kind'] == 'reset') {
      revs[slice] = change['rev'] as int;
      values[slice] = change['value'];
      continue;
    }
    if (revs[slice] != change['baseRev']) {
      gaps.add(slice);
      continue;
    }
    if (change['kind'] == 'replace') {
      values[slice] = change['value'];
    } else {
      try {
        final previous = values[slice] as Map<String, dynamic>? ?? emptyCollection();
        values[slice] = applyPatch(previous, change);
      } on ProtocolError {
        gaps.add(slice);
        continue;
      }
    }
    revs[slice] = change['rev'] as int;
  }
  if (gaps.isNotEmpty) return ApplyResult(state, Outcome.resync, slices: gaps);
  return ApplyResult(
    state.copyWith(revs: revs, values: values, lastBatch: batch),
    Outcome.applied,
    batch: batch,
  );
}

String encodeMessage(Map<String, dynamic> message) => jsonEncode(message);
