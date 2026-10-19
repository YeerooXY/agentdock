import 'dart:async';
import 'dart:convert';

/// One encrypted record, identified by the PC's certificate rather than its IP.
/// Mutations commit in order; a failed write leaves the previous record intact.
class SavedDevices {
  final Future<String?> Function(String key) read;
  final Future<void> Function(String key, String value) write;
  final Future<void> Function(String key) delete;
  Map<String, dynamic> _data = {
    'version': 1,
    'active': '',
    'phoneName': 'Android phone',
    'pcs': <dynamic>[],
  };
  Future<void> _queue = Future<void>.value();
  SavedDevices({required this.read, required this.write, required this.delete});

  List<Map<String, dynamic>> get pcs =>
      (jsonDecode(jsonEncode(_data['pcs'])) as List)
          .cast<Map<String, dynamic>>();
  String get active => _data['active'] as String;
  String get phoneName => _data['phoneName'] as String;
  Map<String, dynamic>? find(String pin) =>
      pcs.where((pc) => pc['pin'] == pin).firstOrNull;
  static String name(String text) {
    final value = text
        .replaceAll(RegExp(r'[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]'), '')
        .trim();
    if (value.isEmpty || value.runes.length > 64) {
      throw const FormatException('Use a name from 1 to 64 characters.');
    }
    return value;
  }

  static String label(Map<String, dynamic> pc) =>
      (pc['alias'] ?? pc['name'] ?? 'Your PC') as String;

  Future<void> load() async {
    final raw = await read('devices.v1');
    if (raw != null) {
      final data = jsonDecode(raw) as Map<String, dynamic>;
      if (data['version'] != 1 ||
          data['pcs'] is! List ||
          data['active'] is! String ||
          data['phoneName'] is! String) {
        throw const FormatException('Saved devices could not be read.');
      }
      _data = data;
      return;
    }
    final legacy = await read('pc');
    if (legacy == null) return;
    final pc = jsonDecode(legacy) as Map<String, dynamic>;
    if (await read('alerts') == 'true') pc['alerts'] = true;
    await change((data) {
      data['pcs'] = [pc];
      data['active'] = pc['pin'];
    });
    // Delete only after the new encrypted record has committed successfully.
    await delete('pc');
    await delete('alerts');
  }

  Future<void> change(
    void Function(Map<String, dynamic>) update, {
    bool Function()? valid,
  }) {
    final next = _queue.catchError((_) {}).then((_) async {
      final before = jsonEncode(_data);
      final data = jsonDecode(before) as Map<String, dynamic>;
      update(data);
      if (valid != null && !valid()) {
        throw const FormatException('Pairing canceled.');
      }
      await write('devices.v1', jsonEncode(data));
      if (valid != null && !valid()) {
        await write('devices.v1', before);
        throw const FormatException('Pairing canceled.');
      }
      _data = data;
    });
    _queue = next;
    return next;
  }

  Future<void> put(
    Map<String, dynamic> pc, {
    bool activate = false,
    bool Function()? valid,
  }) => change((data) {
    final pcs = data['pcs'] as List;
    final index = pcs.indexWhere((entry) => entry['pin'] == pc['pin']);
    if (index < 0) {
      pcs.add({...pc});
    } else {
      pcs[index] = {...pcs[index], ...pc};
    }
    if (activate) data['active'] = pc['pin'];
  }, valid: valid);

  Future<void> select(String pin) => change((data) {
    if (!(data['pcs'] as List).any((pc) => pc['pin'] == pin)) {
      throw StateError('This PC is no longer saved.');
    }
    data['active'] = pin;
  });

  Future<void> patch(String pin, Map<String, dynamic> values) => change((data) {
    final pc = (data['pcs'] as List)
        .where((pc) => pc['pin'] == pin)
        .firstOrNull;
    if (pc == null) throw StateError('This PC is no longer saved.');
    pc.addAll({...values, 'pin': pin});
  });

  Future<void> remove(String pin) => change((data) {
    final pcs = data['pcs'] as List;
    pcs.removeWhere((pc) => pc['pin'] == pin);
    if (data['active'] == pin) {
      data['active'] = pcs.isEmpty ? '' : pcs.first['pin'];
    }
  });
}
