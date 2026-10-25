import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/console_surface.dart';
import 'package:agent_dock_mobile/console_theme.dart';

typedef _Capture = ({Uint8List png, Uint8List pixels, int width, int height});

Future<_Capture> _capture(WidgetTester tester, Size size, double age) async {
  final key = GlobalKey();
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: ColoredBox(
          color: const Color(0xff05060b),
          child: Align(
            alignment: Alignment.topLeft,
            child: RepaintBoundary(
              key: key,
              child: SizedBox.fromSize(
                size: size,
                child: CustomPaint(
                  painter: ConsoleAtmospherePainter(
                    const ConsoleAppearance(themeId: 'blue', starLevel: 4),
                    AlwaysStoppedAnimation(age / 60),
                    const AlwaysStoppedAnimation(1),
                    Listenable.merge(const []),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  final boundary =
      key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  Uint8List copy(ByteData? data) => Uint8List.fromList(
    data!.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
  );
  return (await tester.runAsync(() async {
    final image = await boundary.toImage(pixelRatio: 1);
    final png = await image.toByteData(format: ui.ImageByteFormat.png);
    final raw = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
    image.dispose();
    return (
      png: copy(png),
      pixels: copy(raw),
      width: size.width.round(),
      height: size.height.round(),
    );
  }))!;
}

({Offset origin, Offset direction, double speed}) _shot(Size size) {
  final random = math.Random(0);
  final origin = Offset(
    random.nextDouble() * size.width * .6,
    random.nextDouble() * size.height * .4,
  );
  final angle = (20 + random.nextDouble() * 15) * math.pi / 180;
  return (
    origin: origin,
    direction: Offset(math.cos(angle), math.sin(angle)),
    speed: 220 + random.nextDouble() * 100,
  );
}

List<int> _pixel(_Capture capture, int x, int y) {
  final offset = (y * capture.width + x) * 4;
  return capture.pixels.sublist(offset, offset + 3);
}

({Offset point, int luminance}) _brightestNear(
  _Capture capture,
  Offset center, {
  int radius = 4,
}) {
  var point = center, best = -1;
  for (
    var y = math.max(0, center.dy.floor() - radius);
    y <= math.min(capture.height - 1, center.dy.ceil() + radius);
    y++
  ) {
    for (
      var x = math.max(0, center.dx.floor() - radius);
      x <= math.min(capture.width - 1, center.dx.ceil() + radius);
      x++
    ) {
      final color = _pixel(capture, x, y);
      final luminance = (color[0] * .2126 + color[1] * .7152 + color[2] * .0722)
          .round();
      if (luminance > best) {
        point = Offset(x.toDouble(), y.toDouble());
        best = luminance;
      }
    }
  }
  return (point: point, luminance: best);
}

int _brightnessNear(_Capture capture, Offset center) =>
    _brightestNear(capture, center, radius: 2).luminance;

void main() {
  testWidgets(
    'shooting stars keep their angle, speed and fading trail across panel shapes',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetDevicePixelRatio);
      final output = Directory(
        '${Directory.current.parent.path}/.build/shooting-stars-20261024/mobile',
      );
      await tester.runAsync(() => output.create(recursive: true));
      final measuredSpeeds = <double>[];

      for (final (label, size) in [
        ('wide', const Size(1280, 420)),
        ('tall', const Size(390, 844)),
      ]) {
        tester.view.physicalSize = size;
        final shot = _shot(size);
        final early = await _capture(tester, size, .25);
        final late = await _capture(tester, size, .45);
        final earlyExpected = shot.origin + shot.direction * (shot.speed * .25);
        final lateExpected = shot.origin + shot.direction * (shot.speed * .45);
        final earlyHead = _brightestNear(early, earlyExpected);
        final lateHead = _brightestNear(late, lateExpected);
        expect(
          earlyHead.luminance,
          greaterThan(180),
          reason: '$label: bright head at 250 ms',
        );
        expect(
          lateHead.luminance,
          greaterThan(180),
          reason: '$label: bright head at 450 ms',
        );

        final traveled = (lateHead.point - earlyHead.point).distance;
        final speed = traveled / .2;
        measuredSpeeds.add(speed);
        expect(speed, closeTo(shot.speed, 15), reason: '$label: fixed speed');

        final tail = lateExpected - shot.direction * 80;
        final middle = lateExpected - shot.direction * 40;
        expect(
          _brightnessNear(late, middle),
          greaterThan(_brightnessNear(late, tail) + 4),
          reason: '$label: the tail fades toward its end',
        );

        await tester.runAsync(
          () =>
              File('${output.path}/flutter-$label-shooting-star.png')
                  .writeAsBytes(late.png),
        );
      }
      expect((measuredSpeeds[0] - measuredSpeeds[1]).abs(), lessThan(15));
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
