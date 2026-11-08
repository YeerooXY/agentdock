import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/state_client.dart';
import 'package:agent_dock_mobile/state_models.dart';
import 'package:agent_dock_mobile/state_protocol.dart';

const _dir = '../tests/fixtures/state';
dynamic _load(String name) => jsonDecode(File('$_dir/$name').readAsStringSync());

StateView _view(String name) {
  if (name == 'phone') return phoneView;
  final slices = _load('slices.json')['slices'] as Map;
  return StateView('desktop', {
    for (final e in slices.entries)
      e.key as String: (e.value as Map)['kind'] == 'collection'
          ? SliceKind.collection
          : SliceKind.value,
  });
}

void main() {
  test('phone view matches the fixture allowlist', () {
    final phone = _load('slices.json')['phone'] as Map;
    expect(phoneView.slices.keys.toList(), phone.keys.toList());
    for (final e in phone.entries) {
      expect(
        phoneView.slices[e.key],
        (e.value as Map)['kind'] == 'collection' ? SliceKind.collection : SliceKind.value,
      );
    }
  });

  group('sequences.json', () {
    for (final sequence in _load('sequences.json') as List) {
      test(sequence['name'] as String, () {
        final view = _view(sequence['view'] as String);
        var state = ClientState.fromJson(Map<String, dynamic>.from(sequence['start'] as Map), view);
        final steps = sequence['steps'] as List;
        for (var i = 0; i < steps.length; i++) {
          final step = steps[i] as Map, expected = step['expect'] as Map;
          final result = applyServerMessage(state, step['message']);
          final label = '${sequence['name']} step $i';
          expect(result.outcome.name, expected['outcome'], reason: label);
          expect(result.batch, expected['batch'], reason: '$label batch');
          expect(result.error, expected['error'], reason: '$label error');
          expect(result.nonce, expected['nonce'], reason: '$label nonce');
          expect(result.slices, expected['slices'] ?? const [], reason: '$label slices');
          expect(jsonDecode(jsonEncode(result.state.toJson())), expected['state'], reason: '$label state');
          state = result.state;
        }
      });
    }
  });

  group('messages.json', () {
    final messages = _load('messages.json') as Map;
    for (final item in messages['valid'] as List) {
      test('valid: ${item['name']}', () {
        final view = _view(item['view'] as String? ?? 'desktop');
        if (item['direction'] == 'client') {
          validateClientMessage(item['message'], view);
        } else {
          validateServerMessage(item['message'], view);
        }
      });
    }
    for (final item in messages['invalid'] as List) {
      test('invalid: ${item['name']}', () {
        final view = _view(item['view'] as String? ?? 'desktop');
        expect(
          () => item['direction'] == 'client'
              ? validateClientMessage(item['message'], view)
              : validateServerMessage(item['message'], view),
          throwsA(isA<ProtocolError>().having((e) => e.code, 'code', item['code'])),
        );
      });
    }
  });

  group('dto fixtures', () {
    Map<String, dynamic> out(String name) =>
        Map<String, dynamic>.from(_load('dto/$name.json')['output'] as Map);

    test('weekly-exhausted window retains its inapplicable state from the phone projection', () {
      final u = UsageAccount.fromJson(out('phone-usage-disabled'));
      expect(u.windows.first.usedPercent, 100);
      expect(u.windows.first.notApplicable, isFalse);
      expect(u.windows.last.notApplicable, isTrue);
      expect(u.windows.last.usedPercent, isNull);
      expect(u.windows.last.resetsAt, isNull);
      expect(u.windows.last.resetLabel, 'Weekly limit reached');
    });

    test('session', () {
      final s = Session.fromJson(out('phone-session'));
      expect([s.id, s.slot, s.provider, s.state, s.cols, s.rows], ['s1', 2, 'codex', 'active', 120, 30]);
      expect([s.model, s.modelName, s.effort, s.launchId], ['gpt-6', 'GPT-6', 'high', 'l1']);
      expect(s.switchTargets.single.ready, isTrue);
      expect([s.worktreeBranch, s.worktreePath], ['feature', 'C:/w/feature']);
      expect(s.consoleCapabilities, {'input': true, 'stop': true});
      expect(s.taskId, isNull);
    });
    test('task', () {
      final t = Task.fromJson(out('phone-task'));
      expect([t.id, t.state, t.round, t.maxRounds, t.unresolved], ['t1', 'reviewing', 2, 3, 1]);
      expect(t.implementer?.label, 'Codex');
      expect(t.reviewer, isNull);
      expect(t.finishedAt, isNull);
    });
    test('project', () {
      final p = Project.fromJson(out('phone-project'));
      expect([p.id, p.name, p.color, p.progressDone, p.progressTotal], ['p1', 'Paddock', '#47c', 1, 4]);
    });
    test('usage account keeps unknown percent unknown and stale visible', () {
      final u = UsageAccount.fromJson(out('phone-usage-account'));
      expect(u.check.stale, isTrue);
      expect(u.check.failure, 'sign-in');
      expect(u.windows.first.usedPercent, 42);
      expect(u.windows.last.usedPercent, isNull);
    });
  });

  group('StateClient', () {
    Map<String, dynamic> welcome() => {
      'type': 'welcome', 'protocol': 2, 'epoch': 'e', 'subscription': 's',
      'slices': ['sessions', 'tasks'], 'compression': 'none',
    };
    Map<String, dynamic> reset(int batch, String slice, int rev, Map<String, dynamic> items) => {
      'type': 'changes', 'epoch': 'e', 'subscription': 's', 'batch': batch,
      'changes': [
        {
          'kind': 'reset', 'slice': slice, 'rev': rev,
          'value': {'byId': items, 'order': items.keys.toList(), 'meta': {}},
        },
      ],
    };

    test('hello fresh and resume; replies ack, resync and pong', () {
      final c = StateClient(subscribed: ['sessions', 'tasks']);
      expect(c.hello()['lastRev'], isNull);
      c.receive(welcome());
      final applied = c.receive(reset(1, 'sessions', 3, {
        'a': {'id': 'a', 'name': 'A', 'provider': 'codex', 'state': 'ready'},
      }));
      expect(applied.send.single, {'type': 'ack', 'subscription': 's', 'batch': 1});
      expect(c.sessions.single.name, 'A');
      expect(c.hello()['lastRev'], {'epoch': 'e', 'revs': {'sessions': 3}});
      expect(c.hello(resume: false)['lastRev'], isNull);

      final gap = c.receive({
        'type': 'changes', 'epoch': 'e', 'subscription': 's', 'batch': 2,
        'changes': [
          {'kind': 'patch', 'slice': 'sessions', 'baseRev': 9, 'rev': 10, 'upsert': {}, 'remove': []},
        ],
      });
      expect(gap.send.single, {'type': 'resync', 'subscription': 's', 'slices': ['sessions']});
      expect(c.receive({'type': 'ping', 'nonce': 'n'}).send.single, {'type': 'pong', 'nonce': 'n'});
      expect(c.receive(reset(1, 'sessions', 99, {})).send.single['batch'], 1);
      expect(c.sessions.length, 1);
      expect(c.receive({...reset(5, 'sessions', 1, {}), 'epoch': 'x'}).needsReconnect, isTrue);
    });

    test('a slice notifier fires only for its own slice', () {
      final c = StateClient(subscribed: ['sessions', 'tasks']);
      var sessions = 0, tasks = 0;
      c.slice('sessions').addListener(() => sessions++);
      c.slice('tasks').addListener(() => tasks++);
      c.receive(welcome());
      c.receive(reset(1, 'tasks', 1, {'t': {'id': 't', 'title': 'T', 'state': 'running'}}));
      expect([sessions, tasks], [0, 1]);
      expect(c.tasks.single.title, 'T');
      c.receive({
        'type': 'changes', 'epoch': 'e', 'subscription': 's', 'batch': 2,
        'changes': [
          {
            'kind': 'patch', 'slice': 'tasks', 'baseRev': 1, 'rev': 2,
            'upsert': {'t': {'id': 't', 'title': 'T2', 'state': 'done'}}, 'remove': [],
          },
        ],
      });
      expect([sessions, tasks], [0, 2]);
      expect(c.tasks.single.state, 'done');
    });
  });
}
