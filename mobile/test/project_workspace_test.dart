import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/features/projects/project_workspace.dart';

void main() {
  final testProject = {
    'id': 'proj-alpha',
    'name': 'Alpha Project',
    'lastProgress': {'summary': 'Completed initial SSH handshake tests'},
    'goals': 'Deliver secure remote consoles',
    'nextStep': 'Verify terminal resizing',
    'milestones': [
      {'text': 'Milestone 1', 'acceptance': 'Key check passes', 'done': true},
      {'text': 'Milestone 2', 'acceptance': 'SSH reconnects', 'done': false},
    ],
  };

  Widget buildHarness({
    Map<String, dynamic>? project,
    List<dynamic> work = const [],
    List<dynamic> outputs = const [],
    Map<String, dynamic>? knowledge,
    String tab = 'overview',
    ValueChanged<String>? onTab,
    ValueChanged<Map<String, dynamic>>? onOpenOutput,
    ValueChanged<Map<String, dynamic>>? onOpenReport,
    ValueChanged<String>? onReadSection,
    VoidCallback? onLoadMore,
  }) {
    return MaterialApp(
      home: Scaffold(
        body: ProjectWorkspace(
          project: project ?? testProject,
          work: work,
          outputs: outputs,
          knowledge: knowledge,
          tab: tab,
          onTab: onTab ?? (_) {},
          onOpenOutput: onOpenOutput ?? (_) {},
          onOpenReport: onOpenReport ?? (_) {},
          onReadSection: onReadSection ?? (_) {},
          onLoadMore: onLoadMore,
        ),
      ),
    );
  }

  testWidgets('tabs invoke callback with selected key', (tester) async {
    final tappedTabs = <String>[];
    await tester.pumpWidget(
      buildHarness(tab: 'overview', onTab: tappedTabs.add),
    );

    await tester.tap(find.text('Work'));
    await tester.pumpAndSettle();
    expect(tappedTabs, contains('work'));

    await tester.tap(find.text('Outputs'));
    await tester.pumpAndSettle();
    expect(tappedTabs, contains('outputs'));

    await tester.tap(find.text('Knowledge'));
    await tester.pumpAndSettle();
    expect(tappedTabs, contains('knowledge'));

    await tester.tap(find.text('Overview'));
    await tester.pumpAndSettle();
    expect(tappedTabs, contains('overview'));
  });

  testWidgets(
    'overview prioritizes lastProgress summary and supports milestones',
    (tester) async {
      await tester.pumpWidget(buildHarness(tab: 'overview'));

      expect(find.text('Latest progress'), findsOneWidget);
      expect(
        find.text('Completed initial SSH handshake tests'),
        findsOneWidget,
      );
      expect(find.text('Goals'), findsOneWidget);
      expect(find.text('Next step'), findsOneWidget);

      expect(find.text('Milestones (1/2)'), findsOneWidget);
      // Expand milestones
      await tester.tap(find.text('Milestones (1/2)'));
      await tester.pumpAndSettle();
      expect(find.text('Milestone 1'), findsOneWidget);
      expect(find.text('Milestone 2'), findsOneWidget);
    },
  );

  testWidgets('scope foreign work and open report on execution history', (
    tester,
  ) async {
    final reportsOpened = <Map<String, dynamic>>[];
    final workList = [
      {
        'id': 'w-1',
        'projectId': 'proj-alpha',
        'title': 'Local Alpha Task',
        'state': 'running',
        'criteria': 'Pass bounds check',
        'implementer': {'model': 'sol-base'},
        'size': 'M',
        'executionHistory': {'kind': 'task', 'id': 'task-101', 'revision': 1},
      },
      {
        'id': 'w-foreign',
        'projectId': 'proj-other',
        'title': 'Foreign Host Task',
        'state': 'queued',
      },
    ];

    await tester.pumpWidget(
      buildHarness(
        tab: 'work',
        work: workList,
        onOpenReport: reportsOpened.add,
      ),
    );

    expect(find.text('Local Alpha Task'), findsOneWidget);
    expect(find.text('Foreign Host Task'), findsNothing);

    // Expand the task card
    await tester.tap(find.text('Local Alpha Task'));
    await tester.pumpAndSettle();

    expect(find.text('Criteria: Pass bounds check'), findsOneWidget);
    expect(find.text('Assigned model: sol-base'), findsOneWidget);
    expect(find.text('Size: M'), findsOneWidget);

    // Tap report button
    await tester.tap(find.text('Report'));
    await tester.pumpAndSettle();
    expect(reportsOpened.length, 1);
    expect(reportsOpened.first['id'], 'w-1');
  });

  testWidgets('scope foreign outputs and trigger onOpenOutput', (tester) async {
    final outputsOpened = <Map<String, dynamic>>[];
    final outputList = [
      {
        'id': 'out-1',
        'projectId': 'proj-alpha',
        'title': 'Connection Spec',
        'summary': 'Protocol documentation v1',
      },
      {
        'id': 'out-foreign',
        'projectId': 'proj-beta',
        'title': 'Foreign Spec',
        'summary': 'Do not show',
      },
    ];

    await tester.pumpWidget(
      buildHarness(
        tab: 'outputs',
        outputs: outputList,
        onOpenOutput: outputsOpened.add,
      ),
    );

    expect(find.text('Connection Spec'), findsOneWidget);
    expect(find.text('Protocol documentation v1'), findsOneWidget);
    expect(find.text('Foreign Spec'), findsNothing);

    await tester.tap(find.text('Connection Spec'));
    await tester.pumpAndSettle();
    expect(outputsOpened.length, 1);
    expect(outputsOpened.first['id'], 'out-1');
  });

  testWidgets('knowledge off hides records and displays off message', (
    tester,
  ) async {
    await tester.pumpWidget(
      buildHarness(
        tab: 'knowledge',
        knowledge: {
          'mode': 'off',
          'items': [
            {'id': 'sec-secret', 'title': 'Secret Knowledge Doc'},
          ],
        },
      ),
    );

    expect(find.text('Project knowledge is off.'), findsOneWidget);
    expect(find.text('Secret Knowledge Doc'), findsNothing);
  });

  testWidgets(
    'knowledge active displays entries, explicit unverified, and load more',
    (tester) async {
      final sectionsRead = <String>[];
      var moreRequested = false;

      await tester.pumpWidget(
        buildHarness(
          tab: 'knowledge',
          knowledge: {
            'mode': 'active',
            'status': 'Synchronized',
            'error': 'Network timeout warning',
            'nextCursor': 'cursor-page-2',
            'items': [
              {'id': 'sec-1', 'title': 'Remote Setup Guide', 'verified': true},
              {
                'id': 'sec-2',
                'title': 'Draft Migration Notes',
                'verified': false,
              },
            ],
          },
          onReadSection: sectionsRead.add,
          onLoadMore: () => moreRequested = true,
        ),
      );

      expect(find.text('Status: Synchronized'), findsNothing);
      expect(find.text('Error: Network timeout warning'), findsOneWidget);
      expect(find.text('Remote Setup Guide'), findsOneWidget);
      expect(find.text('Draft Migration Notes'), findsOneWidget);
      expect(find.text('Unverified'), findsNWidgets(2));
      expect(find.text('Load more'), findsOneWidget);

      await tester.tap(find.text('Remote Setup Guide'));
      await tester.pumpAndSettle();
      expect(sectionsRead, contains('sec-1'));

      await tester.tap(find.text('Load more'));
      await tester.pumpAndSettle();
      expect(moreRequested, isTrue);
    },
  );

  for (final width in [200.0, 280.0, 360.0]) {
    testWidgets('narrow width $width renders without layout overflow', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        buildHarness(
          tab: 'overview',
          work: [
            {
              'id': 'w-1',
              'projectId': 'proj-alpha',
              'title': 'Long task title that could potentially overflow on narrow viewports',
              'state': 'in progress',
            },
          ],
          outputs: [
            {
              'id': 'o-1',
              'projectId': 'proj-alpha',
              'title': 'Long output title with lots of details',
              'summary': 'Detailed summary description that spans multiple lines cleanly',
            },
          ],
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
    'application overview shows source drift and reads its stable section ID',
    (tester) async {
      final reads = <String>[];
      await tester.pumpWidget(
        buildHarness(
          knowledge: {
            'mode': 'read',
            'application': {
              'overviews': [
                {
                  'id': 'sec_overview_demo',
                  'title': 'Application overview',
                  'summary': 'The desktop sends commands to the local host.',
                  'evidence': 'changed',
                },
              ],
            },
          },
          onReadSection: reads.add,
        ),
      );
      expect(find.text('Application'), findsOneWidget);
      expect(
        find.text('Source changed. This overview needs updating.'),
        findsOneWidget,
      );
      await tester.tap(find.text('Read overview'));
      expect(reads, ['sec_overview_demo']);
    },
  );

  testWidgets('Off suppresses a previously loaded application overview', (
    tester,
  ) async {
    await tester.pumpWidget(
      buildHarness(
        knowledge: {
          'mode': 'off',
          'application': {
            'overviews': [
              {
                'id': 'sec_overview_demo',
                'summary': 'Cached source interpretation.',
                'evidence': 'matches',
              },
            ],
          },
        },
      ),
    );
    expect(find.text('Cached source interpretation.'), findsNothing);
    expect(find.text('Read overview'), findsNothing);
  });
}
