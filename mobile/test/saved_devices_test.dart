import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/dock_client.dart';
import 'package:agent_dock_mobile/saved_devices.dart';

class MemoryDevices {
  final Map<String, String> values = {};
  bool fail = false;
  Completer<void>? gate;
  late final store = SavedDevices(
    read: (key) async => values[key],
    delete: (key) async {
      values.remove(key);
    },
    write: (key, value) async {
      await gate?.future;
      if (fail) throw StateError('Storage unavailable');
      values[key] = value;
    },
  );
}

class TestPhone extends DockClient {
  TestPhone(SavedDevices store) : super(savedDevices: store);
  final connections = <String>[];
  @override
  Future<void> connect() async {
    connections.add(activePC);
  }
}

Map<String, dynamic> pc(String id) => {
  'pin': id * 64,
  'id': 'phone-$id',
  'name': 'PC $id',
  'url': 'https://192.168.1.${id == 'a' ? 2 : 3}:47831',
  'token': 'token-$id',
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('late metadata writes cannot recreate a forgotten PC', () async {
    final m = MemoryDevices();
    await m.store.put(pc('a'), activate: true);
    final forgotten = m.store.remove('a' * 64);
    final late = m.store.patch('a' * 64, {'pushProject': 'old-project'});
    await forgotten;
    await expectLater(late, throwsStateError);
    expect(m.store.pcs, isEmpty);
    expect(m.store.active, '');
  });
  test('migrates the existing encrypted pairing and alerts once', () async {
    final m = MemoryDevices()
      ..values['pc'] = jsonEncode(pc('a'))
      ..values['alerts'] = 'true';
    m.fail = true;
    await expectLater(m.store.load(), throwsStateError);
    expect(m.values.containsKey('pc'), isTrue);
    m.fail = false;
    await m.store.load();
    expect(m.store.pcs.single['token'], 'token-a');
    expect(m.store.pcs.single['alerts'], true);
    expect(m.store.active, 'a' * 64);
    expect(m.values.containsKey('pc'), isFalse);
    final restored = SavedDevices(
      read: (key) async => m.values[key],
      write: (key, value) async {
        m.values[key] = value;
      },
      delete: (key) async {
        m.values.remove(key);
      },
    );
    await restored.load();
    expect(restored.pcs.single['token'], 'token-a');
  });
  test('cancelled or failed second pairing preserves the first PC', () async {
    final m = MemoryDevices();
    await m.store.put(pc('a'), activate: true);
    m.fail = true;
    await expectLater(m.store.put(pc('b'), activate: true), throwsStateError);
    expect(m.store.pcs.length, 1);
    m.fail = false;
    m.gate = Completer<void>();
    bool valid = true;
    final pending = m.store.put(pc('b'), activate: true, valid: () => valid);
    await Future<void>.delayed(Duration.zero);
    valid = false;
    m.gate!.complete();
    await expectLater(pending, throwsFormatException);
    expect(m.store.active, 'a' * 64);
    expect(jsonDecode(m.values['devices.v1']!)['pcs'].length, 1);
  });
  test('switching keeps both identities and rejects in-flight input', () async {
    final m = MemoryDevices();
    await m.store.put({
      ...pc('a'),
      'manualUrl': 'https://home.duckdns.org:47831',
      'alerts': true,
    }, activate: true);
    await m.store.put(pc('b'));
    final phone = TestPhone(m.store);
    addTearDown(phone.dispose);
    phone.activate(m.store.find('a' * 64));
    phone.selected = 'console-a';
    phone.state = {
      'sessions': [
        {'id': 'console-a'},
      ],
      'unreadResults': 9,
    };
    final screen = phone.makeScreen('console-a');
    phone.screens['console-a'] = screen;
    final input = Completer<dynamic>();
    phone.pending['input'] = input;
    final failed = expectLater(input.future, throwsStateError);
    final generation = phone.generation;
    await phone.switchPC('b' * 64);
    await failed;
    expect(phone.generation, greaterThan(generation));
    expect(phone.screens, isEmpty);
    expect(phone.sessions, isEmpty);
    expect(phone.state['unreadResults'], 0);
    screen.terminal.onOutput?.call('must not run on B');
    expect(phone.pending, isEmpty);
    await phone.renamePC('a' * 64, 'Home workstation');
    await phone.switchPC('a' * 64);
    expect(phone.selected, 'console-a');
    expect(phone.pcName, 'Home workstation');
    expect(phone.pairing!['token'], 'token-a');
    expect(phone.pairing!['manualUrl'], 'https://home.duckdns.org:47831');
    expect(m.store.pcs.length, 2);
    await phone.forgetPC('b' * 64);
    expect(phone.activePC, 'a' * 64);
    expect(phone.pairing!['token'], 'token-a');
    expect(m.store.pcs.length, 1);
  });
  test('failed switch leaves the active PC intact and queued writes survive failure', () async {
    final m = MemoryDevices();
    await m.store.put(pc('a'), activate: true);
    await m.store.put(pc('b'));
    final phone = TestPhone(m.store);
    addTearDown(phone.dispose);
    phone.activate(m.store.find('a' * 64));
    m.fail = true;
    await expectLater(phone.switchPC('b' * 64), throwsStateError);
    expect(phone.activePC, 'a' * 64);
    m.fail = false;
    await phone.renamePhone('My Pixel');
    expect(
      m.store.pcs.every((pc) => pc['pendingPhoneName'] == 'My Pixel'),
      isTrue,
    );
    await phone.switchPC('b' * 64);
    expect(phone.activePC, 'b' * 64);
  });
  test(
    'pairing the same certificate replaces only that PC, retaining its name',
    () async {
      final m = MemoryDevices();
      await m.store.put({...pc('a'), 'alias': 'Studio'}, activate: true);
      await m.store.put(pc('b'));
      await m.store.put({...pc('a'), 'token': 'new-token'}, activate: true);
      expect(m.store.pcs.length, 2);
      expect(m.store.find('a' * 64)!['alias'], 'Studio');
      expect(m.store.find('b' * 64)!['token'], 'token-b');
      expect(SavedDevices.name(' \u202eMy\n PC '), 'My PC');
      expect(() => SavedDevices.name(' '), throwsFormatException);
      expect(() => SavedDevices.name('x' * 65), throwsFormatException);
    },
  );
}
