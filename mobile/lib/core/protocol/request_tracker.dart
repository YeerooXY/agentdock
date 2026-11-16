import 'dart:async';

/// Outstanding request/reply pairs on the current socket.
///
/// Replies are matched by ID only. A lost or paused connection fails every
/// outstanding request, so a caller never assumes delivery after a reconnect.
class RequestTracker {
  final Map<String, Completer<dynamic>> pending = {};
  int serial = 0;

  /// A new ID and its completer, already registered.
  ({String id, Completer<dynamic> completer}) open() {
    final id = '${DateTime.now().microsecondsSinceEpoch}-${serial++}';
    final completer = Completer<dynamic>();
    pending[id] = completer;
    return (id: id, completer: completer);
  }

  void close(String id) => pending.remove(id);

  /// Completes the request a `reply` frame answers. Unknown IDs are ignored.
  void reply(Map<String, dynamic> data) {
    final done = pending.remove(data['id']);
    if (done == null || done.isCompleted) return;
    if (data['error'] != null) {
      done.completeError(StateError(data['error'] as String));
    } else {
      done.complete(data['value']);
    }
  }

  void failAll(String message) {
    for (final entry in pending.values) {
      if (!entry.isCompleted) entry.completeError(StateError(message));
    }
    pending.clear();
  }

  static Duration timeout(String method) =>
      Duration(seconds: method == 'console.settings' ? 120 : 20);
}
