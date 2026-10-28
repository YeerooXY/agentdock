import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/projects_page.dart';

import 'widget_test.dart' show FakeDock;

class ProjectsDock extends FakeDock {
  bool empty = false, fail = false, failConsole = false;
  Completer<dynamic>? delayed;
  final project = <String, dynamic>{
    'id': 'phone', 'name': 'Phone companion', 'color': '#89b4ff',
    'status': 'planning', 'goals': 'Read project progress',
    'nextStep': 'Review the milestone acceptance criteria',
    'progress': {'done': 1, 'total': 2},
    'milestones': [
      {'text': 'Project cards', 'acceptance': 'Cards show progress', 'done': true},
      {'text': 'Project details', 'acceptance': 'Show milestones and plans', 'done': false},
    ],
    'notes': 'Latest progress note',
    'plan': {'revision': 7, 'sections': [
      {'name': 'brief', 'state': 'approved'},
      {'name': 'research', 'state': 'proposal waiting'},
      {'name': 'infrastructure', 'state': 'not needed'},
      {'name': 'roadmap', 'state': 'empty'},
    ]},
    'consoles': [{'id': 'two', 'name': 'Project console'}],
  };

  ProjectsDock({bool supported = true}) {
    state['capabilities'] = [if (supported) 'projects.read'];
    state['sessions'] = [
      ...sessions,
      {'id': 'two', 'name': 'Project console', 'provider': 'shell', 'slot': 2, 'state': 'ready', 'alive': true},
    ];
  }

  @override
  Future<dynamic> request(String method, [Map<String, dynamic> payload = const {}]) async {
    if (method == 'subscribe' && failConsole) throw StateError('Console unavailable');
    if (method.startsWith('projects.')) {
      calls.add(method);
      payloads.add(Map.of(payload));
      if (fail) throw StateError('Unavailable');
      if (delayed != null) return delayed!.future;
      return method == 'projects.list' ? (empty ? [] : [project]) : project;
    }
    return super.request(method, payload);
  }
}

Future<void> showProjects(WidgetTester tester, ProjectsDock client, {double scale = 1}) async {
  tester.view.physicalSize = const Size(320, 780);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
      child: child!,
    ),
    home: Scaffold(body: ProjectsPage(client: client, onConsoleSelected: () {})),
  ));
  await tester.pumpAndSettle();
}

