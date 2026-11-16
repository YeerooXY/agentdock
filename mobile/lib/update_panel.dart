import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

List<int>? versionParts(String value) {
  final m = RegExp(r'^v?(\d+)\.(\d+)\.(\d+)(?:-preview\.(\d+))?$')
      .firstMatch(value);
  if (m == null) return null;
  return [
    int.parse(m[1]!),
    int.parse(m[2]!),
    int.parse(m[3]!),
    m[4] == null ? 1 : 0,
    int.parse(m[4] ?? '0'),
  ];
}

bool isNewer(String a, String b) {
  final x = versionParts(a), y = versionParts(b);
  if (x == null || y == null) return false;
  for (var i = 0; i < x.length; i++) {
    if (x[i] != y[i]) return x[i] > y[i];
  }
  return false;
}

Map<String, dynamic>? androidRelease(
  List<dynamic> releases,
  String current,
  List<String> abis,
) {
  final arch = abis.contains('arm64-v8a')
      ? 'arm64'
      : abis.contains('armeabi-v7a')
      ? 'armv7'
      : null;
  if (arch == null) return null;
  final candidates = releases
      .whereType<Map<String, dynamic>>()
      .where(
        (r) =>
            r['draft'] != true &&
            (current.contains('-') || r['prerelease'] != true) &&
            isNewer('${r['tag_name']}', current),
      )
      .toList();
  candidates.sort((a, b) => isNewer(a['tag_name'], b['tag_name']) ? -1 : 1);
  for (final r in candidates) {
    final tag = r['tag_name'] as String,
        version = tag.replaceFirst(RegExp('^v'), '');
    // Releases before the rename were named Agent-Dock-*.
    for (final prefix in const ['Paddock', 'Agent-Dock']) {
      final name = '$prefix-$version-Android-$arch.apk';
      final url =
          'https://github.com/YeerooXY/agentdock/releases/download/$tag/$name';
      for (final asset in r['assets'] as List? ?? []) {
        if (asset['name'] == name &&
            asset['browser_download_url'] == url &&
            asset['size'] is int &&
            asset['size'] > 0 &&
            asset['size'] < 200 * 1024 * 1024) {
          // The checksum file lets the app verify the download before installing.
          final sumsUrl =
              'https://github.com/YeerooXY/agentdock/releases/download/$tag/SHA256SUMS.txt';
          final sums = (r['assets'] as List? ?? []).any(
            (a) =>
                a['name'] == 'SHA256SUMS.txt' &&
                a['browser_download_url'] == sumsUrl,
          );
          return {
            'version': version,
            'url': url,
            'name': name,
            'size': asset['size'],
            if (sums) 'sums': sumsUrl,
          };
        }
      }
    }
  }
  return null;
}

/// Shared phone-update state. The app checks GitHub quietly on start and when
/// it returns after [interval]; the Settings tab shows a badge while a newer
/// release is available. Nothing downloads without a tap.
class AppUpdates extends ChangeNotifier {
  AppUpdates._();
  static final instance = AppUpdates._();
  static const native = MethodChannel('agentdock/updates');
  static const interval = Duration(hours: 6);

  String version = '', message = '';
  List<String> abis = [];
  Map<String, dynamic>? release;
  bool busy = false;
  DateTime? checkedAt;

  /// Download progress from 0 to 1 while an update downloads, otherwise null.
  double? progress;

  bool get available => release != null;

  @visibleForTesting
  void reset() {
    version = message = '';
    abis = [];
    release = null;
    busy = false;
    checkedAt = null;
  }

  Future<void> loadVersion() async {
    try {
      final info = await native.invokeMapMethod<String, dynamic>('installed');
      version = info?['version'] as String? ?? '';
      abis = (info?['abis'] as List? ?? []).cast<String>();
      notifyListeners();
    } catch (_) {
      /* Native information is unavailable in widget tests. */
    }
  }

  /// Background check: at most once per [interval], silent on failure.
  Future<void> checkQuietly() async {
    final last = checkedAt;
    if (busy || (last != null && DateTime.now().difference(last) < interval)) {
      return;
    }
    if (version.isEmpty) await loadVersion();
    if (versionParts(version) == null) return;
    await check(quiet: true);
  }

