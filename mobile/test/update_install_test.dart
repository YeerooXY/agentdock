import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/update_panel.dart';

/// flutter_test answers every HttpClient request with 400; these tests talk
/// to a real server on 127.0.0.1.
class _RealHttp extends HttpOverrides {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const native = MethodChannel('agentdock/updates');
  const name = 'Paddock-0.6.0-preview.99-Android-arm64.apk';
  final apk = List<int>.generate(50000, (i) => i % 251);
  late HttpServer server;
  late Directory folder;
  late String sums;
  late bool canInstall;
  late List<MethodCall> calls;
  final updates = AppUpdates.instance;

  setUp(() async {
    updates.reset();
    folder = await Directory.systemTemp.createTemp('paddock-update-test');
    sums = '${sha256.convert(apk)}  $name\n';
    canInstall = true;
    calls = [];
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      if (request.uri.path.endsWith('SHA256SUMS.txt')) {
        request.response.write(sums);
      } else {
        request.response.add(apk);
      }
      await request.response.close();
    });
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(native, (call) async {
          calls.add(call);
          return switch (call.method) {
            'canInstall' => canInstall,
            'updateDir' => folder.path,
            'install' => true,
            _ => null,
          };
        });
    final base = 'http://127.0.0.1:${server.port}';
    updates.release = {
      'version': '0.6.0-preview.99',
      'url': '$base/$name',
      'name': name,
      'size': apk.length,
      'sums': '$base/SHA256SUMS.txt',
    };
  });

  tearDown(() async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(native, null);
    await server.close(force: true);
    await folder.delete(recursive: true);
    updates.reset();
  });

  test('a verified download opens the installer for that file only', () async {
    final progress = <double>[];
    void listen() {
      if (updates.progress case final p?) progress.add(p);
    }

    updates.addListener(listen);
    await HttpOverrides.runWithHttpOverrides(updates.install, _RealHttp());
    updates.removeListener(listen);
    final install = calls.singleWhere((call) => call.method == 'install');
    final path = (install.arguments as Map)['path'] as String;
    expect(path, endsWith(name));
    expect(File(path).readAsBytesSync(), apk);
    expect(progress.last, 1);
    expect(updates.progress, isNull);
    expect(updates.busy, isFalse);
    expect(updates.message, 'Android asks you to confirm the update.');
  });

  test('a download that does not match the checksum is deleted, not installed', () async {
    sums = '${'0' * 64}  $name\n';
    await HttpOverrides.runWithHttpOverrides(updates.install, _RealHttp());
    expect(calls.where((call) => call.method == 'install'), isEmpty);
    expect(updates.message, contains('did not match'));
    expect(folder.listSync(), isEmpty);
  });

  test('without install permission the app opens the setting and downloads nothing', () async {
    canInstall = false;
    await HttpOverrides.runWithHttpOverrides(updates.install, _RealHttp());
    expect(calls.map((call) => call.method), ['canInstall', 'allowInstalls']);
    expect(updates.message, contains('Allow Paddock to install apps'));
    expect(folder.listSync(), isEmpty);
  });

  test('a release without a checksum file is not installed in the app', () async {
    updates.release!.remove('sums');
    await HttpOverrides.runWithHttpOverrides(updates.install, _RealHttp());
    expect(calls.where((call) => call.method == 'install'), isEmpty);
    expect(updates.message, contains('no checksum file'));
  });
}
