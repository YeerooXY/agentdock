import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/dock_style.dart';
import 'package:agent_dock_mobile/live_agent_controls.dart';

import 'widget_test.dart' show FakeDock, composerAction;

void main() {
  for (final width in [320.0, 393.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('messenger pill and aligned actions at $width / $scale', (
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
        expect(tester.widget<TextField>(field).minLines, 1);
        // One field: + at the bottom left, text in the middle, microphone at the
        // right until something is typed, then Send in its place.
        expect(tester.getSize(field).width, greaterThan(width / 2));
        expect(tester.getSize(field).height, lessThan(90));
        expect(tester.testTextInput.isVisible, isFalse);
        expect(find.byKey(const ValueKey('enter-chat')), findsNothing);
        expect(find.byTooltip('Collapse chat'), findsNothing);
        expect(find.byTooltip('Queue'), findsNothing);
        expect(find.byType(DockSendButton), findsNothing);
        final box = tester.getRect(find.byKey(const ValueKey('reply-box')));
        final more = tester.getRect(find.byTooltip('More actions'));
        final mic = tester.getRect(find.byTooltip('Dictate'));
        for (final control in [more, mic]) {
          expect(box.contains(control.center), isTrue);
        }
        expect(more.center.dy, closeTo(mic.center.dy, 1));
        expect(more.center.dx, lessThan(mic.center.dx));
        await tester.enterText(field, 'Draft stays here');
        await tester.pumpAndSettle();
        expect(find.byTooltip('Dictate'), findsNothing);
        final send = tester.getRect(find.byType(DockSendButton));
        expect(box.contains(send.center), isTrue);
        expect(send.center.dy, closeTo(more.center.dy, 1));
        await composerAction(tester, 'Terminal keys');
        await tester.tap(find.byTooltip('Close terminal keys'));
        await tester.pumpAndSettle();
        expect(
          tester.widget<TextField>(field).controller!.text,
          'Draft stays here',
        );
        expect(c.inputs, isEmpty);
        // The + button opens the menu from the keyboard; the model chooser opens
        // from it and Escape returns without dropping focus to the page.
        final plus = find.byTooltip('More actions');
        Focus.of(tester.element(find.byIcon(Icons.add_circle_outline))).requestFocus();
        await tester.pump();
        for (final key in [
          LogicalKeyboardKey.enter,
          LogicalKeyboardKey.space,
        ]) {
          await tester.sendKeyEvent(key);
          await tester.pumpAndSettle();
          expect(find.text('Model and effort'), findsOneWidget);
          await tester.tap(find.text('Model and effort'));
          await tester.pumpAndSettle();
          expect(find.byType(LiveAgentControls), findsOneWidget);
          await tester.sendKeyEvent(LogicalKeyboardKey.escape);
          await tester.pumpAndSettle();
          expect(
            FocusManager.instance.primaryFocus,
            isNot(isA<FocusScopeNode>()),
          );
          Focus.of(tester.element(find.byIcon(Icons.add_circle_outline))).requestFocus();
          await tester.pump();
        }
        expect(plus, findsOneWidget);
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
      lessThanOrEqualTo(16 * 1.4 * 4 + 24),
    );
  });
}
