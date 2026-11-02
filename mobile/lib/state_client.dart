// v2 state client. Unused by the app until the PC serves /v2/events; the v1
// path in dock_client.dart stays the default. Transport-free: feed it decoded
// server messages, send what it returns.
import 'package:flutter/foundation.dart';

import 'state_models.dart';
import 'state_protocol.dart';

class StateClient extends ChangeNotifier {
  ClientState _state = const ClientState(view: phoneView);
  final List<String> subscribed;
  final Map<String, DockSliceSignal> _signals = {};
  bool _disposed = false;

  StateClient({this.subscribed = const [
    'shell',
    'sessions',
    'prompts',
    'projects',
    'tasks',
    'usage',
    'results',
  ]});

  ClientState get state => _state;

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

  List<Session> get sessions => collectionItems(_state.values['sessions'], Session.fromJson);
  List<Task> get tasks => collectionItems(_state.values['tasks'], Task.fromJson);
  List<Project> get projects => collectionItems(_state.values['projects'], Project.fromJson);
  List<UsageAccount> get usage => collectionItems(_state.values['usage'], UsageAccount.fromJson);
  Map<String, dynamic>? value(String slice) {
    final v = _state.values[slice];
    return v is Map ? Map<String, dynamic>.from(v) : null;
  }

  /// Applies one server message and returns the messages to send back. A
  /// `reconnect` result is reported through [needsReconnect]; the caller closes
  /// the socket and sends `hello(resume: false)`.
  StateReply receive(Object? message) {
    final before = _state;
    final result = applyServerMessage(_state, message);
    _state = result.state;
    final send = <Map<String, dynamic>>[];
    switch (result.outcome) {
      case Outcome.applied:
      case Outcome.duplicate:
        send.add({'type': 'ack', 'subscription': _state.subscription, 'batch': result.batch});
      case Outcome.resync:
        send.add({'type': 'resync', 'subscription': _state.subscription, 'slices': result.slices});
      case Outcome.pong:
        send.add({'type': 'pong', 'nonce': result.nonce});
      case Outcome.welcome:
      case Outcome.ignored:
      case Outcome.reconnect:
      case Outcome.error:
        break;
    }
    if (result.outcome == Outcome.applied || result.outcome == Outcome.welcome) {
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
