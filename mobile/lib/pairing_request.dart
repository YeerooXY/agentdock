import 'dart:async';
import 'dart:convert';
import 'dart:math';

class PairReply {
  final int status;
  final Map<String, dynamic> data;
  const PairReply(this.status, this.data);
}

typedef PairExchange = Future<PairReply> Function(
  String route,
  String authorization,
  Map<String, dynamic> body,
);

// Temporary credentials authorize only this approval request. They never go
// into phone storage and cannot open a terminal WebSocket.
class PairingRequest {
  final Map<String, dynamic> invite;
  final PairExchange exchange;
  final Duration interval;
  final String requestKey;
  final String name;
  String id = '';
  bool cancelled = false, _cancelSent = false;
  final _wake = Completer<void>();

  PairingRequest(
    this.invite,
    this.exchange, {
    this.interval = const Duration(seconds: 3),
    this.name = 'Android phone',
  }) : requestKey = base64Url
           .encode(List.generate(32, (_) => Random.secure().nextInt(256)))
           .replaceAll('=', '');

  Future<void> cancel() async {
    cancelled = true;
    if (!_wake.isCompleted) _wake.complete();
    if (id.isEmpty || _cancelSent) return;
    _cancelSent = true;
    try {
      await exchange('/v1/pair/cancel', requestKey, {'id': id});
    } catch (_) {}
  }

  void checkCancelled() {
    if (cancelled) throw const FormatException('Pairing canceled.');
  }

  Never refused(int status) {
    throw FormatException(switch (status) {
      403 => 'Pairing was denied on your PC.',
      401 =>
        'This request expired or was canceled. Show a new code on your PC.',
      426 => 'Update Agent Dock on both devices, then try again.',
      429 => 'Too many attempts. Wait a minute, then show a new code.',
      409 => 'Remove an old phone in PC setup, then try again.',
      _ => 'The PC could not complete pairing. Show a new code and try again.',
    });
  }

  Future<Map<String, dynamic>> run(void Function(String code) onCode) async {
    if (invite['approval'] != true) {
      throw const FormatException(
        'Update Agent Dock on your PC to use phone approval.',
      );
    }
    final started = await exchange('/v1/pair', invite['secret'] as String, {
      'name': name,
      'approval': true,
      'requestKey': requestKey,
    });
    if (started.status != 202) refused(started.status);
    final data = started.data, code = data['code'];
    if (data['id'] is! String ||
        (data['id'] as String).length > 80 ||
        data['id'] == '' ||
        code is! String ||
        !RegExp(r'^\d{6}$').hasMatch(code) ||
        data['expires'] is! int) {
      throw const FormatException(
        'The PC returned an invalid approval request.',
      );
    }
    id = data['id'] as String;
    if (cancelled) {
      await cancel();
      checkCancelled();
    }
    final deadline = min(
      data['expires'] as int,
      DateTime.now().millisecondsSinceEpoch + 120000,
    );
    onCode(code);
    try {
      while (DateTime.now().millisecondsSinceEpoch < deadline) {
        await Future.any([Future<void>.delayed(interval), _wake.future]);
        checkCancelled();
        PairReply reply;
        try {
          reply = await exchange('/v1/pair/status', requestKey, {'id': id});
        } on FormatException {
          rethrow;
        } catch (_) {
          continue;
        }
        checkCancelled();
        if (reply.status == 202 || reply.status == 429) continue;
        if (reply.status != 200) refused(reply.status);
        if (reply.data['v'] != 2 ||
            reply.data['id'] is! String ||
            reply.data['token'] is! String ||
            !RegExp(r'^[A-Za-z0-9_-]{43}$')
                .hasMatch(reply.data['token'] as String)) {
          throw const FormatException(
            'The PC returned an invalid pairing response.',
          );
        }
        return reply.data;
      }
      throw const FormatException(
        'Approval timed out. Show a new code on your PC.',
      );
    } catch (_) {
      await cancel();
      rethrow;
    }
  }
}
