import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/dock_client.dart';

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
}
