import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../console_drafts.dart';
import '../../dock_client.dart';
import 'command_target.dart';

/// Runs an action and reports its failure to the user.
typedef RunAction = Future<void> Function(Future<dynamic> Function() action);

/// The console composer: per-console drafts, sending and staged
/// command targets.
///
/// Each console launch key has its own draft, caret and scroll position. A
/// console change restores that console's draft and drops any staged target,
/// so text prepared for one console is never sent to another.
class ComposerController extends ChangeNotifier {
  ComposerController(this.client, {required this.releaseTerminal}) {
    editor.addListener(_draftChanged);
    scroll.addListener(_scrolled);
    client.addListener(syncDraft);
    syncDraft();
  }

  final DockClient client;

  /// Stops direct terminal typing when the console changes.
  final VoidCallback releaseTerminal;

  final editor = TextEditingController();
  final focus = FocusNode();
  final scroll = ScrollController();

  /// Draft key of the selected console, or null with no console.
  String? draftKey;
  bool sending = false;
  bool dictating = false;

  /// Uses the phone's speech screen and inserts editable text at the caret.
  Future<void> dictate(RunAction run) async {
    if (sending || dictating || draftKey == null) return;
    final key = draftKey, draft = editor.value;
    dictating = true;
    _changed();
    await run(() async {
      String? text;
      try {
        text = await const MethodChannel('agentdock/dictation')
            .invokeMethod<String>('start');
      } on MissingPluginException {
        throw StateError('Voice typing is unavailable on this phone.');
      }
      if (_disposed || text == null || text.trim().isEmpty) return;
      if (draftKey != key || editor.value != draft) {
        throw StateError('Draft changed. Dictate the message again.');
      }
      final start = draft.selection.isValid
          ? draft.selection.start
          : draft.text.length;
      final end = draft.selection.isValid
          ? draft.selection.end
          : draft.text.length;
      editor.value = TextEditingValue(
        text: draft.text.replaceRange(start, end, text),
        selection: TextSelection.collapsed(offset: start + text.length),
      );
      edited();
      focus.requestFocus();
    });
    if (!_disposed) {
      dictating = false;
      _changed();
      if (draftKey == key) focus.requestFocus();
    }
  }

  /// Set when a file path was inserted for a specific console. Sending to any
  /// other console, PC or connection is refused.
  CommandTarget? stagedCommandTarget;

  bool _restoring = false;
  bool _disposed = false;

  bool get disposed => _disposed;

  void _changed() {
    if (!_disposed) notifyListeners();
  }

  void _scrolled() {
    final key = draftKey;
    if (!_restoring && key != null && scroll.hasClients) {
      client.drafts.remember(key, 'composer', scroll.offset);
    }
  }

  void _draftChanged() {
    if (_restoring) return;
    final key = draftKey;
    if (key != null) {
      client.drafts.set(key, editor.text);
      client.drafts.remember(key, 'selection', editor.selection.extentOffset);
    }
    _changed();
  }

  /// Restores the selected console's draft when the selection changes.
  void syncDraft() {
    final session = client.selectedSession;
    final key = session == null
        ? null
        : ConsoleDrafts.key(client.activePC, session.consoleKey ?? session.id);
    if (key == draftKey) return;
    draftKey = key;
    _restoring = true;
    final value = key == null ? '' : client.drafts.get(key);
    final savedOffset = key == null
        ? 0.0
        : client.drafts.position(key, 'composer')?.toDouble();
    editor.value = TextEditingValue(
      text: value,
      selection: TextSelection.collapsed(
        offset:
            (key == null
                    ? value.length
                    : client.drafts.position(key, 'selection')?.toInt() ??
                          value.length)
                .clamp(0, value.length),
      ),
    );
    focus.unfocus();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_disposed && draftKey == key && scroll.hasClients) {
        scroll.jumpTo(
          (savedOffset ?? scroll.position.maxScrollExtent).clamp(
            0.0,
            scroll.position.maxScrollExtent,
          ),
        );
      }
      if (draftKey == key) _restoring = false;
    });
    stagedCommandTarget = null;
    releaseTerminal();
  }

  /// Typing by hand invalidates a staged target.
  void edited() => stagedCommandTarget = null;

  /// Sends the draft to the selected console. [onConsolePage] is checked with
  /// a staged target, which must still be current.
  Future<void> send(
    RunAction run, {
    required bool Function() onConsolePage,
  }) async {
    if (sending || dictating || editor.text.trim().isEmpty) return;
    final staged = stagedCommandTarget;
    if (staged != null && !(onConsolePage() && staged.isCurrent(client))) {
      await run(() async {
        throw StateError('Console changed. Choose the command again.');
      });
      return;
    }
    final text = editor.text;
    final sentKey = draftKey;
    sending = true;
    _changed();
    await run(() async {
      await client.submit(text);
      if (sentKey != null) client.drafts.recordSent(sentKey, text);
      if (sentKey != null && client.drafts.get(sentKey) == text) {
        client.drafts.set(sentKey, '');
      }
      if (!_disposed && draftKey == sentKey && editor.text == text) {
        editor.clear();
        stagedCommandTarget = null;
      }
    });
    if (!_disposed) {
      sending = false;
      _changed();
    }
  }

  /// Inserts a relative path as draft text at [draft]'s selection. No command
  /// or file content is sent. Returns false if the draft changed meanwhile.
  bool insertPath(
    String path, {
    required TextEditingValue draft,
    required CommandTarget target,
  }) {
    if (_disposed || editor.value != draft) return false;
    final start = draft.selection.isValid
        ? draft.selection.start
        : draft.text.length;
    final end = draft.selection.isValid
        ? draft.selection.end
        : draft.text.length;
    final value = path.contains(RegExp(r'\s')) ? '"$path"' : path;
    final inserted =
        '${start > 0 && !RegExp(r'[\s@/]$').hasMatch(draft.text.substring(0, start)) ? ' ' : ''}$value ';
    editor.value = TextEditingValue(
      text: draft.text.replaceRange(start, end, inserted),
      selection: TextSelection.collapsed(offset: start + inserted.length),
    );
    stagedCommandTarget = target;
    return true;
  }

  /// Adds an uploaded image's PC path to the draft.
  void appendAttachment(String file) {
    if (_disposed) return;
    final suffix =
        '\nInspect the attached image file: ${file.replaceAll('\n', '')}\n';
    editor.value = TextEditingValue(
      text: editor.text + suffix,
      selection: TextSelection.collapsed(
        offset: editor.text.length + suffix.length,
      ),
    );
  }

  /// Replaces the draft with a saved prompt, if [key]'s console is still open.
  void usePrompt(String? key, String text, int cursorOffset) {
    if (_disposed || draftKey != key) return;
    editor.value = TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: cursorOffset),
    );
    stagedCommandTarget = null;
  }

  /// Picks up draft edits made on another page, such as Code.
  void reloadDraft() {
    final key = draftKey;
    if (_disposed || key == null) return;
    final value = client.drafts.get(key);
    if (editor.text == value) return;
    _restoring = true;
    editor.value = TextEditingValue(
      text: value,
      selection: TextSelection.collapsed(offset: value.length),
    );
    _restoring = false;
    _changed();
  }

  @override
  void dispose() {
    _disposed = true;
    client.removeListener(syncDraft);
    unawaited(client.drafts.flush());
    editor.dispose();
    scroll.dispose();
    focus.dispose();
    super.dispose();
  }
}
