import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/terminal_reading.dart';
import 'package:agent_dock_mobile/agent_identity.dart';
import 'package:xterm/xterm.dart';

import 'widget_test.dart' show FakeDock;

class ActionsDock extends FakeDock {
  final actions = <Map<String, dynamic>>[];
  ActionsDock() {
    state['capabilities'] = [
      'console.agents',
      'console.files',
      'console.close',
    ];
  }
  @override
  Future<dynamic> request(
    String method, [
    Map<String, dynamic> payload = const {},
  ]) async {
    actions.add({'method': method, ...payload});
    if (method == 'console.agents') {
      return {
        'defaultProvider': 'codex',
        'agents': [
          {'id': 'codex', 'name': 'Codex', 'installed': true},
          {'id': 'claude', 'name': 'Claude Code', 'installed': true},
          {'id': 'gemini', 'name': 'Gemini CLI', 'installed': false},
        ],
      };
    }
    if (method == 'console.files') {
      return {
        'directory': payload['directory'],
        'entries': [
          {
            'name': 'hello world.dart',
            'path': 'hello world.dart',
            'directory': false,
          },
        ],
      };
    }
    if (method == 'console.create') return {'id': 'created'};
    if (method == 'console.close') return true;
    return super.request(method, payload);
  }
}

void phone(WidgetTester tester, Size size, [double scale = 1]) {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = scale;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
}

