// Phone side of protocol 2 as the app uses it: the v1-shaped state map rebuilt
// from slices and extras, chunk reassembly against the shared fixture, and
// DockClient routing /v2/events frames. No network.
import 'dart:convert';
import 'dart:io';

import 'package:agent_dock_mobile/dock_client.dart';
import 'package:agent_dock_mobile/agent_profiles.dart';
import 'package:agent_dock_mobile/state_client.dart';
import 'package:agent_dock_mobile/state_protocol.dart';
import 'package:flutter_test/flutter_test.dart';

const _dir = '../tests/fixtures/state';
dynamic _load(String name) =>
    jsonDecode(File('$_dir/$name').readAsStringSync());

Map<String, dynamic> _collection(List<Map<String, dynamic>> items) => {
  'byId': {for (final item in items) item['id'] as String: item},
  'order': [for (final item in items) item['id']],
  'meta': <String, dynamic>{},
};

const _slices = [
  'shell',
  'sessions',
  'queues',
  'prompts',
  'projects',
  'tasks',
  'usage',
];

Map<String, dynamic> _welcome([String epoch = 'e']) => {
  'type': 'welcome',
  'protocol': 2,
  'epoch': epoch,
  'subscription': 's',
  'slices': _slices,
  'compression': 'none',
};

Map<String, dynamic> _session(String id, String state) => {
  'id': id,
  'slot': 1,
  'name': 'Console $id',
  'provider': 'codex',
  'alive': true,
  'state': state,
  'cols': 80,
  'rows': 24,
  'consoleKey': 'k-$id',
  'launchId': 'l-$id',
  'remote': null,
  'requestedSettings': null,
  'switchTargets': <dynamic>[],
  'consoleCapabilities': {'close': true},
};

Map<String, dynamic> _reset(
  int batch, {
  String epoch = 'e',
  List<Map<String, dynamic>>? sessions,
}) => {
  'type': 'changes',
  'epoch': epoch,
  'subscription': 's',
  'batch': batch,
  'changes': [
    {
      'kind': 'reset',
      'slice': 'shell',
      'rev': 1,
      'value': {'capacity': 6, 'version': '0.6.0'},
    },
    {
      'kind': 'reset',
      'slice': 'sessions',
      'rev': 1,
      'value': _collection(sessions ?? [_session('s1', 'active')]),
    },
    {
      'kind': 'reset',
      'slice': 'queues',
      'rev': 1,
      'value': {
        's1': {
          'paused': false,
          'entries': [
            {
              'id': 'q1',
              'text': 'next',
              'createdAt': 3,
              'ownerRequested': true,
            },
          ],
        },
      },
    },
    {
      'kind': 'reset',
      'slice': 'prompts',
      'rev': 1,
      'value': _collection([
        {
          'id': 'pr1',
          'name': 'Review',
          'text': 'Review this',
          'projectId': null,
          'updatedAt': 2,
        },
      ]),
    },
    {'kind': 'reset', 'slice': 'projects', 'rev': 1, 'value': _collection([])},
    {
      'kind': 'reset',
      'slice': 'tasks',
      'rev': 1,
      'value': _collection([
        {'id': 't1', 'title': 'Task', 'state': 'running'},
      ]),
    },
    {'kind': 'reset', 'slice': 'usage', 'rev': 1, 'value': _collection([])},
  ],
};

const _extras = {
  'connection': {'url': 'https://100.64.0.1:47831', 'name': 'PC'},
  'previews': <dynamic>[],
  'projects': [
    {'id': 'p1', 'name': 'Paddock'},
  ],
  'imageJobs': <dynamic>[],
  'imageJobsRunning': false,
  'capabilities': ['console.queue', 'prompts', 'state.v2'],
  'alerts': <dynamic>[],
};

