import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/dock_client.dart';
import 'package:agent_dock_mobile/results_page.dart';

class WaitingPhone extends DockClient {
  final done = Completer<void>();
  bool canceled = false;
  @override
  Future<void> pair(String code) async {
    pairingCode = '123456';
    notifyListeners();
    await done.future;
  }

  @override
  Future<void> cancelPairing() async {
    canceled = true;
    if (!done.isCompleted) done.complete();
  }
}

class GalleryPhone extends DockClient {
  final viewed = <String>[];
  @override
  Future<dynamic> request(
    String method, [
    Map<String, dynamic> payload = const {},
  ]) async {
    if (method == 'results.seen') {
      viewed.addAll((payload['ids'] as List).cast<String>());
      return true;
    }
    return {'text': 'Preview ${payload['id']}'};
  }
}

void main() {
  testWidgets('approval waits on a narrow phone and can be canceled', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final phone = WaitingPhone();
    addTearDown(phone.dispose);
    await tester.pumpWidget(DockApp(client: phone));
    await tester.ensureVisible(find.text('Connect'));
    await tester.tap(find.text('Connect'));
    await tester.pumpAndSettle();
    expect(find.text('123 456'), findsOneWidget);
    expect(phone.pairing, isNull);
    await tester.ensureVisible(find.text('Cancel pairing'));
    await tester.tap(find.text('Cancel pairing'));
    await tester.pumpAndSettle();
    expect(phone.canceled, isTrue);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'gallery moves without reopening and only marks displayed pictures viewed',
    (tester) async {
      final phone = GalleryPhone();
      addTearDown(phone.dispose);
      final images = [
        for (var i = 1; i <= 3; i++)
          <String, dynamic>{
            'id': 'r$i',
            'title': 'Picture $i',
            'image': true,
            'ext': '.png',
            'seenAt': null,
            'git': {
              'branch': 'main',
              'commit': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            },
            'gitEnd': {
              'branch': 'main',
              'commit': 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              'dirty': true,
            },
          },
      ];
      await tester.pumpWidget(
        MaterialApp(
          home: ResultDetail(
            client: phone,
            item: images.first,
            ids: images.map((x) => x['id']).toList(),
            images: images,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(phone.viewed, ['r1']);
      expect(
        find.text('main · bbbbbbbb · Uncommitted changes'),
        findsOneWidget,
      );
      expect(find.text('1 · Viewed'), findsOneWidget);
      await tester.tap(find.byTooltip('Next picture'));
      await tester.pumpAndSettle();
      expect(phone.viewed, ['r1', 'r2']);
      expect(find.text('Picture 2'), findsOneWidget);
      expect(images.last['seenAt'], isNull);
      expect(find.text('2 · Viewed'), findsOneWidget);
      await tester.tap(find.byTooltip('Previous picture'));
      await tester.pumpAndSettle();
      expect(find.text('Picture 1'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