  Future<void> check({bool quiet = false}) async {
    if (busy) return;
    busy = true;
    if (!quiet) message = '';
    notifyListeners();
    final client = HttpClient()
      ..connectionTimeout = const Duration(seconds: 15);
    try {
      if (version.isEmpty) await loadVersion();
      if (versionParts(version) == null) {
        throw const FormatException('Installed version could not be read.');
      }
      if (!abis.any((x) => x == 'arm64-v8a' || x == 'armeabi-v7a')) {
        throw const FormatException(
          'This preview has downloads for ARM Android phones.',
        );
      }
      final request = await client.getUrl(
        Uri.parse(
          'https://api.github.com/repos/YeerooXY/agentdock/releases?per_page=30',
        ),
      );
      request.followRedirects = false;
      request.headers.set('User-Agent', 'Paddock-Android');
      request.headers.set('Accept', 'application/vnd.github+json');
      final response = await request.close().timeout(
        const Duration(seconds: 20),
      );
      if (response.statusCode != 200) {
        throw const FormatException('Could not check GitHub. Try again later.');
      }
      final bytes = <int>[];
      await for (final chunk in response.timeout(const Duration(seconds: 20))) {
        bytes.addAll(chunk);
        if (bytes.length > 2 * 1024 * 1024) {
          throw const FormatException('Release list is too large.');
        }
      }
      release = androidRelease(
        jsonDecode(utf8.decode(bytes)) as List,
        version,
        abis,
      );
      checkedAt = DateTime.now();
      message = release == null
          ? 'You’re up to date.'
          : 'Version ${release!['version']} (${(release!['size'] / 1024 / 1024).ceil()} MB)';
    } catch (error) {
      if (!quiet) {
        message = error is FormatException
            ? error.message
            : 'Could not check for updates. Try again.';
      }
    } finally {
      client.close(force: true);
      busy = false;
      notifyListeners();
    }
  }

  /// Downloads the release APK into the app's cache, checks its size and
  /// SHA-256 against the release checksum file, then opens Android's installer,
  /// which asks the person to confirm.
  Future<void> install() async {
    final next = release;
    if (next == null || busy) return;
    busy = true;
    message = '';
    progress = 0;
    notifyListeners();
    final client = HttpClient()
      ..connectionTimeout = const Duration(seconds: 15);
    File? file;
    try {
      if (await AppUpdates.native.invokeMethod<bool>('canInstall') != true) {
        await AppUpdates.native.invokeMethod<void>('allowInstalls');
        throw const FormatException(
          'Allow Paddock to install apps, then tap Install update again.',
        );
      }
      final sumsUrl = next['sums'] as String?;
      if (sumsUrl == null) {
        throw const FormatException(
          'This release has no checksum file. Use All downloads instead.',
        );
      }
      final name = next['name'] as String, size = next['size'] as int;
      final sums = utf8.decode(await _get(client, sumsUrl, 64 * 1024));
      final expected = sums
          .split(RegExp(r'\r?\n'))
          .map((line) => line.trim().split(RegExp(r'\s+\*?')))
          .where((parts) => parts.length == 2 && parts[1] == name)
          .map((parts) => parts[0].toLowerCase())
          .firstOrNull;
      if (expected == null || !RegExp(r'^[0-9a-f]{64}$').hasMatch(expected)) {
        throw const FormatException('The release checksum is missing.');
      }
      final folder = Directory(
        (await AppUpdates.native.invokeMethod<String>('updateDir'))!,
      );
      // Keep only the update being downloaded.
      for (final old in folder.listSync().whereType<File>()) {
        old.deleteSync();
      }
      file = File('${folder.path}/$name');
      final sink = file.openWrite();
      var shown = 0;
      try {
        await _get(
          client,
          next['url'] as String,
          _apkLimit,
          sink: sink,
          onChunk: (received) {
            final step = (received * 100 / size).floor();
            if (step != shown) {
              shown = step;
              progress = (received / size).clamp(0, 1).toDouble();
              notifyListeners();
            }
          },
        );
      } finally {
        await sink.close();
      }
      if (await file.length() != size) {
        throw const FormatException('The download was incomplete. Try again.');
      }
      final digest = await sha256.bind(file.openRead()).first;
      if (digest.toString() != expected) {
        throw const FormatException(
          'The download did not match the release. Try again.',
        );
      }
      await AppUpdates.native.invokeMethod<bool>('install', {
        'path': file.path,
      });
      message = 'Android asks you to confirm the update.';
    } catch (error) {
      if (file != null && file.existsSync() && message.isEmpty) {
        try {
          file.deleteSync();
        } catch (_) {}
      }
      message = error is FormatException
          ? error.message
          : error is PlatformException
          ? (error.message ?? 'Android could not open the installer.')
          : 'Could not download the update. Try again.';
    } finally {
      client.close(force: true);
      busy = false;
      progress = null;
      notifyListeners();
    }
  }
}

const _apkLimit = 200 * 1024 * 1024;

