import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xterm/xterm.dart';
import 'package:agent_dock_mobile/agent_identity.dart';
import 'package:agent_dock_mobile/console_drafts.dart';
import 'package:agent_dock_mobile/console_overview.dart';
import 'package:agent_dock_mobile/console_switcher.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/terminal_viewport.dart';
import 'package:agent_dock_mobile/dock_style.dart' show DockFrame;

import 'widget_test.dart' show FakeDock, enterChat;

void viewport(WidgetTester tester, Size size) {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

FakeDock consoles() {
  final client = FakeDock();
  client.state['projects'] = [
    {'id': 'project', 'name': 'Paddock', 'color': '#74c69a'},
  ];
  client.state['sessions'] = [
    for (final (id, state) in [
      ('one', 'ready'),
      ('two', 'attention'),
      ('three', 'error'),
      ('four', 'working'),
      ('five', 'ended'),
      ('six', 'active'),
      ('seven', 'open'),
    ])
      <String, Object?>{
        'id': id,
        'consoleKey': id,
        'name': 'Console $id',
        'provider': id == 'two' ? 'claude' : 'codex',
        'state': state,
        'projectId': 'project',
        if (id == 'one') 'model': 'Test model',
        if (id == 'one') 'accountLabel': 'Work account',
      },
  ];
  for (final session in client.sessions) {
    final id = session['id'] as String;
    client.screens.putIfAbsent(id, () => client.makeScreen(id));
  }
  client.screens['one']!.terminal.write('\r\nLast cached output\r\n');
  return client;
}

Future<void> showOverview(WidgetTester tester) async {
  await tester.tap(find.byType(ConsoleSwitcher));
  await tester.pumpAndSettle();
  await tester.tap(find.text('All consoles').last);
  await tester.pumpAndSettle();
}

void main() {
  test('last output line uses parsed tail cells, skips blanks and respects alternate buffer', () {
    final terminal = Terminal(maxLines: 3000);
    expect(consoleLastLine(terminal), '');
    terminal.write(List.generate(2000, (i) => 'History $i\r\n').join());
    terminal.write('\x1b[31mLatest output\x1b[0m\r\n\r\n');
    expect(consoleLastLine(terminal), 'Latest output');
    terminal.write('\x1b[?1049hAlternate screen');
    expect(consoleLastLine(terminal), 'Alternate screen');
    terminal.write('\x1b[?1049l');
    expect(consoleLastLine(terminal), 'Latest output');
  });

  testWidgets('new open consoles stay neutral and dead consoles override stale states', (tester) async {
    viewport(tester, const Size(600, 1600));
    final client = consoles();
    addTearDown(client.dispose);
    client.state['sessions'][0]['alive'] = false;
    client.state['sessions'][3]['alive'] = false;
    client.state['sessions'][5].addAll({
      'alive': false, 'restoreError': 'Could not reopen',
    });
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: ConsoleOverview(
        client: client, onSelected: (_) {}, onNewConsole: () {},
      )),
    ));
    expect(find.text('Ready 0'), findsOneWidget);
    expect(find.text('Working 0'), findsOneWidget);
    expect(find.text('Needs you 3'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('console-filter-all')));
    await tester.pumpAndSettle();
    for (final (id, status) in [
      ('one', 'Ended'), ('four', 'Ended'), ('six', 'Error'), ('seven', 'Open'),
    ]) {
      final card = find.byKey(ValueKey('console-card-$id'));
      await tester.scrollUntilVisible(card, 180);
      expect(find.descendant(of: card, matching: find.text(status)), findsOneWidget);
      expect(tester.widget<DockFrame>(find.ancestor(
        of: card, matching: find.byType(DockFrame),
      )).ready, isFalse);
    }
  });

  for (final needsAttention in [true, false]) {
    testWidgets('default filter stays fixed while browsing (attention: $needsAttention)', (tester) async {
      viewport(tester, const Size(360, 800));
      final client = FakeDock();
      addTearDown(client.dispose);
      client.state['sessions'][0]['state'] = needsAttention ? 'attention' : 'ready';
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: ConsoleOverview(
          client: client, onSelected: (_) {}, onNewConsole: () {},
        )),
      ));
      client.state['sessions'][0]['state'] = needsAttention ? 'ready' : 'attention';
      client.notifyListeners();
      await tester.pumpAndSettle();
      expect(tester.widget<FilterChip>(find.byKey(ValueKey(
        needsAttention ? 'console-filter-needsYou' : 'console-filter-all',
      ))).selected, isTrue);
      expect(find.byKey(const ValueKey('console-card-one')),
          needsAttention ? findsNothing : findsOneWidget);
    });
  }

  testWidgets('inactive overview skips list builds and initializes its filter on opening', (tester) async {
    final client = consoles();
    addTearDown(client.dispose);
    Widget overview(bool active) => MaterialApp(
      home: Scaffold(body: ConsoleOverview(
        client: client, active: active, onSelected: (_) {}, onNewConsole: () {},
      )),
    );
    await tester.pumpWidget(overview(false));
    client.notifyListeners();
    await tester.pump();
    expect(find.byType(CustomScrollView), findsNothing);
    for (final session in client.sessions) {
      session['state'] = 'ready';
    }
    await tester.pumpWidget(overview(true));
    expect(tester.widget<FilterChip>(find.byKey(
      const ValueKey('console-filter-all'),
    )).selected, isTrue);
    await tester.pumpWidget(overview(false));
    client.notifyListeners();
    await tester.pump();
    expect(find.byType(CustomScrollView), findsNothing);
  });

  testWidgets('cards expose selection and explain disabled taps', (tester) async {
    final client = FakeDock();
    addTearDown(client.dispose);
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: ConsoleOverview(
        client: client, onSelected: (_) {}, onNewConsole: () {},
      )),
    ));
    final card = find.byKey(const ValueKey('console-card-one'));
    var semantics = tester.widget<Semantics>(card).properties;
    expect(semantics.button, isTrue);
    expect(semantics.selected, isTrue);
    expect(semantics.enabled, isTrue);
    expect(tester.widget<Icon>(find.descendant(
      of: card, matching: find.byIcon(Icons.check),
    )).semanticLabel, 'Open');
    client.connected = false;
    client.notifyListeners();
    await tester.pump();
    semantics = tester.widget<Semantics>(card).properties;
    expect(semantics.enabled, isFalse);
    expect(semantics.hint, 'Connect to your PC to open this console.');
    expect(tester.widget<InkWell>(find.descendant(
      of: card, matching: find.byType(InkWell),
    )).onTap, isNull);
  });

  testWidgets('phone overview header and menu cannot act on the hidden console', (tester) async {
    viewport(tester, const Size(360, 800));
    final client = consoles();
    addTearDown(client.dispose);
    client.state['capabilities'] = ['console.manage', 'code.read'];
    client.state['sessions'][0].addAll({
      'alive': true,
      'draftSupported': true,
      'switchTargets': [
        {'id': 'other', 'label': 'Other account', 'ready': true},
      ],
    });
    await tester.pumpWidget(DockApp(client: client));
    await showOverview(tester);
    final header = find.byType(AppBar);
    expect(find.descendant(of: header, matching: find.byType(DockMark)), findsOneWidget);
    expect(find.descendant(of: header, matching: find.byType(AgentMark)), findsNothing);
    expect(find.descendant(of: header, matching: find.byType(StatusDot)), findsNothing);
    expect(find.descendant(of: header, matching: find.text('Paddock')), findsNothing);
    await tester.tap(find.byTooltip('More options'));
    await tester.pumpAndSettle();
    for (final label in [
      'Close console', 'Copy text', 'Type directly in terminal', 'Rename',
      'Project', 'Code', 'Switch to Other account', 'Set up Other account',
    ]) {
      expect(find.text(label), findsNothing);
    }
    expect(find.text('Reconnect'), findsOneWidget);
    expect(client.calls.where((call) => call.startsWith('console.')), isEmpty);
    expect(client.inputs, isEmpty);
  });

  testWidgets('resizing preserves terminal, composer, focus and reading state', (tester) async {
    viewport(tester, const Size(360, 800));
    final client = FakeDock();
    addTearDown(client.dispose);
    client.screen!.terminal.write(List.generate(200, (i) => 'History $i\r\n').join());
    await tester.pumpWidget(DockApp(client: client));
    final terminalState = tester.state(find.byType(TerminalViewport));
    final reading = find.byKey(const ValueKey('terminal-reading-scroll'));
    await tester.drag(reading, const Offset(0, 180));
    await tester.pumpAndSettle();
    final readingScroll = find.descendant(of: reading, matching: find.byType(Scrollable)).first;
    final readingState = tester.state(readingScroll);
    await enterChat(tester);
    await tester.enterText(find.byType(TextField).last, 'Keep typing');
    final field = tester.widget<TextField>(find.byType(TextField).last);
    final controller = field.controller;
    final focus = field.focusNode!;
    final focused = focus.hasFocus;
    for (final size in [const Size(1024, 768), const Size(360, 800)]) {
      tester.view.physicalSize = size;
      await tester.pumpAndSettle();
      expect(tester.state(find.byType(TerminalViewport)), same(terminalState));
      expect(tester.state(readingScroll), same(readingState));
      final resized = tester.widget<TextField>(find.byType(TextField).last);
      expect(resized.controller, same(controller));
      expect(resized.controller!.text, 'Keep typing');
      expect(resized.focusNode, same(focus));
      expect(focus.hasFocus, focused);
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('tablet switcher omits All consoles and resize keeps the terminal visible', (tester) async {
    viewport(tester, const Size(1024, 768));
    final client = FakeDock();
    addTearDown(client.dispose);
    await tester.pumpWidget(DockApp(client: client));
    await tester.tap(find.byType(ConsoleSwitcher));
    await tester.pumpAndSettle();
    final items = tester.widgetList<PopupMenuItem<String>>(find.byType(PopupMenuItem<String>));
    expect(items.any((item) => item.value == ConsoleSwitcher.allConsoles), isFalse);
    await tester.tapAt(const Offset(1000, 700));
    await tester.pumpAndSettle();
    tester.view.physicalSize = const Size(360, 800);
    await tester.pumpAndSettle();
    expect(find.byType(TerminalViewport), findsOneWidget);
    expect(find.byType(ConsoleOverview), findsNothing);
  });

  testWidgets('cards show identity, project color, statuses and cached output', (tester) async {
    viewport(tester, const Size(600, 1600));
    final client = consoles();
    addTearDown(client.dispose);
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: ConsoleOverview(
        client: client, onSelected: (_) {}, onNewConsole: () {},
      )),
    ));
    await tester.tap(find.byKey(const ValueKey('console-filter-all')));
    await tester.pumpAndSettle();
    for (final (id, status) in [
      ('one', 'Ready'), ('two', 'Needs you'), ('three', 'Error'),
      ('four', 'Working'), ('five', 'Ended'), ('six', 'Working'), ('seven', 'Open'),
    ]) {
      final card = find.byKey(ValueKey('console-card-$id'));
      await tester.scrollUntilVisible(card, 200);
      expect(find.descendant(of: card, matching: find.text('Console $id')), findsOneWidget);
      final statusText = find.descendant(of: card, matching: find.text(status));
      expect(statusText, findsOneWidget);
      expect(tester.widget<Text>(statusText).style!.color, isNotNull);
      expect(find.descendant(of: card, matching: find.byType(AgentMark)), findsOneWidget);
      expect(find.descendant(of: card, matching: find.text('Paddock')), findsOneWidget);
      expect(tester.widget<CircleAvatar>(find.descendant(
        of: card, matching: find.byType(CircleAvatar),
      )).backgroundColor, const Color(0xff74c69a));
    }
    await tester.scrollUntilVisible(find.byKey(const ValueKey('console-card-one')), -300);
    expect(find.text('Test model · Work account'), findsOneWidget);
    expect(find.text('Last cached output'), findsOneWidget);
    expect(client.calls, isEmpty);
  });

  testWidgets('filter counts include errors and attention and default to Needs you', (tester) async {
    viewport(tester, const Size(360, 800));
    final client = consoles();
    addTearDown(client.dispose);
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: ConsoleOverview(
        client: client, onSelected: (_) {}, onNewConsole: () {},
      )),
    ));
    expect(find.text('All 7'), findsOneWidget);
    expect(find.text('Needs you 2'), findsOneWidget);
    expect(find.text('Working 2'), findsOneWidget);
    expect(find.text('Ready 1'), findsOneWidget);
    expect(tester.widget<FilterChip>(find.byKey(
      const ValueKey('console-filter-needsYou'),
    )).selected, isTrue);
    expect(find.byKey(const ValueKey('console-card-two')), findsOneWidget);
    expect(find.byKey(const ValueKey('console-card-three')), findsOneWidget);
    expect(find.byKey(const ValueKey('console-card-one')), findsNothing);
    for (final (filter, id) in [('working', 'four'), ('ready', 'one')]) {
      await tester.tap(find.byKey(ValueKey('console-filter-$filter')));
      await tester.pumpAndSettle();
      expect(find.byKey(ValueKey('console-card-$id')), findsOneWidget);
      expect(find.byKey(const ValueKey('console-card-two')), findsNothing);
    }
  });

  testWidgets('no selected console lands on overview with All selected when none need attention', (tester) async {
    viewport(tester, const Size(360, 800));
    final client = FakeDock()..selected = '';
    addTearDown(client.dispose);
    await tester.pumpWidget(DockApp(client: client));
    expect(find.byType(ConsoleOverview), findsOneWidget);
    expect(tester.widget<FilterChip>(find.byKey(
      const ValueKey('console-filter-all'),
    )).selected, isTrue);
    await tester.tap(find.byKey(const ValueKey('console-card-one')));
    await tester.pumpAndSettle();
    expect(client.selected, 'one');
    expect(find.byType(TerminalViewport), findsOneWidget);
  });

  for (final size in [const Size(360, 800), const Size(1024, 768)]) {
    testWidgets('overview retains each draft and reading position at $size', (tester) async {
      viewport(tester, size);
      final tablet = size.shortestSide >= 600;
      final client = consoles();
      addTearDown(client.dispose);
      client.screens['one']!.terminal.write(
        List.generate(200, (i) => 'History $i\r\n').join(),
      );
      client.screens['two']!.terminal.write(
        List.generate(200, (i) => 'Other history $i\r\n').join(),
      );
      await tester.pumpWidget(DockApp(client: client));
      await enterChat(tester);
      await tester.enterText(find.byType(TextField).last, 'First draft');
      await tester.tap(find.byTooltip('Collapse chat'));
      await tester.pumpAndSettle();
      final reading = find.byKey(const ValueKey('terminal-reading-scroll'));
      await tester.drag(reading, const Offset(0, 180));
      await tester.pumpAndSettle();
      final key = ConsoleDrafts.key(client.activePC, 'one');
      final position = client.drafts.position(key, 'reading');
      expect(position, greaterThanOrEqualTo(0));
      final originalScreen = client.screen;
      final callsBeforeOverview = List<String>.of(client.calls);
      if (!tablet) await showOverview(tester);
      expect(client.calls, callsBeforeOverview);
      expect(find.byType(TerminalViewport), tablet ? findsOneWidget : findsNothing);
      await tester.tap(find.byKey(const ValueKey('console-card-two')));
      await tester.pumpAndSettle();
      expect(client.selected, 'two');
      await enterChat(tester);
      await tester.enterText(find.byType(TextField).last, 'Second draft');
      await tester.tap(find.byTooltip('Collapse chat'));
      await tester.pumpAndSettle();
      await tester.drag(reading, const Offset(0, 260));
      await tester.pumpAndSettle();
      final secondKey = ConsoleDrafts.key(client.activePC, 'two');
      final secondPosition = client.drafts.position(secondKey, 'reading')!.toDouble();
      expect(secondPosition, greaterThanOrEqualTo(0));
      if (!tablet) await showOverview(tester);
      await tester.tap(find.byKey(const ValueKey('console-filter-ready')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('console-card-one')));
      await tester.pumpAndSettle();
      expect(identical(client.screen, originalScreen), isTrue);
      expect(client.drafts.position(key, 'reading'), closeTo(position!.toDouble(), 1));
      final restoredScroll = tester.state<ScrollableState>(
        find.descendant(of: reading, matching: find.byType(Scrollable)).first,
      ).position;
      expect(restoredScroll.pixels, closeTo(position.toDouble(), 1));
      await enterChat(tester);
      expect(tester.widget<TextField>(find.byType(TextField).last).controller!.text, 'First draft');
      if (!tablet) await showOverview(tester);
      await tester.tap(find.byKey(const ValueKey('console-filter-needsYou')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('console-card-two')));
      await tester.pumpAndSettle();
      final secondScroll = tester.state<ScrollableState>(
        find.descendant(of: reading, matching: find.byType(Scrollable)).first,
      ).position;
      expect(secondScroll.pixels, closeTo(secondPosition, 1));
      await enterChat(tester);
      expect(tester.widget<TextField>(find.byType(TextField).last).controller!.text, 'Second draft');
      expect(client.drafts.position(secondKey, 'reading'), closeTo(secondPosition, 1));
      expect(client.inputs, isEmpty);
      expect(client.calls.where((call) => call.startsWith('console.')), isEmpty);
    });
  }

  for (final size in [const Size(1024, 768), const Size(360, 800)]) {
    testWidgets('console layout at $size', (tester) async {
      viewport(tester, size);
      final client = consoles();
      addTearDown(client.dispose);
      await tester.pumpWidget(DockApp(client: client));
      final tablet = size.shortestSide >= 600;
      expect(find.byType(ConsoleOverview), tablet ? findsOneWidget : findsNothing);
      expect(find.byType(TerminalViewport), findsOneWidget);
      if (tablet) {
        expect(tester.getRect(find.byType(ConsoleOverview)).right,
            lessThanOrEqualTo(tester.getRect(find.byType(TerminalViewport)).left));
        await tester.tap(find.byKey(const ValueKey('console-card-two')));
        await tester.pumpAndSettle();
        expect(client.selected, 'two');
        expect(find.byType(ConsoleOverview), findsOneWidget);
        expect(find.byType(TerminalViewport), findsOneWidget);
      } else {
        await showOverview(tester);
        expect(find.byType(ConsoleOverview), findsOneWidget);
        expect(find.byType(TerminalViewport), findsNothing);
      }
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('320 px overview wraps large text without overflow', (tester) async {
    viewport(tester, const Size(320, 800));
    final client = consoles();
    addTearDown(client.dispose);
    client.state['sessions'][1]['name'] = 'A console with a long descriptive name';
    await tester.pumpWidget(MaterialApp(
      home: MediaQuery(
        data: const MediaQueryData(size: Size(320, 800), textScaler: TextScaler.linear(2)),
        child: Scaffold(body: ConsoleOverview(
          client: client, onSelected: (_) {}, onNewConsole: () {},
        )),
      ),
    ));
    for (final filter in ConsoleFilter.values) {
      await tester.tap(find.byKey(ValueKey('console-filter-${filter.name}')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('320 px app navigation and overview support large text', (tester) async {
    viewport(tester, const Size(320, 800));
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final client = consoles();
    addTearDown(client.dispose);
    await tester.pumpWidget(DockApp(client: client));
    await showOverview(tester);
    expect(find.text('Needs you 2'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tap(find.byKey(const ValueKey('console-card-two')));
    await tester.pumpAndSettle();
    expect(client.selected, 'two');
    expect(tester.takeException(), isNull);
  });
}
