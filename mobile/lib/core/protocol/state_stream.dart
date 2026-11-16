import '../../state_client.dart';
import '../../state_protocol.dart';

/// State protocol 2 on the shared event socket.
///
/// The slice cache stays across reconnects to the same PC so a resume sends
/// only what changed. Complete states are handed back in the v1 map shape.
class StateStream {
  StateStream({
    required this.send,
    required this.apply,
    required this.changed,
    required this.dropSocket,
  });

  /// Writes one protocol frame to the socket.
  final void Function(Map<String, dynamic> frame) send;

  /// Receives the rebuilt v1-shaped state.
  final void Function(Map<String, dynamic> state) apply;

  /// Tells listeners that client-visible state changed.
  final void Function() changed;

  /// Closes the socket after repeated failures, so the normal reconnect runs.
  final void Function() dropSocket;

  final StateClient cache = StateClient();
  Map<String, dynamic> _extras = {};
  int _retries = 0;

  /// Forgets everything learned from the previous PC.
  void clear() {
    cache.clear();
    _extras = {};
  }

  /// Subscribes on a freshly opened socket.
  void start() {
    _retries = 0;
    send(cache.hello());
  }

  /// Handles protocol 2 frames. Returns the frame left for the shared
  /// reply/state/terminal handling, or null when it was consumed here.
  Map<String, dynamic>? accept(Map<String, dynamic> data) {
    if (data['type'] == 'chunk') {
      Map<String, dynamic>? complete;
      try {
        complete = cache.addChunk(data);
      } on ProtocolError {
        _recover();
        return null;
      }
      if (complete == null) return null;
      data = complete;
    }
    if (const {'welcome', 'changes', 'ping', 'error'}.contains(data['type'])) {
      _receive(data);
      return null;
    }
    if (data['type'] == 'extras') {
      final value = data['value'];
      _extras = value is Map ? Map<String, dynamic>.from(value) : {};
      if (cache.ready) apply(cache.legacyState(_extras));
      changed();
      return null;
    }
    return data;
  }

  /// One protocol 2 message: apply it, answer it, and rebuild the state map
  /// once every slice has arrived.
  void _receive(Map<String, dynamic> message) {
    final reply = cache.receive(message);
    for (final frame in reply.send) {
      send(frame);
    }
    switch (reply.outcome) {
      case Outcome.applied:
        _retries = 0;
        if (cache.ready) {
          apply(cache.legacyState(_extras));
          changed();
        }
      case Outcome.reconnect:
        _recover();
      case Outcome.error:
        // The PC lost this subscription; subscribe again from the cache.
        if (++_retries > 3) {
          dropSocket();
        } else {
          send(cache.hello());
        }
      default:
        break;
    }
  }

  /// A batch could not be applied: ask for a fresh subscription on this
  /// socket. Repeated failures close the socket and reconnect normally.
  void _recover() {
    if (++_retries > 3) {
      dropSocket();
      return;
    }
    send(cache.hello(resume: false));
  }

  void dispose() => cache.dispose();
}
