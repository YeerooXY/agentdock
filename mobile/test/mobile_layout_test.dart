import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/dock_style.dart';
import 'package:agent_dock_mobile/live_agent_controls.dart';

import 'widget_test.dart' show FakeDock;

void main() {
  for (final width in [320.0, 393.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('expanded reply box and aligned actions at $width / $scale', (
        tester,
      ) async {
        tester.view.physicalSize = Size(width, 852);
        tester.view.devicePixelRatio = 1;
        tester.platformDispatcher.textScaleFactorTestValue = scale;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        final c = FakeDock();
        addTearDown(c.dispose);
        c.state['sessions'][0].addAll({
          'model': 'claude-sonnet-5-5',
          'effort': 'high',
        });
        c.state['capabilities'] = ['console.queue'];
        await tester.pumpWidget(DockApp(client: c));
        await tester.pumpAndSettle();
        final field = find.byType(TextField).last;
        expect(tester.widget<TextField>(field).minLines, 3);
        expect(tester.getSize(field).height, greaterThan(72));
        expect(tester.testTextInput.isVisible, isFalse);
        expect(find.byKey(const ValueKey('enter-chat')), findsNothing);
        expect(find.byTooltip('Collapse chat'), findsNothing);
        expect(find.byTooltip('Queue'), findsNothing);
        expect(find.byTooltip('Model and effort'), findsOneWidget);
        final box = tester.getRect(find.byKey(const ValueKey('reply-box')));
        final send = tester.getRect(find.byType(DockSendButton));
        final keys = tester.getRect(find.byTooltip('Terminal keys'));
        expect(send.center.dy, closeTo(keys.center.dy, 1));
        expect(send.right, lessThanOrEqualTo(box.right));
        expect(send.bottom, lessThanOrEqualTo(box.bottom));
        expect(keys.center.dx, lessThan(send.center.dx));
        await tester.enterText(field, 'Draft stays here');
        await tester.pump();
        await tester.tap(find.byTooltip('Terminal keys'));
        await tester.pumpAndSettle();
        await tester.tap(find.byTooltip('Close terminal keys'));
        await tester.pumpAndSettle();
        expect(
          tester.widget<TextField>(field).controller!.text,
          'Draft stays here',
        );
        expect(c.inputs, isEmpty);
        final model = find.text('Sonnet 5.5  High');
        Focus.of(tester.element(model)).requestFocus();
        await tester.pump();
        for (final key in [
          LogicalKeyboardKey.enter,
          LogicalKeyboardKey.space,
        ]) {
          await tester.sendKeyEvent(key);
          await tester.pumpAndSettle();
          expect(find.byType(LiveAgentControls), findsOneWidget);
          await tester.sendKeyEvent(LogicalKeyboardKey.escape);
          await tester.pumpAndSettle();
          expect(
            FocusManager.instance.primaryFocus,
            isNot(isA<FocusScopeNode>()),
          );
          await tester.sendKeyEvent(LogicalKeyboardKey.tab);
          await tester.sendKeyDownEvent(LogicalKeyboardKey.shift);
          await tester.sendKeyEvent(LogicalKeyboardKey.tab);
          await tester.sendKeyUpEvent(LogicalKeyboardKey.shift);
          await tester.pump();
        }
        expect(c.inputs, isEmpty);
        expect(tester.takeException(), isNull);
      });
    }
  }
  testWidgets('long drafts grow within the existing limit', (tester) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await tester.pumpAndSettle();
    final field = find.byType(TextField).last,
        initial = tester.getSize(find.byType(TextField).last).height;
    await tester.enterText(field, List.filled(40, 'a long draft').join('\n'));
    await tester.pumpAndSettle();
    expect(tester.getSize(field).height, greaterThan(initial));
    expect(
      tester.getSize(field).height,
      lessThanOrEqualTo(16 * 1.4 * 8.5 + 24),
    );
  });
}