void main() {
  test('clearing the mobile view keeps the remote stream checkpoint', () {
    final c = ActionsDock();
    addTearDown(c.dispose);
    final view = c.screen!;
    view.sequence = 42;
    view.epoch = 3;
    view.terminal.write('\r\nOlder output');

    c.clearSelectedView();

    expect(terminalReadingText(c.screen!.terminal), isEmpty);
    expect(c.screen!.sequence, 42);
    expect(c.screen!.epoch, 3);
  });

  test(
    'reading joins soft wraps and preserves hard breaks, code and Unicode',
    () {
      final terminal = Terminal()..resize(20, 8);
      terminal.write(
        'This line is longer than the terminal width.\r\n  code();\r\nárvíztűrő 中文',
      );
      expect(
        terminalReadingText(terminal),
        'This line is longer than the terminal width.\n  code();\nárvíztűrő 中文',
      );
    },
  );

  for (final size in [
    const Size(320, 740),
    const Size(411, 900),
    const Size(852, 393),
  ]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('normal-size wrapped output fits $size at $scale', (
        tester,
      ) async {
        phone(tester, size, scale);
        final c = ActionsDock();
        addTearDown(c.dispose);
        c.screen!.terminal.resize(240, 30);
        c.screen!.terminal.write(
          '\r\n${'A long paragraph of output. ' * 15}\r\n${'x' * 230}',
        );
        await tester.pumpWidget(DockApp(client: c));
        await tester.pumpAndSettle();
        final reading = find.byType(TerminalReadingView);
        final selected = find.descendant(
          of: reading,
          matching: find.byType(SelectableText),
        );
        expect(tester.widget<SelectableText>(selected).style!.fontSize, 16);
        expect(tester.getRect(selected).right, lessThanOrEqualTo(size.width));
        expect(find.byType(TerminalView), findsNothing);
        expect(c.screen!.terminal.viewWidth, 240);
        expect(c.inputs, isEmpty);
        await tester.drag(reading, const Offset(0, 90));
        await tester.pumpAndSettle();
        expect(tester.testTextInput.isVisible, false);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets(
    'copy freezes output and copies exact text without terminal input',
    (tester) async {
      final c = ActionsDock();
      addTearDown(c.dispose);
      c.screen!.terminal.write('\r\nDo not run this: echo hello');
      String? clipboard;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'Clipboard.setData') {
            clipboard = (call.arguments as Map)['text'] as String;
          }
          return null;
        },
      );
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          null,
        ),
      );
      await tester.pumpWidget(DockApp(client: c));
      await tester.tap(find.byTooltip('Console actions'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Copy text'));
      await tester.pumpAndSettle();
      c.screen!.terminal.write('\r\nNew output');
      await tester.pump(const Duration(milliseconds: 200));
      await tester.tap(find.text('Copy all'));
      await tester.pumpAndSettle();
      expect(clipboard, 'Ready\nDo not run this: echo hello');
      expect(c.inputs, isEmpty);
    },
  );

  testWidgets('selection stays stable while the terminal updates', (
    tester,
  ) async {
    final c = ActionsDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    final selected = find.byType(SelectableText);
    tester.widget<SelectableText>(selected).onSelectionChanged!(
      const TextSelection(baseOffset: 0, extentOffset: 5),
      SelectionChangedCause.longPress,
    );
    c.screen!.terminal.write(' more output');
    await tester.pump(const Duration(milliseconds: 200));
    expect(
      tester.widget<SelectableText>(selected).textSpan!.toPlainText(),
      'Ready',
    );
    expect(find.text('Show new output'), findsOneWidget);
    await tester.tap(find.text('Show new output'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<SelectableText>(selected).textSpan!.toPlainText(),
      'Ready more output',
    );
  });

  testWidgets('chat name opens a dropdown with colored agents', (tester) async {
    phone(tester, const Size(320, 740));
    final c = ActionsDock();
    addTearDown(c.dispose);
    c.state['sessions'].add({
      'id': 'two',
      'name': 'Claude project',
      'provider': 'claude',
      'state': 'active',
    });
    await tester.pumpWidget(DockApp(client: c));
    expect(find.byIcon(Icons.grid_view_rounded), findsNothing);
    await tester.tap(find.text('Trader'));
    await tester.pumpAndSettle();
    expect(find.text('Claude project'), findsOneWidget);
    final claude = tester.widget<AgentBadge>(find.byType(AgentBadge).last);
    expect(claude.provider, 'claude');
    await tester.tap(find.text('Claude project'));
    await tester.pumpAndSettle();
    expect(c.selected, 'two');
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'new console uses a one-time agent and old hosts keep their default',
    (tester) async {
      final c = ActionsDock();
      addTearDown(c.dispose);
      await tester.pumpWidget(DockApp(client: c));
      await tester.tap(find.byTooltip('Switch console'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('New console'));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(DropdownButtonFormField<String>).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Claude Code').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      expect(c.actions.where((x) => x['method'] == 'console.create').single, {
        'method': 'console.create',
        'name': '',
        'agent': 'claude',
        'chooseModel': false,
      });
      expect(
        c.actions.where((x) => '${x['method']}'.contains('settings')),
        isEmpty,
      );
    },
  );

  testWidgets('files and slash suggestions change only the draft', (
    tester,
  ) async {
    final c = ActionsDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await tester.enterText(find.byType(TextField).last, '/mo');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ActionChip, '/model'));
    expect(
      tester.widget<TextField>(find.byType(TextField).last).controller!.text,
      '/model',
    );
    expect(c.inputs, isEmpty);
    await tester.enterText(find.byType(TextField).last, 'Review ');
    await tester.tap(find.byTooltip('Choose a file'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('hello world.dart'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<TextField>(find.byType(TextField).last).controller!.text,
      'Review "hello world.dart" ',
    );
    expect(c.inputs, isEmpty);
    c.screen!.terminal.write('\x1b[?2004h');
    await tester.tap(find.byTooltip('Send to console'));
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pumpAndSettle();
    expect(c.inputs.map((x) => x['data']).toList(), [
      '\x1b[200~Review "hello world.dart" \x1b[201~',
      '\r',
    ]);
  });

  testWidgets(
    'closing is explicit and an old confirmation cannot close another session',
    (tester) async {
      final c = ActionsDock();
      addTearDown(c.dispose);
      await tester.pumpWidget(DockApp(client: c));
      Future<void> ask() async {
        await tester.tap(find.byTooltip('Console actions'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Close console'));
        await tester.pumpAndSettle();
      }

      await ask();
      await tester.tap(find.text('Keep open'));
      await tester.pumpAndSettle();
      expect(c.actions.where((x) => x['method'] == 'console.close'), isEmpty);
      await ask();
      c.generation++;
      await tester.tap(find.text('Close console'));
      await tester.pumpAndSettle();
      expect(c.actions.where((x) => x['method'] == 'console.close'), isEmpty);
      await ask();
      await tester.tap(find.text('Close console'));
      await tester.pumpAndSettle();
      expect(c.actions.where((x) => x['method'] == 'console.close').single, {
        'method': 'console.close',
        'id': 'one',
        'confirm': true,
      });
    },
  );

  testWidgets('old hosts explain unavailable files without sending a request', (
    tester,
  ) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await tester.tap(find.byTooltip('Choose a file'));
    await tester.pumpAndSettle();
    expect(
      find.text('Update Dock on your PC to choose files here.'),
      findsOneWidget,
    );
    expect(c.calls.where((x) => x == 'console.files'), isEmpty);
  });
}