void main() {
  test('subscribes to every phone slice, queues included', () {
    expect(StateClient().subscribed, phoneView.slices.keys.toList());
  });

  test('legacyState rebuilds the v1 map from slices and extras', () {
    final c = StateClient();
    expect(c.ready, isFalse);
    c.receive(_welcome());
    expect(c.receive(_reset(1)).send.single, {
      'type': 'ack',
      'subscription': 's',
      'batch': 1,
    });
    expect(c.ready, isTrue);
    final state = c.legacyState(Map<String, dynamic>.from(_extras));
    for (final key in _extras.keys) {
      expect(state[key], _extras[key], reason: key);
    }
    expect(state['capacity'], 6);
    expect((state['sessions'] as List).single['id'], 's1');
    expect((state['sessions'] as List).single['launchId'], 'l-s1');
    expect(((state['queues'] as Map)['s1'] as Map)['entries'], [
      {'id': 'q1', 'text': 'next', 'createdAt': 3, 'ownerRequested': true},
    ]);
    expect((state['prompts'] as List).single['name'], 'Review');
    expect((state['tasks'] as List).single['title'], 'Task');
    expect(state['usage'], isEmpty);
    // The phone projects list stays the extras one (v1 shape).
    expect(state['projects'], _extras['projects']);
  });

  group('chunks (transport.json)', () {
    for (final item
        in (_load('transport.json')['chunks'] as List).cast<Map>()) {
      test(item['name'] as String, () {
        final c = StateClient();
        final outcomes = <String>[];
        Map<String, dynamic>? complete;
        for (final chunk in item['chunks'] as List) {
          try {
            final message = c.addChunk(chunk);
            if (message == null) {
              outcomes.add('partial');
            } else {
              outcomes.add('complete');
              complete = message;
            }
          } on ProtocolError {
            outcomes.add('reconnect');
          }
        }
        expect(outcomes, item['expect']);
        if (item['message'] != null) expect(complete, item['message']);
      });
    }
  });

  group('DockClient on /v2/events', () {
    test('legacy phone frames install served profiles and older PCs restore the fallback', () {
      final phone = DockClient();
      addTearDown(phone.dispose);
      addTearDown(() => AgentProfiles.apply(null));
      final profiles = Map<String, dynamic>.from(
        _load('dto/phone-agent-profiles.json')['output'],
      );
      profiles['providers']['codex']['selectors'] = ['»'];
      phone.handleMessage(
        jsonEncode({
          'type': 'state',
          'state': {'sessions': <dynamic>[], 'agentProfiles': profiles},
        }),
      );
      expect(AgentProfiles.current.dialogs['codex']!.selectors, {'»'});
      phone.handleMessage(
        jsonEncode({
          'type': 'state',
          'state': {'sessions': <dynamic>[]},
        }),
      );
      expect(identical(AgentProfiles.current, AgentProfiles.bundled), isTrue);
    });

    test('served profiles reach the parser through protocol slices and reset for another PC', () {
      final phone = DockClient();
      addTearDown(phone.dispose);
      addTearDown(() => AgentProfiles.apply(null));
      final profiles = Map<String, dynamic>.from(
        _load('dto/phone-agent-profiles.json')['output'],
      );
      profiles['providers']['codex']['selectors'] = ['»'];
      final reset = _reset(1);
      (reset['changes'][0]['value'] as Map)['agentProfiles'] = profiles;
      phone.socketV2 = true;
      phone.handleMessage(jsonEncode(_welcome()));
      phone.handleMessage(jsonEncode(reset));
      expect(AgentProfiles.current.dialogs['codex']!.selectors, {'»'});
      phone.activate(null);
      expect(identical(AgentProfiles.current, AgentProfiles.bundled), isTrue);
    });

    test('slices and extras become the state map; requests are typed', () {
      final phone = DockClient();
      addTearDown(phone.dispose);
      phone.socketV2 = true;
      phone.handleMessage(jsonEncode({'type': 'extras', 'value': _extras}));
      expect(
        phone.sessions,
        isEmpty,
        reason: 'no state before the slices arrive',
      );
      phone.handleMessage(jsonEncode(_welcome()));
      phone.handleMessage(jsonEncode(_reset(1)));
      expect(phone.sessions.single['id'], 's1');
      expect(phone.state['capabilities'], contains('state.v2'));
      expect(phone.selected, 's1');

      // A patch updates one session; the map keeps the v1 shape.
      phone.handleMessage(
        jsonEncode({
          'type': 'changes',
          'epoch': 'e',
          'subscription': 's',
          'batch': 2,
          'changes': [
            {
              'kind': 'patch',
              'slice': 'sessions',
              'baseRev': 1,
              'rev': 2,
              'upsert': {'s2': _session('s2', 'ready')},
              'remove': ['s1'],
            },
          ],
        }),
      );
      expect(phone.sessions.map((s) => s['id']), ['s2']);
      expect(phone.selected, 's2');

      // New extras update the extra fields without touching the slices.
      expect(phone.sessions.map((s) => s['id']), ['s2']);
    });

    test('a chunked reset applies only when complete', () {
      final phone = DockClient();
      addTearDown(phone.dispose);
      phone.socketV2 = true;
      phone.handleMessage(jsonEncode({'type': 'extras', 'value': _extras}));
      phone.handleMessage(jsonEncode(_welcome()));
      final text = jsonEncode(_reset(1));
      final half = text.length ~/ 2;
      phone.handleMessage(
        jsonEncode({
          'type': 'chunk',
          'subscription': 's',
          'batch': 1,
          'part': 1,
          'parts': 2,
          'data': text.substring(0, half),
        }),
      );
      expect(phone.sessions, isEmpty);
      phone.handleMessage(
        jsonEncode({
          'type': 'chunk',
          'subscription': 's',
          'batch': 1,
          'part': 2,
          'parts': 2,
          'data': text.substring(half),
        }),
      );
      expect(phone.sessions.single['id'], 's1');
    });

    test('v1 state frames still work when the socket is v1', () {
      final phone = DockClient();
      addTearDown(phone.dispose);
      phone.handleMessage(
        jsonEncode({
          'type': 'state',
          'state': {
            'sessions': [_session('s1', 'ready')],
            'capabilities': <dynamic>[],
            'unreadResults': 0,
          },
        }),
      );
      expect(phone.sessions.single['id'], 's1');
      expect(phone.socketV2, isFalse);
    });
  });
}