Future<void> openDetail(WidgetTester tester) async {
  await tester.tap(find.text('Phone companion'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('project cards show name, color, status, next step and progress', (tester) async {
    final client = ProjectsDock();
    addTearDown(client.dispose);
    await showProjects(tester, client);
    expect(find.text('Phone companion'), findsOneWidget);
    expect(find.text('Planning'), findsOneWidget);
    expect(find.text('Review the milestone acceptance criteria'), findsOneWidget);
    expect(find.text('1 of 2 milestones'), findsOneWidget);
    expect(tester.widget<CircleAvatar>(find.byType(CircleAvatar)).backgroundColor, const Color(0xff89b4ff));
    expect(tester.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator)).value, .5);
  });

  testWidgets('detail shows read-only milestones, recent notes and all plan states', (tester) async {
    final client = ProjectsDock();
    addTearDown(client.dispose);
    await showProjects(tester, client);
    await openDetail(tester);
    expect(find.text('Planning'), findsOneWidget);
    expect(find.text('Read project progress'), findsOneWidget);
    expect(find.text('Project cards'), findsOneWidget);
    expect(find.byIcon(Icons.check_box_outlined), findsOneWidget);
    expect(find.byIcon(Icons.check_box_outline_blank), findsOneWidget);
    expect(find.byType(Checkbox), findsNothing);
    await tester.scrollUntilVisible(find.text('Roadmap: Empty'), 250);
    expect(find.text('Latest progress note'), findsOneWidget);
    expect(find.text('Revision 7'), findsOneWidget);
    expect(find.text('Brief: Approved'), findsOneWidget);
    expect(find.text('Research: Proposal waiting'), findsOneWidget);
    expect(find.text('Setup: Not needed'), findsOneWidget);
    expect(find.text('Roadmap: Empty'), findsOneWidget);
    expect(client.payloads.last, {'id': 'phone'});
  });

  testWidgets('detail lists approved decisions and how many await the PC', (tester) async {
    final client = ProjectsDock();
    addTearDown(client.dispose);
    client.project['decisions'] = [
      {'text': 'Use Godot 4, not Unity', 'reason': 'Smaller builds'},
    ];
    client.project['decisionsWaiting'] = 2;
    await showProjects(tester, client);
    await openDetail(tester);
    await tester.scrollUntilVisible(find.text('Use Godot 4, not Unity'), 250);
    expect(find.text('Smaller builds'), findsOneWidget);
    expect(find.text('2 proposed by agents. Review them in Projects on your PC.'), findsOneWidget);
  });

  testWidgets('linked console tap selects it and returns to Console', (tester) async {
    final client = ProjectsDock();
    addTearDown(client.dispose);
    await tester.pumpWidget(DockApp(client: client));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(NavigationDestination, 'Projects'));
    await tester.pumpAndSettle();
    await openDetail(tester);
    await tester.scrollUntilVisible(find.text('Project console'), 250);
    await tester.tap(find.text('Project console'));
    await tester.pumpAndSettle();
    expect(client.selected, 'two');
    expect(find.byType(ProjectsPage), findsNothing);
    expect(client.streaming, isTrue);
    expect(client.calls.where((m) => m.startsWith('projects.')), ['projects.list', 'projects.detail']);
  });

  testWidgets('empty list supports pull to refresh', (tester) async {
    final client = ProjectsDock()..empty = true;
    addTearDown(client.dispose);
    await showProjects(tester, client);
    expect(find.text('No projects.'), findsOneWidget);
    client.empty = false;
    await tester.drag(find.byType(ListView), const Offset(0, 350));
    await tester.pumpAndSettle();
    expect(find.text('Phone companion'), findsOneWidget);
    expect(client.calls.where((m) => m == 'projects.list').length, 2);
  });

  testWidgets('load errors have a working retry', (tester) async {
    final client = ProjectsDock()..fail = true;
    addTearDown(client.dispose);
    await showProjects(tester, client);
    expect(find.text('Could not load projects. Try again.'), findsOneWidget);
    client.fail = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Phone companion'), findsOneWidget);
  });

  testWidgets('old host hides Projects destination', (tester) async {
    final client = ProjectsDock(supported: false);
    addTearDown(client.dispose);
    await tester.pumpWidget(DockApp(client: client));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(NavigationDestination, 'Projects'), findsNothing);
    expect(client.calls.where((m) => m.startsWith('projects.')), isEmpty);
  });

  testWidgets('losing Projects capability returns to Console with streaming', (tester) async {
    final client = ProjectsDock();
    addTearDown(client.dispose);
    await tester.pumpWidget(DockApp(client: client));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(NavigationDestination, 'Projects'));
    await tester.pumpAndSettle();
    expect(client.streaming, isFalse);
    client.state['capabilities'] = [];
    client.notifyListeners();
    await tester.pumpAndSettle();
    expect(find.byType(ProjectsPage), findsNothing);
    expect(find.widgetWithText(NavigationDestination, 'Projects'), findsNothing);
    expect(client.streaming, isTrue);
    expect(tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex, 0);
    expect(client.calls.last, 'subscribe');
    expect(client.payloads.last['id'], client.selected);
  });

  for (final stale in [true, false]) {
    testWidgets('${stale ? 'stale' : 'failed'} linked console preserves detail', (tester) async {
      final client = ProjectsDock();
      addTearDown(client.dispose);
      await showProjects(tester, client);
      await openDetail(tester);
      if (stale) {
        client.state['sessions'] = client.sessions.where((s) => s['id'] != 'two').toList();
      } else {
        client.failConsole = true;
      }
      await tester.scrollUntilVisible(find.text('Project console'), 250);
      await tester.tap(find.text('Project console'));
      await tester.pumpAndSettle();
      expect(find.byType(SnackBar), findsOneWidget);
      expect(find.text(stale
          ? 'This console is no longer open. Refresh the project.'
          : 'Could not open console. Check the connection and try again.'), findsOneWidget);
      expect(find.text('Project console'), findsOneWidget);
      expect(find.text('Retry'), findsNothing);
      await tester.scrollUntilVisible(find.text('Goals'), -250);
      expect(find.text('Read project progress'), findsOneWidget);
    });
  }

  testWidgets('reconnect preserves detail and reloads automatically, ignoring old replies', (tester) async {
    final client = ProjectsDock();
    addTearDown(client.dispose);
    await showProjects(tester, client);
    await openDetail(tester);
    final oldResponse = Completer<dynamic>();
    final staleProject = {...client.project, 'goals': 'Stale goals'};
    client.delayed = oldResponse;
    // RefreshIndicator's arming distance scales with the viewport. Pull its
    // scrollable far enough, then start and advance the snap animation before
    // checking onRefresh. The delayed reply prevents pumpAndSettle here.
    final scrollable = find.descendant(
      of: find.byType(RefreshIndicator), matching: find.byType(ListView),
    );
    await tester.fling(scrollable, const Offset(0, 1400), 2500);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
    expect(client.calls.where((m) => m == 'projects.detail').length, 2);
    client.connected = false;
    client.generation++;
    client.notifyListeners();
    await tester.pump();
    expect(find.text('Read project progress'), findsOneWidget);
    expect(find.text('Connection changed. Refresh projects.'), findsNothing);
    client.delayed = null;
    client.project['goals'] = 'Updated after reconnect';
    client.connected = true;
    client.generation++;
    client.notifyListeners();
    // The pull-to-refresh indicator still awaits the original request.
    await tester.pump();
    expect(find.text('Updated after reconnect'), findsOneWidget);
    expect(client.calls.where((m) => m == 'projects.detail').length, 3);
    oldResponse.complete(staleProject);
    await tester.pumpAndSettle();
    expect(find.text('Updated after reconnect'), findsOneWidget);
    expect(find.text('Stale goals'), findsNothing);
    expect(find.text('Connection changed. Refresh projects.'), findsNothing);
  });

  testWidgets('changing paired PC clears data and reports the change', (tester) async {
    final client = ProjectsDock();
    addTearDown(client.dispose);
    await showProjects(tester, client);
    await openDetail(tester);
    client.pairing = {...client.pairing!, 'pin': 'another-pc'};
    client.generation++;
    client.notifyListeners();
    await tester.pumpAndSettle();
    expect(find.text('Connection changed. Refresh projects.'), findsOneWidget);
    expect(find.text('Phone companion'), findsNothing);
    expect(find.text('Read project progress'), findsNothing);
  });

  for (final status in {'active': 'Active', 'paused': 'Paused', 'complete': 'Complete'}.entries) {
    testWidgets('list and detail show desktop status ${status.value}', (tester) async {
      final client = ProjectsDock();
      addTearDown(client.dispose);
      client.project['status'] = status.key;
      await showProjects(tester, client);
      expect(find.text(status.value), findsOneWidget);
      await openDetail(tester);
      expect(find.text(status.value), findsOneWidget);
    });
  }

  testWidgets('back ignores a late detail response', (tester) async {
    final client = ProjectsDock();
    addTearDown(client.dispose);
    await showProjects(tester, client);
    final response = Completer<dynamic>();
    client.delayed = response;
    await tester.tap(find.text('Phone companion'));
    await tester.pump();
    client.delayed = null;
    await tester.tap(find.text('Projects'));
    await tester.pumpAndSettle();
    response.complete(client.project);
    await tester.pumpAndSettle();
    expect(find.text('Phone companion'), findsOneWidget);
    expect(find.text('Goals'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('detail supports pull to refresh', (tester) async {
    final client = ProjectsDock();
    addTearDown(client.dispose);
    await showProjects(tester, client);
    await openDetail(tester);
    client.project['goals'] = 'Updated project goals';
    await tester.drag(find.byType(ListView), const Offset(0, 350));
    await tester.pumpAndSettle();
    expect(find.text('Updated project goals'), findsOneWidget);
    expect(client.calls.where((m) => m == 'projects.detail').length, 2);
  });

  testWidgets('320 px list and detail wrap at large text sizes', (tester) async {
    final client = ProjectsDock();
    addTearDown(client.dispose);
    client.project['name'] = 'Phone companion project with a long descriptive name';
    await showProjects(tester, client, scale: 2);
    expect(tester.takeException(), isNull);
    await tester.tap(find.text(client.project['name'] as String));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(find.text('Project console'), 250);
    expect(tester.takeException(), isNull);
  });

  testWidgets('narrow large-text navigation includes Projects without overflow', (tester) async {
    final client = ProjectsDock();
    addTearDown(client.dispose);
    tester.view.physicalSize = const Size(320, 780);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await tester.pumpWidget(DockApp(client: client));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(NavigationDestination, 'Projects'));
    await tester.pumpAndSettle();
    expect(find.byType(ProjectsPage), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
