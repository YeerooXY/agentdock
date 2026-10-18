import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/pairing_request.dart';

void main() {
  final invite = {'approval': true, 'secret': 'qr-secret'};
  PairReply waiting() => PairReply(202, {
    'id': 'pending-id',
    'code': '123456',
    'expires': DateTime.now().millisecondsSinceEpoch + 120000,
  });
  final approved = PairReply(200, {
    'id': 'device-id',
    'token': 'a' * 43,
    'v': 2,
  });
  test(
    'only the approved response completes; polling uses a separate random key',
    () async {
      var polls = 0;
      String? key, displayed;
      final operation = PairingRequest(invite, (route, auth, body) async {
        if (route == '/v1/pair') {
          expect(auth, 'qr-secret');
          key = body['requestKey'];
          expect(key, matches(RegExp(r'^[A-Za-z0-9_-]{43}$')));
          return waiting();
        }
        expect(route, '/v1/pair/status');
        expect(auth, key);
        expect(body, {'id': 'pending-id'});
        return ++polls < 3 ? const PairReply(202, {}) : approved;
      }, interval: Duration.zero);
      expect(await operation.run((code) => displayed = code), approved.data);
      expect(displayed, '123456');
      expect(polls, 3);
    },
  );
  test(
    'an old invitation or immediate access response cannot bypass approval',
    () async {
      await expectLater(
        PairingRequest(
          {'secret': 'old'},
          (_, auth, body) async => throw StateError('Must not send'),
        ).run((_) {}),
        throwsFormatException,
      );
      await expectLater(
        PairingRequest(invite, (_, auth, body) async => approved).run((_) {}),
        throwsFormatException,
      );
    },
  );
  for (final status in [401, 403]) {
    test(
      'rejected or expired request never returns credentials ($status)',
      () async {
        var cancelled = false;
        final op = PairingRequest(invite, (route, auth, body) async {
          if (route == '/v1/pair') return waiting();
          if (route == '/v1/pair/cancel') cancelled = true;
          return PairReply(status, {});
        }, interval: Duration.zero);
        await expectLater(op.run((_) {}), throwsFormatException);
        expect(cancelled, true);
      },
    );
  }
  test('cancel while the initial request is in flight cancels the returned request', () async {
    final response = Completer<PairReply>();
    var cancels = 0;
    final op = PairingRequest(invite, (route, auth, body) async {
      if (route == '/v1/pair') return response.future;
      expect(route, '/v1/pair/cancel');
      cancels++;
      return const PairReply(200, {});
    });
    final done = expectLater(
      op.run((_) => fail('Canceled code must not be displayed')),
      throwsFormatException,
    );
    await op.cancel();
    response.complete(waiting());
    await done;
    expect(cancels, 1);
  });
  test('cancel during an approved response revokes the new device', () async {
    final response = Completer<PairReply>(), entered = Completer<void>();
    var cancels = 0;
    final op = PairingRequest(invite, (route, auth, body) async {
      if (route == '/v1/pair') return waiting();
      if (route == '/v1/pair/cancel') {
        cancels++;
        return const PairReply(200, {});
      }
      entered.complete();
      return response.future;
    }, interval: Duration.zero);
    final done = expectLater(op.run((_) {}), throwsFormatException);
    await entered.future;
    await op.cancel();
    response.complete(approved);
    await done;
    expect(cancels, 1);
  });
}
