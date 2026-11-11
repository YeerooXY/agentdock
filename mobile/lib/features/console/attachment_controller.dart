import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../../dock_client.dart';
import 'composer_controller.dart';

/// Image attachments for the composer: the photo picker and latest phone image.
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

  /// The newest image accessible through Android photo permissions.
  Map? latestImage;
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

  /// Refreshes the thumbnail without requesting permission or uploading.
  Future<bool> checkLatestImage(RunAction run) async {
    if (_disposed ||
        !onConsolePage() ||
        client.selected.isEmpty ||
        !supported) {
      return false;
    }
    try {
      final found = await media.invokeMethod<Map>('latest');
      if (_disposed) return false;
      latestImage = found?['permission'] == true && found?['id'] != null
          ? found
          : null;
      _changed();
      return latestImage != null;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  Future<void> attachLatestImage(RunAction run) => attachImage(run, () async {
    // Resolve again on tap: another app may have saved a newer image.
    if (await media.invokeMethod<bool>('allowRecent') != true) {
      return media.invokeMethod<Uint8List>('pick');
    }
    final found = await media.invokeMethod<Map>('latest');
    final id = found?['id'] as int?;
    if (id == null) return media.invokeMethod<Uint8List>('pick');
    if (!_disposed) {
      latestImage = found;
      _changed();
    }
    return media.invokeMethod<Uint8List>('recentImage', {'id': id});
  });

  Future<void> pickImage(RunAction run) =>
      attachImage(run, () => media.invokeMethod<Uint8List>('pick'));

  Future<void> attachImage(
    RunAction run,
    Future<Uint8List?> Function() source,
  ) async {
    if (attaching || composer.sending || composer.dictating) return;
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
