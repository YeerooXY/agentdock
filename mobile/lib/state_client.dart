// v2 state client. dock_client.dart opens /v2/events when the PC offers it and
// falls back to /v1/events for older PCs. Transport-free: feed it decoded
// server messages, send what it returns. See docs/state-protocol.md.
import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'state_models.dart';
import 'state_protocol.dart';

/// Chunk limits from electron/state-sync.cjs (tests/fixtures/state/transport.json).
const maxChunkParts = 512, maxChunkTotal = 32 * 1024 * 1024;

class StateClient extends ChangeNotifier {
  ClientState _state = const ClientState(view: phoneView);
  final List<String> subscribed;
  final Map<String, DockSliceSignal> _signals = {};
  _ChunkBuffer? _chunks;
  bool _disposed = false;

  StateClient({
    this.subscribed = const [
      'shell',
      'sessions',
      'queues',
      'prompts',
      'projects',
      'tasks',
      'usage',
      'results',
    ],
  });

  ClientState get state => _state;

  /// True once every subscribed slice has a value.
  bool get ready => subscribed.every(_state.revs.containsKey);

  /// Per-slice notifier so a page rebuilds only for its own slice.
  Listenable slice(String name) =>
      _signals.putIfAbsent(name, DockSliceSignal.new);

  /// Message to send after the socket opens. [resume] keeps the cache when the
  /// server epoch matches; a reconnect after `reconnect` uses a fresh hello.
  Map<String, dynamic> hello({bool resume = true}) => {
    'type': 'hello',
    'protocol': stateProtocol,
    'lastRev': resume && _state.epoch != null
        ? {'epoch': _state.epoch, 'revs': _state.revs}
        : null,
    'slices': subscribed,
    'compression': ['gzip', 'none'],
  };

  /// Drops the cache, for example when the phone switches to another PC.
  void clear() {
    _state = const ClientState(view: phoneView);
    _chunks = null;
  }

  List<Session> get sessions =>
      collectionItems(_state.values['sessions'], Session.fromJson);
  List<Task> get tasks =>
      collectionItems(_state.values['tasks'], Task.fromJson);
  List<Project> get projects =>
      collectionItems(_state.values['projects'], Project.fromJson);
  List<UsageAccount> get usage =>
      collectionItems(_state.values['usage'], UsageAccount.fromJson);
  Map<String, dynamic>? value(String slice) {
    final v = _state.values[slice];
    return v is Map ? Map<String, dynamic>.from(v) : null;
  }

  /// The v1 `state` map rebuilt from the slices and the latest `extras`
  /// frame, so pages read one map on both paths. Mirrors phoneLegacyState in
  /// electron/projections.cjs. Adds the v2-only `tasks` and `usage` lists.
  Map<String, dynamic> legacyState(Map<String, dynamic> extras) {
    List<Map<String, dynamic>> items(String slice) =>
        collectionItems(_state.values[slice], (item) => item);
    final queues = _state.values['queues'];
    return {
      ...extras,
      'capacity': value('shell')?['capacity'] ?? 9,
      'agentProfiles': value('shell')?['agentProfiles'],
      'sessions': items('sessions'),
      'queues': queues is Map
          ? Map<String, dynamic>.from(queues)
          : <String, dynamic>{},
      'prompts': items('prompts'),
      'tasks': items('tasks'),
      'usage': items('usage'),
    };
  }

