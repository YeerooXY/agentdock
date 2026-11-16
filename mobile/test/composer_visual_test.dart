import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/dock_style.dart';

import 'widget_test.dart' show FakeDock, enterChat;

/// flutter test test/composer_visual_test.dart --dart-define=CAPTURE_COMPOSER=true
/// writes screenshots to verification/composer/.
const capture = bool.fromEnvironment('CAPTURE_COMPOSER');

void main() {
  const long =
      'when sending a bigger message, the box should stay one field with the '
      'plus at the bottom left and send inside it, growing to four lines '
      'before it scrolls instead of taking over the console.';
  for (final (name, size, scale) in [
    ('phone', const Size(393, 852), 1.0),
    ('narrow-large-text', const Size(320, 700), 1.6),
  ]) {
    testWidgets('composer stays one field with long text at $name', (
      tester,
    ) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = scale;
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
      final c = FakeDock();
      addTearDown(c.dispose);
      final boundary = GlobalKey();
      await tester.pumpWidget(
        RepaintBoundary(key: boundary, child: DockApp(client: c)),
      );
      await enterChat(tester);
      await tester.pumpAndSettle();
      Future<void> shot(String step) async {
        if (!capture) return;
        await tester.runAsync(() async {
          final image =
              await (boundary.currentContext!.findRenderObject()!
                      as RenderRepaintBoundary)
                  .toImage();
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          final file = File('../verification/composer/$name-$step.png');
          file.parent.createSync(recursive: true);
          file.writeAsBytesSync(bytes!.buffer.asUint8List());
          image.dispose();
        });
      }

      await shot('empty');
      final field = find.byType(TextField).last;
      final box = find.byKey(const ValueKey('reply-box'));
      final empty = tester.getRect(box);
      await tester.enterText(field, long);
      await tester.pumpAndSettle();
      final full = tester.getRect(box);
      final send = tester.getRect(find.byType(DockSendButton));
      expect(full.contains(send.center), isTrue);
      expect(full.width, empty.width, reason: 'the field keeps its width');
      // Four lines at most, then the text scrolls inside the field.
      expect(
        tester.getSize(field).height,
        lessThanOrEqualTo(
          MediaQuery.textScalerOf(tester.element(field)).scale(16) * 1.4 * 4 +
              24,
        ),
      );
      await shot('long');
      await tester.tap(find.byTooltip('More actions'));
      await tester.pumpAndSettle();
      expect(find.text('Terminal keys'), findsOneWidget);
      await shot('menu');
      expect(tester.takeException(), isNull);
    });
  }
}
