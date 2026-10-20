import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

/// Drafts stay on this phone, in the same OS-backed encrypted store as pairing.
/// The PC certificate identity + stable console key isolate chats and hosts.
class ConsoleDrafts extends ChangeNotifier {
  final Future<String?> Function() read;
  final Future<void> Function(String) write;
  final Map<String, String> _values = {};
  final Map<String, Map<String, num>> _views = {};
  Timer? _timer;
  Future<void>? _saving;
  bool _dirty = false, _blocked = false, _disposed = false;
  String error = '';
  ConsoleDrafts({required this.read, required this.write});

  static String key(String pc, String console) => jsonEncode([pc, console]);
  String get(String key) => _values[key] ?? '';
  num? position(String key, String part) => _views[key]?[part];
  void remember(String key, String part, num value) {
    if (!value.isFinite || position(key, part) == value) return;
    final view = _views.remove(key) ?? <String, num>{};
    view[part] = value;
    _views[key] = view;
    while (_views.length > 128) {
      _views.remove(_views.keys.first);
    }
    _dirty = true;
    _timer?.cancel();
    _timer = Timer(const Duration(milliseconds: 300), flush);
  }

  Future<void> load() async {
    try {
      final raw = await read();
      if (raw != null) {
        final data = jsonDecode(raw) as Map<String, dynamic>;
        final views = data['@views'];
        if (views is Map) {
          for (final entry in views.entries.take(128)) {
            if (entry.key is String && entry.value is Map) {
              _views[entry.key as String] = {
                for (final p in (entry.value as Map).entries)
                  if (p.key is String &&
                      p.value is num &&
                      (p.value as num).isFinite)
                    p.key as String: p.value as num,
              };
            }
          }
        }
        for (final entry in data.entries) {
          if (entry.value is String) {
            _values.putIfAbsent(entry.key, () => entry.value as String);
          }
        }
      }
      _blocked = false;
    } catch (_) {
      _blocked = true;
      error = 'Saved drafts could not be opened. Restart the app to try again.';
    }
  }

  void set(String key, String value) {
    if (get(key) == value) return;
    _values.remove(key);
    if (value.isNotEmpty) _values[key] = value;
    // Keep recent drafts bounded without logging or moving text to plain files.
    while (_values.length > 128 ||
        (_values.length > 1 &&
            _values.values.fold<int>(0, (n, x) => n + x.length) >
                1024 * 1024)) {
      _values.remove(_values.keys.first);
    }
    _dirty = true;
    _timer?.cancel();
    _timer = Timer(const Duration(milliseconds: 200), flush);
  }

  Future<void> forgetPC(String pc) async {
    _values.removeWhere((key, _) => (jsonDecode(key) as List).first == pc);
    _views.removeWhere((key, _) => (jsonDecode(key) as List).first == pc);
    _dirty = true;
    await flush();
  }

  Future<void> flush() {
    _timer?.cancel();
    if (_blocked) return Future.value();
    return _saving ??= _drain().whenComplete(() => _saving = null);
  }

  Future<void> _drain() async {
    while (_dirty) {
      final snapshot = jsonEncode({
        ..._values,
        if (_views.isNotEmpty) '@views': _views,
      });
      _dirty = false;
      try {
        await write(snapshot);
        if (error.isNotEmpty) {
          error = '';
          if (!_disposed) notifyListeners();
        }
      } catch (_) {
        _dirty = true;
        error = 'Draft not saved on this phone. Keep the app open and try typing again.';
        if (!_disposed) notifyListeners();
        break;
      }
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    unawaited(flush());
    super.dispose();
  }
}