  /// Adds one `chunk` frame. Returns the complete `changes` message when the
  /// last part arrives and null while parts are missing. Throws
  /// [ProtocolError] for a missing or invalid part; the caller reconnects.
  Map<String, dynamic>? addChunk(Object? frame) {
    final chunk = _validChunk(frame);
    if (chunk == null) {
      _chunks = null;
      throw ProtocolError('invalid', 'Invalid chunk.');
    }
    final subscription = chunk['subscription'] as String;
    final batch = chunk['batch'] as int,
        part = chunk['part'] as int,
        parts = chunk['parts'] as int;
    final current = _chunks;
    final same =
        current != null &&
        current.subscription == subscription &&
        current.batch == batch &&
        current.parts == parts;
    // A new batch may replace an abandoned one only from its first part.
    final buffer = part == 1
        ? _ChunkBuffer(subscription, batch, parts)
        : same
        ? current
        : null;
    if (buffer == null || buffer.data.length != part - 1) {
      _chunks = null;
      throw ProtocolError('gap', 'A chunk part is missing.');
    }
    final data = chunk['data'] as String;
    buffer.data.add(data);
    buffer.size += data.length;
    if (buffer.size > maxChunkTotal) {
      _chunks = null;
      throw ProtocolError('invalid', 'The batch is too large.');
    }
    if (buffer.data.length < parts) {
      _chunks = buffer;
      return null;
    }
    _chunks = null;
    Object? message;
    try {
      message = jsonDecode(buffer.data.join());
    } on FormatException {
      message = null;
    }
    if (message is! Map<String, dynamic> ||
        message['type'] != 'changes' ||
        message['subscription'] != subscription ||
        message['batch'] != batch) {
      throw ProtocolError('invalid', 'The batch does not match its chunks.');
    }
    return message;
  }

  static Map? _validChunk(Object? frame) {
    if (frame is! Map || frame['type'] != 'chunk') return null;
    const allowed = {'type', 'subscription', 'batch', 'part', 'parts', 'data'};
    if (frame.keys.any((key) => !allowed.contains(key))) return null;
    final subscription = frame['subscription'], batch = frame['batch'];
    final part = frame['part'], parts = frame['parts'], data = frame['data'];
    if (subscription is! String ||
        subscription.isEmpty ||
        subscription.length > 64) {
      return null;
    }
    if (batch is! int || batch < 1) return null;
    if (parts is! int || parts < 2 || parts > maxChunkParts) return null;
    if (part is! int || part < 1 || part > parts) return null;
    if (data is! String || data.isEmpty) return null;
    return frame;
  }

  /// Applies one server message and returns the messages to send back. A
  /// `reconnect` result is reported through [needsReconnect]; the caller sends
  /// `hello(resume: false)` (on the same socket or a fresh one).
  StateReply receive(Object? message) {
    final before = _state;
    final result = applyServerMessage(_state, message);
    _state = result.state;
    if (result.outcome == Outcome.welcome) _chunks = null;
    final send = <Map<String, dynamic>>[];
    switch (result.outcome) {
      case Outcome.applied:
      case Outcome.duplicate:
        send.add({
          'type': 'ack',
          'subscription': _state.subscription,
          'batch': result.batch,
        });
      case Outcome.resync:
        send.add({
          'type': 'resync',
          'subscription': _state.subscription,
          'slices': result.slices,
        });
      case Outcome.pong:
        send.add({'type': 'pong', 'nonce': result.nonce});
      case Outcome.welcome:
      case Outcome.ignored:
      case Outcome.reconnect:
      case Outcome.error:
        break;
    }
    if (result.outcome == Outcome.applied ||
        result.outcome == Outcome.welcome) {
      _notifyChanged(before, _state);
    }
    return StateReply(result.outcome, send, error: result.error);
  }

  void _notifyChanged(ClientState before, ClientState after) {
    if (_disposed) return;
    final changed = <String>[
      for (final name in {...before.revs.keys, ...after.revs.keys})
        if (before.revs[name] != after.revs[name] ||
            !identical(before.values[name], after.values[name]))
          name,
    ];
    for (final name in changed) {
      _signals[name]?.fire();
    }
    if (changed.isNotEmpty) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    for (final s in _signals.values) {
      s.dispose();
    }
    super.dispose();
  }
}

class _ChunkBuffer {
  final String subscription;
  final int batch, parts;
  final List<String> data = [];
  int size = 0;
  _ChunkBuffer(this.subscription, this.batch, this.parts);
}

class DockSliceSignal extends ChangeNotifier {
  void fire() => notifyListeners();
}

class StateReply {
  final Outcome outcome;
  final List<Map<String, dynamic>> send;
  final String? error;
  const StateReply(this.outcome, this.send, {this.error});
  bool get needsReconnect => outcome == Outcome.reconnect;
}
