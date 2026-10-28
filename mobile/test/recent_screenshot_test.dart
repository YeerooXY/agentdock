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
    AppLifecycleState.inactive, AppLifecycleState.hidden, AppLifecycleState.paused,
    AppLifecycleState.hidden, AppLifecycleState.inactive, AppLifecycleState.resumed,
  ]) {
    tester.binding.handleAppLifecycleStateChanged(state);
  }
}

void main() {
  const channel = MethodChannel('agentdock/media');
  final calls = <MethodCall>[];
  Map<String, Object?>? recent;
  setUp(() {
    calls.clear();
    recent = {'permission': true, 'id': 42, 'at': DateTime(2026, 10, 28, 8, 28).millisecondsSinceEpoch};
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      if (call.method == 'recent') return recent;
      if (call.method == 'recentImage') return Uint8List.fromList([1, 2, 3]);
      return null;
    });
  });
  tearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(channel, null));

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

  testWidgets('a recent screenshot is offered on return and attaches in one tap', (tester) async {
    final c = await open(tester);
    final chip = find.byKey(const ValueKey('recent-screenshot'));
    expect(chip, findsOneWidget);
    await tester.tap(chip);
    await tester.pumpAndSettle();
    expect(calls.where((x) => x.method == 'recentImage').single.arguments, {'id': 42});
    expect(c.attached.single, [1, 2, 3]);
    expect(find.textContaining(r'Inspect the attached image file: C:\shots\one.png'), findsOneWidget);
    expect(chip, findsNothing);
    // The same screenshot is not offered again.
    returnToApp(tester);
    await tester.pumpAndSettle();
    expect(chip, findsNothing);
  });

  testWidgets('dismissing hides the chip; no permission shows nothing', (tester) async {
    await open(tester);
    await tester.tap(find.byTooltip('Dismiss'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('recent-screenshot')), findsNothing);
    recent = {'permission': false};
    returnToApp(tester);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('recent-screenshot')), findsNothing);
    expect(calls.where((x) => x.method == 'allowRecent'), isEmpty);
  });
}
