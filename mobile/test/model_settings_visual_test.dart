import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/agent_selection.dart';
import 'package:agent_dock_mobile/live_agent_controls.dart';

import 'pending_agent_controls_test.dart' show SettingsDock, effort;
import 'widget_test.dart' show enterChat;

const capture = bool.fromEnvironment('CAPTURE_MODEL_SETTINGS');

void main() {
  test(
    'selected settings remain distinct until fresh provider metadata arrives',
    () {
      final session = {
        'model': 'old',
        'effort': 'low',
        'settingsAt': 100,
        'requestedSettings': {
          'model': 'new',
          'effort': 'high',
          'at': 200,
          'status': 'awaiting-provider',
        },
      };
      expect(AgentSelection.fromSession(session).pending, true);
      expect(AgentSelection.fromSession(session).model, 'new');
      session.addAll({
        'model': 'provider-model',
        'effort': 'medium',
        'settingsAt': 300,
      });
      expect(AgentSelection.fromSession(session).pending, false);
      expect(AgentSelection.fromSession(session).model, 'provider-model');
    },
  );
  for (final profile in [
    ('android', const Size(393, 852), 1.0),
    ('iphone', const Size(390, 844), 1.0),
    ('narrow-large-text', const Size(320, 900), 1.5),
  ]) {
    testWidgets('model settings and removed banner fit ${profile.$1}', (
      tester,
    ) async {
      debugDefaultTargetPlatformOverride = profile.$1 == 'iphone'
          ? TargetPlatform.iOS
          : TargetPlatform.android;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);
      tester.view.physicalSize = profile.$2;
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = profile.$3;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      if (capture) {
        await tester.runAsync(() async {
          for (final font in [
            ('Roboto', 'roboto-regular.ttf'),
            ('MaterialIcons', 'materialicons-regular.otf'),
          ]) {
            final bytes = File(
              '../.build/mobile-tools/flutter/bin/cache/artifacts/material_fonts/${font.$2}',
            ).readAsBytesSync();
            await (FontLoader(
              font.$1,
            )..addFont(Future.value(ByteData.sublistView(bytes)))).load();
          }
        });
      }
      final c = SettingsDock();
      addTearDown(c.dispose);
      c.state['sessions'][0].addAll({
        'model': 'test-model-a',
        'effort': 'low',
        'launchId': 'launch-a',
        'accountId': 'account-a',
        'consoleKey': 'console-a',
        'providerSessionId': 'chat-a',
        'switchOffer': {
          'usedPercent': 100,
          'targetAccountId': 'other',
          'targetLabel': 'Other account',
        },
      });
      final boundary = GlobalKey();
      await tester.pumpWidget(
        RepaintBoundary(
          key: boundary,
          child: DockApp(client: c),
        ),
      );
      await tester.runAsync(
        () => precacheImage(
          const AssetImage('assets/providers/openai.png'),
          tester.element(find.byType(Scaffold).first),
        ),
      );
      await enterChat(tester);
      await tester.pumpAndSettle();
      expect(find.textContaining('Usage reached'), findsNothing);
      await tester.enterText(
        find.byType(TextField).last,
        'Keep this phone draft',
      );
      await tester.tap(find.text('test-model-a'));
      await tester.pumpAndSettle();
      expect(find.byType(LiveAgentControls), findsOneWidget);
      await effort(tester);
      expect(
        find.textContaining('reloads its saved conversation'),
        findsOneWidget,
      );
      await tester.ensureVisible(find.text('Apply'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      if (capture) {
        await tester.runAsync(() async {
          final image =
              await (boundary.currentContext!.findRenderObject()!
                      as RenderRepaintBoundary)
                  .toImage();
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          final file = File(
            '../verification/idle-model-switching/${profile.$1}.png',
          );
          file.parent.createSync(recursive: true);
          file.writeAsBytesSync(bytes!.buffer.asUint8List());
          image.dispose();
        });
      }
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        'Keep this phone draft',
      );
      expect(c.inputs, isEmpty);
      expect(tester.takeException(), isNull);
      debugDefaultTargetPlatformOverride = null;
    });
  }
}
