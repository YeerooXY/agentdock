import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/build_counts.dart';
import 'package:agent_dock_mobile/console_theme.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/projects_page.dart';

import 'projects_page_test.dart' show ProjectsDock;
import 'widget_test.dart' show FakeDock;

void packet(DockClientLike c, int n) => c.handleMessage(
  jsonEncode({
    'type': 'terminal',
    'id': 'one',
    'data': 'Live output $n\r\n',
    'cols': 80,
    'rows': 24,
    'sequence': n,
    'epoch': 1,
    'reset': false,
  }),
);

typedef DockClientLike = FakeDock;

void main() {
  setUp(BuildCounts.reset);

  testWidgets('terminal output rebuilds only its own terminal', (tester) async {
    tester.view.physicalSize = const Size(393, 852);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final c = FakeDock();
    addTearDown(c.dispose);
    c.appearance = const ConsoleAppearance(ambientMotion: false);
    await tester.pumpWidget(DockApp(client: c));
    await tester.pump();
    packet(c, 0); // first packet may rebuild shell once
    await tester.pump();
    final theme = BuildCounts.of('app.theme'),
        home = BuildCounts.of('app.home'),
        shell = BuildCounts.of('shell'),
        terminal = BuildCounts.of('terminal');
    var general = 0;
    c.addListener(() => general++);
    for (var i = 1; i <= 20; i++) {
      packet(c, i);
      await tester.pump();
    }
    expect(general, 0, reason: 'output must not notify the whole client');
    expect(BuildCounts.of('app.theme'), theme);
    expect(BuildCounts.of('app.home'), home);
    expect(BuildCounts.of('shell'), shell);
    expect(BuildCounts.of('terminal'), greaterThan(terminal));
    expect(c.terminalSignal('one').count, greaterThanOrEqualTo(21));
  });

  testWidgets(
    'typing preserves the draft without rebuilding DockHome',
    (tester) async {
      tester.view.physicalSize = const Size(393, 852);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = FakeDock();
      addTearDown(c.dispose);
      await tester.pumpWidget(DockApp(client: c));
      await tester.pump();
      await tester.tap(find.byType(TextField).last);
      await tester.pumpAndSettle();
      final shell = BuildCounts.of('shell');
      await tester.enterText(find.byType(TextField).last, 'abc');
      await tester.pump();
      expect(BuildCounts.of('shell'), shell);
      expect(c.drafts.get('["","one"]'), 'abc');
      expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        'abc',
      );
    },
  );

  testWidgets('Projects does not rebuild on terminal output', (tester) async {
    tester.view.physicalSize = const Size(393, 852);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final c = ProjectsDock();
    addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c));
    await tester.pump();
    await tester.tap(find.widgetWithText(NavigationDestination, 'Projects'));
    await tester.pumpAndSettle();
    expect(find.byType(ProjectsPage), findsOneWidget);
    final projects = BuildCounts.of('projects'),
        shell = BuildCounts.of('shell'),
        home = BuildCounts.of('app.home');
    packet(c, 0);
    await tester.pump();
    final afterFirst = BuildCounts.of('projects');
    for (var i = 1; i <= 20; i++) {
      packet(c, i);
      await tester.pump();
    }
    expect(BuildCounts.of('projects'), afterFirst);
    expect(afterFirst, greaterThanOrEqualTo(projects));
    expect(BuildCounts.of('app.home'), home);
    expect(BuildCounts.of('shell'), lessThanOrEqualTo(shell + 1));
  });

  test('signals are keyed by PC, session and launch', () {
    final c = FakeDock();
    addTearDown(c.dispose);
    final before = c.terminalSignal('one');
    expect(c.terminalSignal('one'), same(before));
    c.state = {
      'sessions': [
        {...c.sessions.single, 'launchId': 'l2'},
      ],
    };
    expect(c.terminalSignal('one'), isNot(same(before)));
    expect(c.terminalKey('one'), 'null:one:l2'.replaceFirst('null', c.activePC));
  });

  test('connection, appearance and selection signals fire only on their own change', () {
    final c = FakeDock();
    addTearDown(c.dispose);
    c.notifyListeners();
    final conn = c.connectionSignal.count,
        look = c.appearanceSignal.count,
        sel = c.selectionSignal.count;
    c.notifyListeners();
    expect([c.connectionSignal.count, c.appearanceSignal.count, c.selectionSignal.count], [conn, look, sel]);
    c.selected = 'other';
    c.notifyListeners();
    expect([c.connectionSignal.count, c.appearanceSignal.count, c.selectionSignal.count], [conn, look, sel + 1]);
    c.connected = false;
    c.notifyListeners();
    expect(c.connectionSignal.count, conn + 1);
    c.appearance = const ConsoleAppearance(themeId: 'cyber');
    c.notifyListeners();
    expect(c.appearanceSignal.count, look + 1);
  });
}
