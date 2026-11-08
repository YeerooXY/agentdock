import 'package:xterm/xterm.dart';

import '../console_scope.dart';
import '../signal.dart';

class ConsoleScreen {
  final Terminal terminal = Terminal(maxLines: 3000);
  int sequence = -1, epoch = 0, cols = 110, rows = 30;
  bool receiving = false;
}

/// Phone-side terminal buffers and their display effects.
///
/// Every value is keyed by PC and console, and terminal signals also by
/// launch, so a relaunched console or another PC never inherits a buffer,
/// listener or effect. Output fires only the console's own signal.
class ConsoleTerminals {
  ConsoleTerminals(this._scope);
  final ConsoleScope _scope;

  final Map<String, ConsoleScreen> screens = {};
  final Map<String, DockSignal> _signals = {};
  final Set<String> _pendingOpenings = {};
  final Map<String, int> _stateEffectSequences = {};
  final Map<String, String> _stateEffectKinds = {};
  final Map<String, int> _outputBurstSequences = {};
  final Map<String, int> _outputSequences = {};
  final Map<String, DateTime> _outputLastPackets = {};
  final Map<String, int> _outputGenerations = {};
  final Set<String> _pendingOutputBaselines = {};
  int _baselineGeneration = -1;

  String _console(String id) => '${_scope.activePC}:$id';

  /// Identity of one terminal: PC, console and launch.
  String key(String id) =>
      '${_scope.activePC}:$id:${_scope.sessionMap(id)?['launchId'] ?? ''}';

  DockSignal signal(String id) => _signals.putIfAbsent(key(id), DockSignal.new);

  /// Claims the one-shot opening produced by a live session-list addition.
  /// Initial snapshots and the first state after reconnect never add entries.
  bool claimOpening(String id) => _pendingOpenings.remove(_console(id));
  int stateEffectSequence(String id) =>
      _stateEffectSequences[_console(id)] ?? 0;
  String? stateEffectKind(String id) => _stateEffectKinds[_console(id)];
  int outputBurstSequence(String id) =>
      _outputBurstSequences[_console(id)] ?? 0;
  int outputSequence(String id) => _outputSequences[_console(id)] ?? 0;

  /// A lost or paused connection cancels openings that were not shown yet.
  void cancelOpenings() => _pendingOpenings.clear();

  /// Records openings and ready/error effects for a new console list, and
  /// drops every value for consoles the PC no longer lists. The first list on
  /// a new generation is a baseline only.
  void observeSessions(
    Map<Object?, Object?> previousStates,
    List<Map<String, dynamic>> next,
  ) {
    if (_baselineGeneration != _scope.generation) {
      _baselineGeneration = _scope.generation;
      _pendingOpenings.clear();
      _pendingOutputBaselines.addAll(next.map((s) => _console('${s['id']}')));
    } else {
      for (final session in next) {
        final key = _console('${session['id']}');
        if (session['alive'] == true &&
            !previousStates.containsKey(session['id'])) {
          _pendingOpenings.add(key);
          _pendingOutputBaselines.add(key);
        }
        final oldState = previousStates[session['id']],
            nextState = session['state'];
        final effect = nextState == 'ready' && oldState != 'ready'
            ? 'ready'
            : nextState == 'error' && oldState != 'error'
            ? 'error'
            : null;
        if (effect != null) {
          _stateEffectSequences.update(
            key,
            (value) => value + 1,
            ifAbsent: () => 1,
          );
          _stateEffectKinds[key] = effect;
        }
      }
    }
    final ids = next.map((s) => _console('${s['id']}')).toSet();
    bool gone(String key) => !ids.contains(key);
    _pendingOpenings.removeWhere(gone);
    _stateEffectSequences.removeWhere((key, _) => gone(key));
    _stateEffectKinds.removeWhere((key, _) => gone(key));
    _outputBurstSequences.removeWhere((key, _) => gone(key));
    _outputSequences.removeWhere((key, _) => gone(key));
    _outputLastPackets.removeWhere((key, _) => gone(key));
    _outputGenerations.removeWhere((key, _) => gone(key));
    _pendingOutputBaselines.removeWhere(gone);
  }

  /// Drops buffers for consoles that are no longer listed.
  void keepScreens(Set<Object?> ids) =>
      screens.removeWhere((id, _) => !ids.contains(id));

  /// Writes one terminal frame. Returns whether the screen was replaced, or
  /// null when the console is unknown.
  bool? receive(
    Map<String, dynamic> data,
    ConsoleScreen Function(String id) create,
  ) {
    final id = data['id'] as String;
    if (_scope.sessionMap(id) == null) return null;
    // xterm.dart does not implement RIS (ESC c). A checkpoint needs a
    // fresh parser and buffers, including modes and partial escape input.
    final structural = data['reset'] == true || !screens.containsKey(id);
    final view = data['reset'] == true
        ? (screens[id] = create(id))
        : screens.putIfAbsent(id, () => create(id));
    _countOutput(id, reset: data['reset'] == true);
    view.receiving = true;
    try {
      view.cols = (data['cols'] as num).toInt();
      view.rows = (data['rows'] as num).toInt();
      if (view.terminal.viewWidth != view.cols ||
          view.terminal.viewHeight != view.rows) {
        view.terminal.resize(view.cols, view.rows);
      }
      view.terminal.write(data['data'] as String);
      view.sequence = (data['sequence'] as num).toInt();
      view.epoch = (data['epoch'] as num).toInt();
    } finally {
      view.receiving = false;
    }
    return structural;
  }

  /// Live output advances the activity and burst counters. Snapshots after a
  /// reset, reconnect or new console only set the baseline.
  void _countOutput(String id, {required bool reset}) {
    final now = DateTime.now(), key = _console(id);
    final generation = _scope.generation;
    final previousGeneration = _outputGenerations[key];
    if (reset ||
        _pendingOutputBaselines.contains(key) ||
        previousGeneration != generation) {
      final reconnectBaseline =
          _pendingOutputBaselines.remove(key) ||
          (previousGeneration != null && previousGeneration != generation);
      _outputGenerations[key] = generation;
      if (reconnectBaseline && _outputLastPackets.containsKey(key)) {
        _outputLastPackets[key] = now;
      }
      return;
    }
    final previousPacket = _outputLastPackets[key];
    _outputSequences.update(key, (value) => value + 1, ifAbsent: () => 1);
    if (previousPacket == null ||
        now.difference(previousPacket) > const Duration(milliseconds: 900)) {
      _outputBurstSequences.update(
        key,
        (value) => value + 1,
        ifAbsent: () => 1,
      );
    }
    _outputGenerations[key] = generation;
    _outputLastPackets[key] = now;
  }

  void dispose() {
    for (final signal in _signals.values) {
      signal.dispose();
    }
  }
}
