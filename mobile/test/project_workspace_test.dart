import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/features/projects/project_workspace.dart';

void main() {
  Widget buildHarness({
    Map<String, dynamic>? knowledge,
    ValueChanged<String>? onReadSection,
    VoidCallback? onLoadMore,
  }) => MaterialApp(
    home: Scaffold(
      body: ProjectWorkspace(
        knowledge: knowledge,
        onReadSection: onReadSection ?? (_) {},
        onLoadMore: onLoadMore,
      ),
    ),
  );

  testWidgets('knowledge off hides records and displays off message', (
    tester,
  ) async {
    await tester.pumpWidget(
      buildHarness(
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
}
