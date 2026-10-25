import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xterm/xterm.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/console_drafts.dart';
import 'package:agent_dock_mobile/dock_client.dart';
import 'package:agent_dock_mobile/terminal_styles.dart';
import 'package:agent_dock_mobile/terminal_reading.dart';

import 'widget_test.dart' show FakeDock, enterChat;
import 'mobile_actions_test.dart' show ActionsDock;

class ProjectDock extends ActionsDock {
  @override
  Future<dynamic> request(
    String method, [
    Map<String, dynamic> payload = const {},
  ]) async {
    if (method == 'console.agents') {
      return {
        'defaultProvider': 'claude',
        'agents': [
          {'id': 'codex', 'name': 'Codex', 'installed': true},
          {'id': 'claude', 'name': 'Claude Code', 'installed': true},
        ],
        'projects': [
          {
            'id': 'p1',
            'name': 'Game project',
            'folders': [
              {'label': 'Client', 'path': '/client'},
              {'label': 'Server', 'path': '/server'},
            ],
          },
        ],
        'hosts': [
          {
            'id': 'vm',
            'name': 'Linux VM',
            'folder': '/work',
            'agents': ['claude'],
          },
        ],
      };
    }
    return super.request(method, payload);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('full-width rules read as one short rule and text is kept', () {
    final terminal = Terminal()..resize(80, 10);
    final rule = '─' * 80;
    terminal.write(
      'Answer line\r\n\x1b[2m$rule\x1b[0m\r\n${'━' * 80}\r\n> prompt\r\n  ${'-' * 60}\r\nSee --help ---- or ==\r\n',
    );
    final lines = terminalReadingSpan(
      terminal,
      terminalTheme,
    ).toPlainText().split('\n');
    expect(lines, [
      'Answer line',
      '─' * ruleWidth,
      '> prompt',
      '  ${'-' * ruleWidth}',
      'See --help ---- or ==',
    ]);
    expect(terminalRule('╭${'─' * 20}╮'), isTrue);
    expect(terminalRule('--------'), isTrue);
    expect(terminalRule('-------'), isFalse);
    expect(terminalRule('── Tools ──────────'), isFalse);
  });
  test(
    'wrapped cells retain ANSI colors, emphasis, Unicode and soft wraps',
    () {
      final terminal = Terminal()..resize(20, 8);
      terminal.write(
        '\x1b[31;1mRed bold\x1b[0m normal\r\n\x1b[38;2;12;34;56mRGB \u4e2d\u6587\x1b[0m\r\n  indented long text that wraps over a line',
      );
      final rich = terminalReadingSpan(terminal, terminalTheme);
      expect(rich.toPlainText(), terminalReadingText(terminal));
      final spans = rich.children!.cast<TextSpan>();
      expect(
        spans.any(
          (s) =>
              s.text!.contains('Red bold') &&
              s.style?.color == terminalTheme.red &&
              s.style?.fontWeight == FontWeight.bold,
        ),
        isTrue,
      );
      expect(
        spans.any((s) => s.style?.color == const Color(0xff0c2238)),
        isTrue,
      );
      expect(
        rich.toPlainText(),
        contains('  indented long text that wraps over a line'),
      );
    },
  );

  test(
    'draft positions persist alongside legacy text and are removed with the PC',
    () async {
      String? saved = jsonEncode({ConsoleDrafts.key('pc', 'chat'): 'legacy'});
      final drafts = ConsoleDrafts(
        read: () async => saved,
        write: (v) async => saved = v,
      );
      await drafts.load();
      final key = ConsoleDrafts.key('pc', 'chat');
      drafts.remember(key, 'reading', 174.5);
      drafts.remember(key, 'selection', 4);
      await drafts.flush();
      final reopened = ConsoleDrafts(
        read: () async => saved,
        write: (v) async => saved = v,
      );
      await reopened.load();
      expect(reopened.get(key), 'legacy');
      expect(reopened.position(key, 'reading'), 174.5);
      await reopened.forgetPC('pc');
      expect(reopened.position(key, 'reading'), isNull);
      drafts.dispose();
      reopened.dispose();
    },
  );

  testWidgets('reading and draft caret stay with their console', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    c.screen!.terminal.write(
      '\r\n${List.generate(100, (i) => 'Output line $i').join('\r\n')}',
    );
    c.state['sessions'].add({
      'id': 'two',
      'name': 'Other',
      'provider': 'claude',
      'state': 'open',
    });
    c.screens['two'] = c.makeScreen('two')..terminal.write('Other console');
    await tester.pumpWidget(DockApp(client: c));
    await tester.pumpAndSettle();
    final scroll = find.byKey(const ValueKey('terminal-reading-scroll'));
    await tester.drag(scroll, const Offset(0, 400));
    await tester.pumpAndSettle();
    final before = tester
        .widget<SingleChildScrollView>(scroll)
        .controller!
        .offset;
    await enterChat(tester);
    final field = tester.widget<TextField>(find.byType(TextField).last);
    field.controller!.value = TextEditingValue(
      text: List.generate(60, (i) => 'Draft line $i').join('\n'),
      selection: const TextSelection.collapsed(offset: 4),
    );
    await tester.pumpAndSettle();
    field.scrollController!.jumpTo(180);
    await tester.pumpAndSettle();
    await c.select('two');
    await tester.pumpAndSettle();
    await enterChat(tester);
    expect(
      tester.widget<TextField>(find.byType(TextField).last).controller!.text,
      '',
    );
    await c.select('one');
    await tester.pumpAndSettle();
    await enterChat(tester);
    expect(
      tester.widget<SingleChildScrollView>(scroll).controller!.offset,
      closeTo(before, 1),
    );
    expect(
      tester
          .widget<TextField>(find.byType(TextField).last)
          .controller!
          .selection
          .extentOffset,
      4,
    );
    expect(
      tester
          .widget<TextField>(find.byType(TextField).last)
          .scrollController!
          .offset,
      closeTo(180, 1),
    );
  });

