import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';

import 'widget_test.dart' show FakeDock, enterChat;

class AttachDock extends FakeDock {
  final attached = <Uint8List>[];
  @override
  Future<String> attachImage(Uint8List bytes) async {
    attached.add(bytes);
    return r'C:\shots\one.png';
  }

  @override
  void setForeground(bool value) => foreground = value;
}

void returnToApp(WidgetTester tester) {
  for (final state in [
    AppLifecycleState.inactive,
    AppLifecycleState.hidden,
    AppLifecycleState.paused,
    AppLifecycleState.hidden,
    AppLifecycleState.inactive,
    AppLifecycleState.resumed,
  ]) {
    tester.binding.handleAppLifecycleStateChanged(state);
  }
}

void main() {
  const channel = MethodChannel('agentdock/media');
  final calls = <MethodCall>[];
  Map<String, Object?>? recent;
  bool allowed = true;
  setUp(() {
    calls.clear();
    allowed = true;
    recent = {
      'permission': true,
      'id': 42,
      'at': DateTime(2026, 10, 28, 8, 28).millisecondsSinceEpoch,
    };
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          calls.add(call);
          if (call.method == 'latest') return recent;
          if (call.method == 'allowRecent') return allowed;
          if (call.method == 'pick') return Uint8List.fromList([4, 5, 6]);
          if (call.method == 'recentImage') {
            return Uint8List.fromList([1, 2, 3]);
          }
          return null;
        });
  });
  tearDown(
    () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null),
  );

  Future<AttachDock> open(WidgetTester tester) async {
    final c = AttachDock();
    addTearDown(c.dispose);
    c.state['capabilities'] = ['console.attachments'];
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    returnToApp(tester);
    await tester.pumpAndSettle();
    return c;
  }

  testWidgets(
    'latest phone image attaches without sending or dismissing the shortcut',
    (tester) async {
      final c = await open(tester);
      final chip = find.byKey(const ValueKey('latest-image'));
      expect(chip, findsOneWidget);
      // Re-resolve on tap, even if the thumbnail was loaded earlier.
      recent = {'permission': true, 'id': 43};
      await tester.tap(chip);
      await tester.pumpAndSettle();
      expect(calls.where((x) => x.method == 'recentImage').single.arguments, {
        'id': 43,
      });
      expect(c.attached.single, [1, 2, 3]);
      expect(
        find.textContaining(
          r'Inspect the attached image file: C:\shots\one.png',
        ),
        findsOneWidget,
      );
      expect(chip, findsOneWidget);
      expect(c.inputs, isEmpty);
      // The shortcut stays available for another message.
      returnToApp(tester);
      await tester.pumpAndSettle();
      expect(chip, findsOneWidget);
    },
  );

  testWidgets('photo access is requested only after tapping the shortcut', (
    tester,
  ) async {
    recent = {'permission': false};
    await open(tester);
    expect(calls.where((x) => x.method == 'allowRecent'), isEmpty);
    expect(find.byKey(const ValueKey('latest-image')), findsOneWidget);
    recent = {'permission': true, 'id': 73};
    await tester.tap(find.byKey(const ValueKey('latest-image')));
    await tester.pumpAndSettle();
    expect(calls.where((x) => x.method == 'allowRecent'), hasLength(1));
    expect(calls.where((x) => x.method == 'recentImage').single.arguments, {
      'id': 73,
    });
  });

  testWidgets(
    'denied photo access uses the picker without uploading automatically',
    (tester) async {
      allowed = false;
      recent = {'permission': false};
      final c = await open(tester);
      expect(c.attached, isEmpty);
      await tester.tap(find.byKey(const ValueKey('latest-image')));
      await tester.pumpAndSettle();
      expect(calls.where((x) => x.method == 'pick'), hasLength(1));
      expect(calls.where((x) => x.method == 'recentImage'), isEmpty);
      expect(c.attached.single, [4, 5, 6]);
      expect(c.inputs, isEmpty);
    },
  );
}
