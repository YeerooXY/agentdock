import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/update_panel.dart';

void main() {
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
