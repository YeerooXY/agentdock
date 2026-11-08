/// Turns PC alerts into Android notifications while the app is in the
/// background with Stay connected on.
///
/// Alerts already present when direct alerts were turned on are a baseline
/// and never notify. One notification is kept per console.
class AlertRelay {
  AlertRelay(this._notify);
  final void Function(Map<String, dynamic> notification) _notify;
  final Set<String> _seen = {};
  bool _baselinePending = false;

  /// Marks the current alerts as seen. When not connected yet, the first
  /// alert list received is also a baseline.
  void baseline(String pc, Object? alerts, {required bool connected}) {
    // Baseline unread IDs instead of comparing clocks on different devices.
    // Reconnects within this run still deliver unseen events.
    _baselinePending = !connected;
    for (final event in (alerts as List? ?? []).whereType<Map>()) {
      _seen.add('$pc:${event['id']}');
    }
  }

  /// Notifies for new alerts in [state]. Older PCs without an alert list
  /// notify on console state changes instead.
  void relay({
    required String pc,
    required Map<String, dynamic> state,
    required Map<Object?, Object?> previousStates,
    required List<Map<String, dynamic>> sessions,
    required bool foreground,
  }) {
    final events = state['alerts'] as List?;
    if (events != null) {
      for (final event in events.whereType<Map>()) {
        if (_seen.add('$pc:${event['id']}') &&
            !_baselinePending &&
            !foreground) {
          _notify({
            // One notification per console: a newer alert replaces its older one.
            'key': '$pc:${event['sessionId'] ?? event['id']}',
            'title': event['title'],
            'text': event['message'] is String ? event['message'] : '',
          });
        }
      }
      _baselinePending = false;
    } else {
      for (final s in sessions) {
        if (previousStates.containsKey(s['id']) &&
            previousStates[s['id']] != s['state'] &&
            ['ready', 'attention', 'error'].contains(s['state']) &&
            !foreground) {
          _notify({
            'key': '$pc:${s['id']}',
            'title': '${s['name']} is ${s['state']}',
          });
        }
      }
    }
    while (_seen.length > 500) {
      _seen.remove(_seen.first);
    }
  }
}
