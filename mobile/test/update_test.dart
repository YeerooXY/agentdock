import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/update_panel.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/dock_client.dart';
import 'package:flutter/services.dart';

class UnreachablePC extends DockClient {
  @override
  Future<dynamic> request(
    String method, [
    Map<String, dynamic> payload = const {},
  ]) async {
    fail('Updates must not request anything from the PC: $method');
  }
}

void main() {
  for (final paired in [false, true]) {
    testWidgets('updates are reachable with no PC connection, paired=$paired', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(320, 740);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      const native = MethodChannel('agentdock/updates');
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        native,
        (_) async => {
          'version': '0.6.0-preview.9',
          'abis': ['arm64-v8a'],
        },
      );
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          native,
          null,
        ),
      );
      final client = UnreachablePC();
      if (paired) client.pairing = {'name': 'Offline PC'};
      addTearDown(client.dispose);
      await tester.pumpWidget(DockApp(client: client));
      await tester.tap(
        paired ? find.byTooltip('App updates') : find.text('Updates'),
      );
      await tester.pumpAndSettle();
      expect(find.byType(UpdatesPage), findsOneWidget);
      expect(find.text('Check for updates'), findsOneWidget);
      expect(find.text('All downloads'), findsOneWidget);
      expect(find.text('0.6.0-preview.9'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
  test('Android update selection chooses the installed architecture and newer channel', () {
    Map<String, dynamic> release(String v, String arch) => {
      'tag_name': 'v$v',
      'prerelease': v.contains('-'),
      'assets': [
        {
          'name': 'Agent-Dock-$v-Android-$arch.apk',
          'browser_download_url':
              'https://github.com/YeerooXY/agentdock/releases/download/v$v/Agent-Dock-$v-Android-$arch.apk',
          'size': 20000,
        },
      ],
    };
    final values = [
      release('0.6.0-preview.10', 'arm64'),
      release('0.6.0-preview.10', 'armv7'),
    ];
    expect(
      androidRelease(values, '0.6.0-preview.9', ['arm64-v8a'])?['url'],
      endsWith('arm64.apk'),
    );
    expect(
      androidRelease(values, '0.6.0-preview.9', ['armeabi-v7a'])?['url'],
      endsWith('armv7.apk'),
    );
    expect(androidRelease(values, '0.6.0', ['arm64-v8a']), isNull);
    expect(androidRelease(values, '0.6.0-preview.9', ['x86_64']), isNull);
    expect(isNewer('0.6.0', '0.6.0-preview.10'), isTrue);
    final bad = release('0.7.0', 'arm64');
    bad['assets'][0]['browser_download_url'] = 'https://example.com/app.apk';
    expect(androidRelease([bad], '0.6.0', ['arm64-v8a']), isNull);
  });
}
