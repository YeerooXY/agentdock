import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../../dock_client.dart';
import 'composer_controller.dart';

/// Image attachments for the composer: the photo picker and the offer to
/// attach a recent screenshot.
///
/// An image is uploaded only to the PC and console that were selected when
/// it was chosen. The picker can background the app and reconnect; a changed
/// console must choose the image again.
class AttachmentController extends ChangeNotifier {
  AttachmentController(
    this.client,
    this.composer, {
    required this.onConsolePage,
  });

  static const media = MethodChannel('agentdock/media');

  final DockClient client;
  final ComposerController composer;

  /// Whether the console page is showing in a mounted home screen.
  final bool Function() onConsolePage;

  /// The newest screenshot (taken in the last five minutes) offered as a chip.
  Map? recentShot;
  final dismissedShots = <int>{};
  bool attaching = false;
  bool _disposed = false;

  void _changed() {
    if (!_disposed) notifyListeners();
  }

  bool get supported => client.supports('console.attachments');

  /// Calls [onCaptured] when Android reports a new screenshot while a console
  /// is showing.
  void watchScreenshots(VoidCallback onCaptured) {
    media.setMethodCallHandler((call) async {
      if (call.method == 'screenshot' &&
          !_disposed &&
          onConsolePage() &&
          client.selected.isNotEmpty) {
        onCaptured();
      }
    });
  }

  /// Offers the newest screenshot. With [ask], requests photo access first
  /// and attaches the screenshot directly, or opens the picker if denied.
  Future<bool> checkRecentShot(RunAction run, {bool ask = false}) async {
    if (!onConsolePage() || client.selected.isEmpty || !supported) {
      return false;
    }
    try {
      if (ask && await media.invokeMethod<bool>('allowRecent') != true) {
        await pickImage(run);
        return true;
      }
      final found = await media.invokeMethod<Map>('recent', {'seconds': 300});
      if (_disposed || found == null) return false;
      if (found['permission'] != true) {
        if (ask) await pickImage(run);
        return ask;
      }
      final id = found['id'] as int?;
      final shot = id == null || dismissedShots.contains(id) ? null : found;
      recentShot = shot;
      _changed();
      if (ask && shot != null) await attachRecentShot(run);
      return shot != null;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  Future<void> attachRecentShot(RunAction run) async {
    final id = recentShot?['id'] as int?;
    if (id == null) return;
    await attachImage(
      run,
      () => media.invokeMethod<Uint8List>('recentImage', {'id': id}),
    );
    if (!_disposed && !attaching) dismiss(id);
  }

  void dismiss(int id) {
    dismissedShots.add(id);
    recentShot = null;
    _changed();
  }

  Future<void> pickImage(RunAction run) =>
      attachImage(run, () => media.invokeMethod<Uint8List>('pick'));

  Future<void> attachImage(
    RunAction run,
    Future<Uint8List?> Function() source,
  ) async {
    if (attaching || composer.sending) return;
    if (!supported) {
      await run(() async {
        throw StateError('Update Paddock on the PC to attach images.');
      });
      return;
    }
    final key = composer.draftKey, pc = client.activePC, id = client.selected;
    bool changed() =>
        _disposed ||
        composer.draftKey != key ||
        client.activePC != pc ||
        client.selected != id;
    attaching = true;
    _changed();
    await run(() async {
      final bytes = await source();
      // The Android picker backgrounds the activity. It can reconnect, but a
      // changed PC/console must never receive the selected image.
      if (bytes == null) return;
      if (changed()) {
        throw StateError('Console changed. Choose the image again.');
      }
      for (
        var i = 0;
        i < 40 && (!client.foreground || !client.connected);
        i++
      ) {
        await Future<void>.delayed(const Duration(milliseconds: 250));
      }
      if (changed()) {
        throw StateError('Console changed. Choose the image again.');
      }
      final file = await client.attachImage(bytes);
      if (_disposed || composer.draftKey != key) return;
      composer.appendAttachment(file);
    });
    if (!_disposed) {
      attaching = false;
      _changed();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