  testWidgets('new console selects a project folder and the PC default agent', (
    tester,
  ) async {
    final c = ProjectDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await tester.tap(find.byTooltip('Switch console'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('New console'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('No project \u00b7 default folder'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Game project').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Client'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Server').last);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Open'));
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    final created = c.actions.singleWhere(
      (x) => x['method'] == 'console.create',
    );
    expect(created['projectId'], 'p1');
    expect(created['folderIndex'], 1);
    expect(created['agent'], 'claude');
  });

  testWidgets('live controls refuse keys after reconnect', (tester) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Model unknown'));
    await tester.pumpAndSettle();
    c.generation++;
    c.notifyListeners();
    await tester.pumpAndSettle();
    expect(
      find.text('Connection or chat changed. Reopen the chooser.'),
      findsOneWidget,
    );
    expect(c.inputs, isEmpty);
  });

  testWidgets('live model controls remain reachable with large phone text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final c = FakeDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Model unknown'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.ensureVisible(find.byTooltip('Close chooser'));
    expect(find.byTooltip('Close chooser').hitTestable(), findsOneWidget);
  });

  test('background mode streams status only and deduplicates local completion alerts', () async {
    final calls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(DockClient.background, (call) async {
          calls.add(call);
          return true;
        });
    final c = FakeDock();
    c.stayConnected = true;
    c.setForeground(false);
    await Future<void>.delayed(Duration.zero);
    expect(c.connected, isTrue);
    expect(c.foreground, isFalse);
    final state = {
      'sessions': c.sessions,
      'alerts': [
        {'id': 'a1', 'at': 0, 'title': 'Done'},
      ],
    };
    c.handleMessage(jsonEncode({'type': 'state', 'state': state}));
    c.handleMessage(jsonEncode({'type': 'state', 'state': state}));
    await Future<void>.delayed(Duration.zero);
    expect(calls.where((x) => x.method == 'notify').length, 1);
    c.dispose();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(DockClient.background, null);
  });

  test('oversized attachments are rejected before any transfer', () async {
    final c = FakeDock();
    await expectLater(
      c.attachImage(Uint8List(4 * 1024 * 1024 + 1)),
      throwsStateError,
    );
    expect(c.calls, isEmpty);
    c.dispose();
  });
}
