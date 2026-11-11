import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';

import 'widget_test.dart' show FakeDock;

void main() {
  const channel = MethodChannel('agentdock/dictation');
  late Completer<String?> result;
  setUp(() {
    result = Completer<String?>();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (_) async {
          final text = await result.future;
          if (text == '__error') {
            throw PlatformException(
              code: 'unavailable',
              message: 'Voice typing is unavailable on this phone.',
            );
          }
          return text;
        });
  });
  tearDown(
    () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null),
  );

  Future<FakeDock> open(WidgetTester tester) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await tester.pumpAndSettle();
    return c;
  }

  testWidgets('dictation replaces selected text and never sends', (
    tester,
  ) async {
    final c = await open(tester);
    final field = find.byType(TextField).last;
    await tester.enterText(field, 'hello old world');
    final editor = tester.widget<TextField>(field).controller!;
    editor.selection = const TextSelection(baseOffset: 6, extentOffset: 9);
    await tester.tap(find.byTooltip('Dictate'));
    await tester.pump();
    await tester.runAsync(() async {
      result.complete('new');
      await Future<void>.delayed(const Duration(milliseconds: 20));
    });
    await tester.pumpAndSettle();
    expect(editor.text, 'hello new world');
    expect(editor.selection.extentOffset, 9);
    expect(tester.widget<TextField>(field).focusNode!.hasFocus, isTrue);
    expect(c.inputs, isEmpty);
  });

  for (final mode in ['cancel', 'error', 'edit', 'console']) {
    testWidgets('$mode preserves drafts while dictation is pending', (
      tester,
    ) async {
      final c = await open(tester);
      final field = find.byType(TextField).last;
      await tester.enterText(field, 'original');
      await tester.tap(find.byTooltip('Dictate'));
      await tester.pump();
      if (mode == 'edit') await tester.enterText(field, 'edited');
      if (mode == 'console') {
        c.state['sessions'].add(<String, Object>{
          ...c.state['sessions'][0],
          'id': 'two',
          'consoleKey': 'two',
        });
        c.selected = 'two';
        c.screens['two'] = c.makeScreen('two')..terminal.write('Ready');
        c.notifyListeners();
        await tester.pump();
      }
      await tester.runAsync(() async {
        if (mode == 'error') {
          result.complete('__error');
        } else {
          result.complete(mode == 'cancel' ? null : 'dictated');
        }
        await Future<void>.delayed(const Duration(milliseconds: 20));
      });
      await tester.pumpAndSettle();
      final text = tester.widget<TextField>(field).controller!.text;
      expect(
        text,
        mode == 'edit'
            ? 'edited'
            : mode == 'console'
            ? ''
            : 'original',
      );
      expect(c.inputs, isEmpty);
      expect(
        tester
            .widget<IconButton>(find.widgetWithIcon(IconButton, Icons.mic_none))
            .onPressed,
        isNotNull,
      );
    });
  }
}
