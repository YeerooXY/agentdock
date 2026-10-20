import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/agent_identity.dart';

import 'widget_test.dart' show FakeDock, enterChat;

void main() {
  for (final provider in ['codex', 'claude']) {
    testWidgets(
      '$provider header uses bundled icon only and chat starts collapsed',
      (tester) async {
        final c = FakeDock();
        addTearDown(c.dispose);
        c.state['sessions'][0]['provider'] = provider;
        await tester.pumpWidget(DockApp(client: c));
        expect(find.text(AgentIdentity.of(provider).name), findsNothing);
        expect(find.byType(AgentMark), findsOneWidget);
        final icon = tester.widget<Image>(find.byType(Image).first);
        expect(
          (icon.image as AssetImage).assetName,
          AgentIdentity.logo(provider),
        );
        expect(find.text('Model'), findsNothing);
        expect(find.byType(TextField), findsNothing);
        expect(find.byTooltip('Agent commands'), findsNothing);
        expect(find.text('Enter'), findsNothing);
        expect(find.byIcon(Icons.desktop_windows), findsOneWidget);
        expect(
          tester.getSize(find.byKey(const ValueKey('enter-chat'))).height,
          greaterThanOrEqualTo(40),
        );
      },
    );
  }
  testWidgets(
    'collapse retains draft and hides model row until explicitly reopened',
    (tester) async {
      final c = FakeDock();
      addTearDown(c.dispose);
      await tester.pumpWidget(DockApp(client: c));
      await enterChat(tester);
      await tester.enterText(find.byType(TextField), 'Draft belongs here');
      await tester.pump();
      expect(find.text('Model'), findsOneWidget);
      await tester.tap(find.byTooltip('Collapse chat'));
      await tester.pumpAndSettle();
      expect(find.byType(TextField), findsNothing);
      expect(find.text('Model'), findsNothing);
      expect(tester.testTextInput.isVisible, false);
      await tester.drag(
        find.byKey(const ValueKey('terminal-reading-scroll')),
        const Offset(0, 100),
      );
      await tester.pumpAndSettle();
      expect(tester.testTextInput.isVisible, false);
      await enterChat(tester);
      expect(find.text('Draft belongs here'), findsOneWidget);
      expect(c.inputs, isEmpty);
    },
  );
  testWidgets(
    'composer starts small and stops growing at eight and a half lines',
    (tester) async {
      tester.view.physicalSize = const Size(393, 852);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = FakeDock();
      addTearDown(c.dispose);
      await tester.pumpWidget(DockApp(client: c));
      await enterChat(tester);
      final field = find.byType(TextField);
      final small = tester.getSize(field).height;
      await tester.enterText(field, List.filled(40, 'a long draft').join('\n'));
      await tester.pumpAndSettle();
      expect(tester.getSize(field).height, greaterThan(small));
      expect(
        tester.getSize(field).height,
        lessThanOrEqualTo(16 * 1.4 * 8.5 + 24),
      );
      expect(tester.takeException(), isNull);
    },
  );
}