/// GETs [url] into memory, or into [sink] when given, refusing more than [limit] bytes.
Future<List<int>> _get(
  HttpClient client,
  String url,
  int limit, {
  IOSink? sink,
  void Function(int received)? onChunk,
}) async {
    final request = await client.getUrl(Uri.parse(url));
    // GitHub answers release downloads with a redirect to its file host.
    request.followRedirects = true;
    request.maxRedirects = 5;
    request.headers.set('User-Agent', 'Paddock-Android');
    final response = await request.close().timeout(const Duration(seconds: 30));
    if (response.statusCode != 200) {
      throw const FormatException('The download failed. Try again.');
    }
    final bytes = <int>[];
    var received = 0;
    await for (final chunk in response.timeout(const Duration(seconds: 60))) {
      received += chunk.length;
      if (received > limit) {
        throw const FormatException('The download is larger than expected.');
      }
      if (sink != null) {
        sink.add(chunk);
      } else {
        bytes.addAll(chunk);
      }
      onChunk?.call(received);
    }
    return bytes;
}


class UpdatePanel extends StatefulWidget {
  const UpdatePanel({super.key});
  @override
  State<UpdatePanel> createState() => _UpdatePanelState();
}

class UpdatesPage extends StatelessWidget {
  const UpdatesPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('App updates')),
    body: const SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.all(24),
        child: UpdatePanel(),
      ),
    ),
  );
}

void openUpdates(BuildContext context) =>
    Navigator.of(context)
        .push(MaterialPageRoute<void>(builder: (_) => const UpdatesPage()));

class _UpdatePanelState extends State<UpdatePanel> {
  final updates = AppUpdates.instance;
  String error = '';
  final checkFocus = FocusNode(), downloadFocus = FocusNode();

  Future<void> openDownload(String url) async {
    try {
      if (!await launchUrl(
        Uri.parse(url),
        mode: LaunchMode.externalApplication,
      )) {
        throw StateError('No browser');
      }
    } catch (_) {
      if (mounted) {
        setState(() => error = 'Could not open your browser. Try again.');
      }
    }
  }

  @override
  void initState() {
    super.initState();
    if (updates.version.isEmpty) updates.loadVersion();
  }

  @override
  void dispose() {
    checkFocus.dispose();
    downloadFocus.dispose();
    super.dispose();
  }

  Future<void> check() async {
    // A disabled or replaced button drops focus; hand it to the new action.
    final focused = checkFocus.hasFocus;
    setState(() => error = '');
    await updates.check();
    if (mounted && focused) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        (updates.available ? downloadFocus : checkFocus).requestFocus();
      });
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: updates,
    builder: (context, _) {
      final release = updates.release;
      final message = error.isNotEmpty ? error : updates.message;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Updates',
            style: TextStyle(fontSize: 18, color: Color(0xff9cbfff)),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Text(
              'Updates come from GitHub. A PC connection is not required.',
            ),
          ),
          if (updates.version.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Text(updates.version),
            ),
          if (message.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(message),
            ),
          // One action slot: Download update takes the place of Check for updates.
          AnimatedSwitcher(
            duration: MediaQuery.disableAnimationsOf(context)
                ? Duration.zero
                : const Duration(milliseconds: 220),
            transitionBuilder: (child, animation) => FadeTransition(
              opacity: animation,
              child: SizeTransition(sizeFactor: animation, child: child),
            ),
            layoutBuilder: (currentChild, previousChildren) => Stack(
              alignment: Alignment.centerLeft,
              children: [...previousChildren, ?currentChild],
            ),
            child: release == null
                ? OutlinedButton.icon(
                    key: const ValueKey('check-update'),
                    focusNode: checkFocus,
                    onPressed: updates.busy ? null : check,
                    icon: const Icon(Icons.refresh),
                    label: Text(
                      updates.busy ? 'Checking…' : 'Check for updates',
                    ),
                  )
                : FilledButton.icon(
                    key: const ValueKey('download-update'),
                    focusNode: downloadFocus,
                    onPressed: updates.busy ? null : updates.install,
                    icon: const Icon(Icons.system_update_alt),
                    label: Text(
                      updates.progress == null
                          ? 'Install update'
                          : 'Downloading ${(updates.progress! * 100).round()}%',
                    ),
                  ),
          ),
          if (updates.progress case final p?) ...[
            const SizedBox(height: 10),
            LinearProgressIndicator(
              value: p,
              semanticsLabel: 'Update download',
              semanticsValue: '${(p * 100).round()}%',
            ),
          ],
          if (release != null) ...[
            const SizedBox(height: 8),
            const Text(
              'Paddock downloads and checks the update, then Android asks you to confirm. Your pairing stays saved.',
              style: TextStyle(fontSize: 12, height: 1.5),
            ),
          ],
          const SizedBox(height: 10),
          TextButton.icon(
            onPressed: () =>
                openDownload('https://github.com/YeerooXY/agentdock/releases'),
            icon: const Icon(Icons.open_in_new),
            label: const Text('All downloads'),
          ),
        ],
      );
    },
  );
}
