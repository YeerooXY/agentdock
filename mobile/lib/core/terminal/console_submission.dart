import 'dart:convert';
import 'dart:math';

import '../../state_models.dart';

/// One immutable observation of the selected console and transport.
typedef SubmissionTarget = ({
  String pc,
  String selected,
  int generation,
  Object? connection,
  bool connected,
  bool foreground,
  bool bracketedPaste,
  Session? session,
});

/// Two-phase terminal submission and idempotent worker steering. The client
/// owns connection state; this service observes snapshots and sends requests.
class ConsoleSubmission {
  ConsoleSubmission({
    required this.snapshot,
    required this.request,
    required this.input,
  });
  final SubmissionTarget Function() snapshot;
  final Future<dynamic> Function(String method, dynamic payload) request;
  final Future<void> Function(String value, {String? id}) input;
  final _workerSubmissions = <String, ({String text, String id})>{};

  String workerSubmissionId(String id, String text) {
    final key = '${snapshot().pc}/$id';
    if (_workerSubmissions[key]?.text != text) {
      final random = Random.secure();
      _workerSubmissions[key] = (
        text: text,
        id: base64UrlEncode(List<int>.generate(24, (_) => random.nextInt(256))),
      );
    }
    return _workerSubmissions[key]!.id;
  }

  Future<void> submit(
    String text, {
    bool command = false,
    bool Function()? canContinue,
  }) async {
    final before = snapshot();
    final target = before.session;
    final id = before.selected;
    if (id.isEmpty ||
        !before.connected ||
        !before.foreground ||
        canContinue?.call() == false) {
      throw StateError('Select a connected console first.');
    }
    if (text.trim().isEmpty) return;
    if (target?.taskId != null) {
      if (command) throw StateError('Use the worker composer for steering.');
      if (target?.consoleCapabilities?['steering'] != true) {
        throw StateError('Steering is unavailable for this CLI.');
      }
      await request('worker.submit', {
        'id': id,
        'consoleKey': target?.consoleKey,
        'launchId': target?.launchId,
        'submissionId': workerSubmissionId(id, text),
        'text': text,
      });
      _workerSubmissions.remove('${before.pc}/$id');
      return;
    }
    if (command && !RegExp(r'^/[a-z][a-z0-9 /_-]*$').hasMatch(text)) {
      throw StateError('Choose a supported agent command.');
    }
    final value = !command && before.bracketedPaste
        ? '\x1b[200~$text\x1b[201~'
        : text;
    if (value.length > 65536) throw StateError('This message is too long.');
    await input(value, id: id);
    // The PC accepted the text. Let the CLI process the paste before Enter.
    await Future<void>.delayed(const Duration(milliseconds: 150));
    final now = snapshot();
    if (!now.connected ||
        !now.foreground ||
        canContinue?.call() == false ||
        before.generation != now.generation ||
        before.pc != now.pc ||
        now.session?.provider != target?.provider ||
        now.session?.providerSessionId != target?.providerSessionId ||
        !identical(before.connection, now.connection) ||
        now.selected != id) {
      throw StateError(
        'Message was typed but not submitted. Check the original console.',
      );
    }
    await input('\r', id: id);
  }
}
