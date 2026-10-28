import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/console_switcher.dart';

import 'widget_test.dart' show FakeDock, consoleAction, enterChat;

FakeDock managedDock() {
  final c = FakeDock();
  c.state['capabilities'] = ['console.manage'];
  c.state['projects'] = [
    {'id': 'game', 'name': 'Game'},
    {'id': 'tools', 'name': 'Tools'},
  ];
  c.state['sessions'] = [
    Map<String, Object?>.from((c.state['sessions'] as List).first as Map),
  ];
  (c.state['sessions'] as List).first.addAll({
    'alive': true,
    'consoleKey': 'stable-console',
    'launchId': 'launch-one',
    'projectId': 'game',
  });
  return c;
}

void main() {
  testWidgets('rename sends pinned identity and preserves the draft and view', (
    tester,
  ) async {
    final c = managedDock();
    addTearDown(c.dispose);
    c.screen!.terminal.write('\r\n${'Output line\r\n' * 150}');
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    await tester.enterText(find.byType(TextField).last, 'Unsent draft');
    await tester.pumpAndSettle();
    final scroll = tester.widget<SingleChildScrollView>(
      find.byKey(const ValueKey('terminal-reading-scroll')),
    ).controller!;
    scroll.jumpTo(120);
    final screen = c.screen;
    final terminal = screen!.terminal;
    await consoleAction(tester, 'Rename');
    expect(find.text('Trader'), findsWidgets);
    final field = find.descendant(
      of: find.byType(AlertDialog),
      matching: find.byType(TextField),
    );
    expect(tester.widget<TextField>(field).controller!.text, 'Trader');
    await tester.enterText(field, ' Review ');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    final index = c.calls.indexOf('console.rename');
    expect(index, greaterThanOrEqualTo(0));
    expect(c.payloads[index], {
      'id': 'one',
      'consoleKey': 'stable-console',
      'launchId': 'launch-one',
      'name': 'Review',
    });
    c.state['sessions'][0]['name'] = 'Review';
    c.notifyListeners();
    await tester.pumpAndSettle();
    expect(c.screen, same(screen));
    expect(c.screen!.terminal, same(terminal));
    expect(scroll.offset, 120);
    expect(
      tester.widget<TextField>(find.byType(TextField).last).controller!.text,
      'Unsent draft',
    );
    expect(c.inputs, isEmpty);
    expect(c.calls, isNot(contains('console.create')));
    expect(c.calls, isNot(contains('console.close')));
  });

  testWidgets('empty or whitespace name cannot save', (tester) async {
    final c = managedDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await consoleAction(tester, 'Rename');
    final field = find.descendant(
      of: find.byType(AlertDialog),
      matching: find.byType(TextField),
    );
    for (final name in ['', '   ']) {
      await tester.enterText(field, name);
      await tester.pump();
      expect(
        tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Save'))
            .onPressed,
        isNull,
      );
    }
    expect(c.calls, isNot(contains('console.rename')));
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
  });

  testWidgets('project marks the current choice and sends link and unlink', (
    tester,
  ) async {
    final c = managedDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await enterChat(tester);
    await tester.enterText(find.byType(TextField).last, 'Project draft');
    final screen = c.screen;
    await consoleAction(tester, 'Project');
    expect(tester.widget<ListTile>(find.widgetWithText(ListTile, 'Game'))
        .selected, isTrue);
    expect(tester.widget<ListTile>(find.widgetWithText(ListTile, 'No project'))
        .selected, isFalse);
    await tester.tap(find.text('Tools'));
    await tester.pumpAndSettle();
    expect(c.screen, same(screen));
    expect(
      tester.widget<TextField>(find.byType(TextField).last).controller!.text,
      'Project draft',
    );
    expect(c.payloads[c.calls.lastIndexOf('console.project')], {
      'id': 'one',
      'consoleKey': 'stable-console',
      'launchId': 'launch-one',
      'projectId': 'tools',
    });
    c.state['sessions'][0]['projectId'] = 'tools';
    c.notifyListeners();
    await tester.pumpAndSettle();
    await consoleAction(tester, 'Project');
    await tester.tap(find.text('No project'));
    await tester.pumpAndSettle();
    expect(c.payloads[c.calls.lastIndexOf('console.project')], {
      'id': 'one',
      'consoleKey': 'stable-console',
      'launchId': 'launch-one',
      'projectId': null,
    });
    c.state['sessions'][0].remove('projectId');
    c.notifyListeners();
    await tester.pumpAndSettle();
    await consoleAction(tester, 'Project');
    expect(tester.widget<ListTile>(find.widgetWithText(ListTile, 'No project'))
        .selected, isTrue);
  });

  testWidgets('old hosts hide console management', (tester) async {
    final c = FakeDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await tester.tap(find.byTooltip('More options'));
    await tester.pumpAndSettle();
    expect(find.text('Rename'), findsNothing);
    expect(find.text('Project'), findsNothing);
  });

  testWidgets('management without a pinned console shows the stale message', (
    tester,
  ) async {
    final c = managedDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    final menu = tester.widget<PopupMenuButton<String>>(
      find.byWidgetPredicate((widget) =>
          widget is PopupMenuButton<String> &&
          widget.tooltip == 'More options'),
    );
    for (final action in ['rename', 'project']) {
      menu.onSelected!(action);
      await tester.pumpAndSettle();
      expect(find.text('This console changed. Open its menu again.'),
          findsOneWidget);
      ScaffoldMessenger.of(tester.element(find.byType(Scaffold).first))
          .removeCurrentSnackBar();
      await tester.pumpAndSettle();
    }
    expect(c.calls, isNot(contains('console.rename')));
    expect(c.calls, isNot(contains('console.project')));
  });

  testWidgets('host stale-console error is shown', (tester) async {
    final c = managedDock();
    addTearDown(c.dispose);
    c.onRequest = (method, _) async {
      if (method == 'console.rename') {
        throw StateError('This console changed. Open its menu again.');
      }
    };
    await tester.pumpWidget(DockApp(client: c));
    await consoleAction(tester, 'Rename');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.text('This console changed. Open its menu again.'),
        findsOneWidget);
  });

  testWidgets('remote console management sends a null launch id', (tester) async {
    final c = managedDock();
    addTearDown(c.dispose);
    c.state['sessions'][0]['launchId'] = null;
    c.state['sessions'][0]['remote'] = {'hostId': 'vm'};
    await tester.pumpWidget(DockApp(client: c));
    await consoleAction(tester, 'Rename');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(c.payloads[c.calls.lastIndexOf('console.rename')], {
      'id': 'one',
      'consoleKey': 'stable-console',
      'launchId': null,
      'name': 'Trader',
    });
    await consoleAction(tester, 'Project');
    await tester.tap(find.text('No project'));
    await tester.pumpAndSettle();
    expect(c.payloads[c.calls.lastIndexOf('console.project')], {
      'id': 'one',
      'consoleKey': 'stable-console',
      'launchId': null,
      'projectId': null,
    });
  });

  testWidgets('an archived project remains marked and can be unlinked', (
    tester,
  ) async {
    final c = managedDock();
    addTearDown(c.dispose);
    c.state['sessions'][0]['projectId'] = 'archived';
    await tester.pumpWidget(DockApp(client: c));
    await consoleAction(tester, 'Project');
    final archived = tester.widget<ListTile>(
      find.widgetWithText(ListTile, 'Archived project'),
    );
    expect(archived.enabled, isFalse);
    expect(archived.selected, isTrue);
    expect(archived.trailing, isA<Icon>());
    expect(tester.widget<ListTile>(find.widgetWithText(ListTile, 'No project'))
        .selected, isFalse);
    await tester.tap(find.text('No project'));
    await tester.pumpAndSettle();
    expect(c.payloads[c.calls.lastIndexOf('console.project')]['projectId'],
        isNull);
  });

  testWidgets('a replaced launch cannot receive an open dialog action', (
    tester,
  ) async {
    final c = managedDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await consoleAction(tester, 'Rename');
    c.state['sessions'][0]['launchId'] = 'replacement';
    c.notifyListeners();
    await tester.pump();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(c.calls, isNot(contains('console.rename')));
    expect(find.text('This console changed. Open its menu again.'),
        findsOneWidget);
  });

  testWidgets('console switcher displays the project name', (tester) async {
    final c = managedDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    expect(find.descendant(
      of: find.byType(ConsoleSwitcher),
      matching: find.text('Game'),
    ), findsOneWidget);
    await tester.tap(find.byTooltip('Switch console'));
    await tester.pumpAndSettle();
    expect(find.descendant(
      of: find.byType(PopupMenuItem<String>),
      matching: find.text('Game'),
    ), findsOneWidget);
  });
}
