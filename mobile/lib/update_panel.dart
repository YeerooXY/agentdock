import 'dart:convert';
import 'dart:io';

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
          return {'version': version, 'url': url, 'size': asset['size']};
        }
      }
    }
  }
  return null;
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
  static const native = MethodChannel('agentdock/updates');
  String version = '', message = '';
  List<String> abis = [];
  Map<String, dynamic>? release;
  bool busy = false;

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
        setState(() => message = 'Could not open your browser. Try again.');
      }
    }
  }

  @override
  void initState() {
    super.initState();
    loadVersion();
  }

  Future<void> loadVersion() async {
    try {
      final info = await native.invokeMapMethod<String, dynamic>('installed');
      if (mounted) {
        setState(() {
          version = info?['version'] as String? ?? '';
          abis = (info?['abis'] as List? ?? []).cast<String>();
        });
      }
    } catch (_) {
      /* Native information is unavailable in widget tests. */
    }
  }

  Future<void> check() async {
    setState(() {
      busy = true;
      message = '';
    });
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
      final next = androidRelease(
        jsonDecode(utf8.decode(bytes)) as List,
        version,
        abis,
      );
      if (mounted) {
        setState(() {
          release = next;
          message = next == null
              ? 'You’re up to date.'
              : 'Version ${next['version']} · ${(next['size'] / 1024 / 1024).ceil()} MB';
        });
      }
    } catch (error) {
      if (mounted) {
        setState(
          () => message = error is FormatException
              ? error.message
              : 'Could not check for updates. Try again.',
        );
      }
    } finally {
      client.close(force: true);
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text(
        'Updates',
        style: TextStyle(fontSize: 18, color: Color(0xff9cbfff)),
      ),
      const Padding(
        padding: EdgeInsets.symmetric(vertical: 10),
        child: Text(
          'Download directly from GitHub. A PC connection is not required.',
        ),
      ),
      if (version.isNotEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Text(version),
        ),
      if (message.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Text(message),
        ),
      OutlinedButton.icon(
        onPressed: busy ? null : check,
        icon: const Icon(Icons.refresh),
        label: Text(busy ? 'Checking…' : 'Check for updates'),
      ),
      if (release != null) ...[
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: () => openDownload(release!['url'] as String),
          icon: const Icon(Icons.download_outlined),
          label: const Text('Download update'),
        ),
        const SizedBox(height: 8),
        const Text(
          'Open the downloaded APK to install. Your pairing stays saved.',
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
}
