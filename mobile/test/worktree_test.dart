import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/console_actions.dart';
import 'package:agent_dock_mobile/console_overview.dart';
import 'package:agent_dock_mobile/console_switcher.dart';
import 'package:agent_dock_mobile/worktree_badge.dart';

import 'widget_test.dart' show FakeDock;

class WorktreeDock extends FakeDock {
  WorktreeDock() {
    state['capabilities'] = ['console.agents', 'console.worktree'];
    state['sessions'][0]['worktree'] = {
      'branch': 'paddock/test-123', 'path': r'C:\Paddock\worktrees\test',
    };
  }

  @override
  Future<dynamic> request(String method, [Map<String, dynamic> payload = const {}]) async {
    if (method == 'console.agents') {
      return {
        'defaultProvider': '', 'defaultFolder': r'C:\repo', 'agents': <Map<String, dynamic>>[],
        'projects': [
          {'id': 'p', 'name': 'Project', 'folders': [
            {'label': 'Root', 'path': r'C:\repo'},
            {'label': 'Subfolder', 'path': r'C:\repo\sub'},
          ]},
        ],
      };
    }
    if (method == 'console.worktree.root') return {'root': payload['folderIndex'] != 1};
    return super.request(method, payload);
  }
}

void main() {
  testWidgets('worktree switch follows the selected repository root and resets', (tester) async {
    final client = WorktreeDock();
    addTearDown(client.dispose);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: NewConsoleSheet(client: client))));
    await tester.pumpAndSettle();
    expect(find.text('Isolated worktree'), findsOneWidget);
    expect(tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value, isFalse);
    await tester.tap(find.text('Isolated worktree'));
    await tester.pumpAndSettle();
    expect(tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value, isTrue);
    await tester.tap(find.text('No project \u00b7 default folder'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Project').last);
    await tester.pumpAndSettle();
    expect(tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value, isFalse);
    await tester.tap(find.text('Root'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Subfolder').last);
    await tester.pumpAndSettle();
    expect(find.text('Isolated worktree'), findsNothing);
  });

  testWidgets('worktree badge appears in overview, switcher and selected header', (tester) async {
    final client = WorktreeDock();
    addTearDown(client.dispose);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: Column(children: [
      ConsoleSwitcher(client: client, name: 'Trader', onOpened: () {}, onSelected: (_) {}),
      Expanded(child: ConsoleOverview(client: client, onSelected: (_) {}, onNewConsole: () {})),
    ]))));
    await tester.pumpAndSettle();
    expect(find.byType(WorktreeBadge), findsNWidgets(2));
    expect(find.byTooltip(r'Git worktree: C:\Paddock\worktrees\test'), findsNWidgets(2));
    await tester.tap(find.byType(ConsoleSwitcher));
    await tester.pumpAndSettle();
    expect(find.byType(WorktreeBadge), findsNWidgets(3));
    expect(find.text('paddock/test-123'), findsNWidgets(3));
  });
}
