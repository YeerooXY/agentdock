import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/results_page.dart';

import 'widget_test.dart' show FakeDock;

Map<String, dynamic> result(String id, String title, {
  String ext = '.md', String project = 'game', String console = 'studio',
  String summary = '', String kind = 'report',
}) => {
  'id': id, 'title': title, 'ext': ext, 'image': ext == '.png',
  'projectId': project, 'consoleKey': console,
  'consoleName': console == 'studio' ? 'Studio' : 'Review console',
  'summary': summary, 'kind': kind, 'groupId': id,
  'at': 1700000000000, 'size': 100, 'seenAt': null,
};

class ResultsDock extends FakeDock {
  final rows = <Map<String, dynamic>>[
    result('a', 'Alpha document', summary: 'Pairing notes'),
    result('b', 'Beta document', project: 'tools', console: 'review'),
    result('c', 'Changed code', kind: 'code', ext: '.json'),
    result('d', 'Landscape', ext: '.png'),
    result('e', 'Model', ext: '.glb'),
  ];
  final previews = <String>[];
  final deletions = <Map<String, dynamic>>[];
  int seen = 0;
  final seenRequests = <Map<String, dynamic>>[];
  Completer<dynamic>? thumbnail;
  bool failDelete = false;
  ResultsDock({bool modern = true}) {
    state['capabilities'] = modern ? ['results.thumbnails', 'results.actions'] : [];
    state['projects'] = [
      {'id': 'game', 'name': 'Game'},
      {'id': 'tools', 'name': 'Tools'},
    ];
  }

  @override
  Future<dynamic> request(String method, [Map<String, dynamic> payload = const {}]) async {
    if (method == 'results.list') return rows;
    if (method == 'results.preview') {
      previews.add(payload['id'] as String);
      if (payload['id'] == 'd' && thumbnail != null) return thumbnail!.future;
      return {'text': 'Saved content'};
    }
    if (method == 'results.seen') {
      seen++;
      seenRequests.add(payload);
      return null;
    }
    if (method == 'results.delete') {
      deletions.add(payload);
      if (failDelete) return {'deleted': [], 'failed': payload['ids']};
      rows.removeWhere((x) => (payload['ids'] as List).contains(x['id']));
      return {'deleted': payload['ids'], 'failed': []};
    }
    return super.request(method, payload);
  }
}

Future<void> showResults(WidgetTester tester, ResultsDock c) async {
  tester.view.physicalSize = const Size(393, 852);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(home: Scaffold(body: ResultsPage(client: c))));
  await tester.pumpAndSettle();
}

Future<void> choose(WidgetTester tester, String menu, String value) async {
  await tester.tap(find.byTooltip(menu));
  await tester.pumpAndSettle();
  await tester.tap(find.text(value).last);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('search matches title, summary and console without case sensitivity', (tester) async {
    final c = ResultsDock();
    addTearDown(c.dispose);
    await showResults(tester, c);
    for (final query in ['ALPHA', 'PAIRING', 'sTuDiO']) {
      await tester.enterText(find.byType(TextField), query);
      await tester.pumpAndSettle();
      expect(find.text('Alpha document'), findsWidgets);
      expect(find.text('Beta document'), findsNothing);
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('combined filters, named empty state, clearing and tab state', (tester) async {
    final c = ResultsDock();
    addTearDown(c.dispose);
    await showResults(tester, c);
    await tester.enterText(find.byType(TextField), 'document');
    await tester.tap(find.text('Documents'));
    await tester.pumpAndSettle();
    await choose(tester, 'Project', 'Game');
    await choose(tester, 'Console', 'Studio');
    expect(find.text('Alpha document'), findsWidgets);
    expect(find.text('Beta document'), findsNothing);

    // The app removes ResultsPage when another tab is selected.
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ResultsPage(client: c))));
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, 'document');
    expect(find.text('Project: Game'), findsOneWidget);
    expect(find.text('Console: Studio'), findsOneWidget);
    expect(tester.widget<FilterChip>(find.widgetWithText(FilterChip, 'Documents')).selected, isTrue);

    await choose(tester, 'Console', 'Review console');
    expect(find.text('No results for Search: "document"; Type: Documents; Project: Game; Console: Review console.'), findsOneWidget);
    await tester.tap(find.text('Clear filters'));
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, isEmpty);
    expect(find.text('Project: All'), findsOneWidget);
    expect(find.text('Console: All'), findsOneWidget);
    expect(find.text('Alpha document'), findsWidgets);
    expect(find.text('Clear filters'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('type chips classify images, code and other files', (tester) async {
    final c = ResultsDock();
    addTearDown(c.dispose);
    await showResults(tester, c);
    await tester.tap(find.text('Code'));
    await tester.pumpAndSettle();
    expect(find.text('Changed code'), findsOneWidget);
    expect(find.text('Alpha document'), findsNothing);
    await tester.tap(find.text('Other'));
    await tester.pumpAndSettle();
    expect(find.text('Model'), findsWidgets);
    expect(find.text('Changed code'), findsNothing);
    await tester.tap(find.text('Images'));
    await tester.pumpAndSettle();
    expect(find.text('1 pictures'), findsOneWidget);
    expect(find.text('Model'), findsNothing);
  });

  testWidgets('thumbnail placeholder becomes an image and shares its cached request', (tester) async {
    final c = ResultsDock()..thumbnail = Completer<dynamic>();
    addTearDown(c.dispose);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ResultThumbnail(client: c, item: c.rows[3]))));
    expect(find.byIcon(Icons.image_outlined), findsOneWidget);
    expect(find.byType(Image), findsNothing);
    c.thumbnail!.complete({'image': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='});
    await tester.pumpAndSettle();
    expect(find.byType(Image), findsOneWidget);
    expect(find.byIcon(Icons.broken_image_outlined), findsNothing);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ResultThumbnail(client: c, item: c.rows[3]))));
    await tester.pumpAndSettle();
    expect(c.previews, ['d']);
    expect(c.seen, 0);
    expect(tester.takeException(), isNull);
  });

  testWidgets('list thumbnails load only as their rows approach the viewport', (tester) async {
    final c = ResultsDock();
    addTearDown(c.dispose);
    c.rows.clear();
    c.rows.addAll(List.generate(50, (i) => result('image-$i', 'Picture $i', ext: '.png')));
    await showResults(tester, c);
    final initial = c.previews.length;
    expect(initial, greaterThan(0));
    expect(initial, lessThan(50));
    await tester.drag(find.byType(ListView).first, const Offset(0, -1500));
    await tester.pumpAndSettle();
    expect(c.previews.length, greaterThan(initial));
    expect(c.previews.length, lessThan(50));
  });

  testWidgets('mark viewed and confirmed delete target the current result', (tester) async {
    final c = ResultsDock();
    addTearDown(c.dispose);
    await showResults(tester, c);
    await tester.tap(find.text('Alpha document').last);
    await tester.pumpAndSettle();
    final seenBefore = c.seen;
    await choose(tester, 'Result actions', 'Mark viewed');
    expect(c.seen, seenBefore + 1);
    expect(c.seenRequests.last, {'ids': ['a']});
    expect(find.text('Marked viewed.'), findsOneWidget);
    await choose(tester, 'Result actions', 'Delete');
    expect(find.text('Delete "Alpha document"?'), findsOneWidget);
    expect(c.deletions, isEmpty);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(c.deletions, isEmpty);
    await choose(tester, 'Result actions', 'Delete');
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(c.deletions, [{'ids': ['a']}]);
    expect(find.text('Alpha document'), findsNothing);
    expect(c.rows.any((x) => x['id'] == 'b'), isTrue);
  });

  testWidgets('failed deletion keeps the preview and explains recovery', (tester) async {
    final c = ResultsDock()..failDelete = true;
    addTearDown(c.dispose);
    await showResults(tester, c);
    await tester.tap(find.text('Alpha document').last);
    await tester.pumpAndSettle();
    await choose(tester, 'Result actions', 'Delete');
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(find.textContaining('The saved copy could not be deleted. Try again.'), findsOneWidget);
    expect(find.byType(ResultDetail), findsOneWidget);
    expect(c.rows.any((x) => x['id'] == 'a'), isTrue);
  });

  testWidgets('gallery actions target the selected image and preserve its siblings', (tester) async {
    final c = ResultsDock();
    addTearDown(c.dispose);
    c.rows.clear();
    c.rows.addAll([
      result('d', 'First picture', ext: '.png')..['groupId'] = 'turn',
      result('f', 'Second picture', ext: '.png')..['groupId'] = 'turn',
    ]);
    await showResults(tester, c);
    await tester.tap(find.text('2 pictures'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Next picture'));
    await tester.pumpAndSettle();
    await choose(tester, 'Result actions', 'Mark viewed');
    expect(c.seenRequests.last, {'ids': ['f']});
    await choose(tester, 'Result actions', 'Delete');
    expect(find.text('Delete "Second picture"?'), findsOneWidget);
    expect(c.deletions, isEmpty);
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(c.deletions, [{'ids': ['f']}]);
    expect(c.rows.map((x) => x['id']), ['d']);
    expect(find.text('1 pictures'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('older hosts hide thumbnails and explicit result actions', (tester) async {
    final c = ResultsDock(modern: false);
    addTearDown(c.dispose);
    await showResults(tester, c);
    await tester.tap(find.text('Images'));
    await tester.pumpAndSettle();
    expect(find.byType(ResultThumbnail), findsNothing);
    expect(c.previews, isEmpty);
    await tester.tap(find.text('1 pictures'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Result actions'), findsNothing);
    expect(find.text('Mark viewed'), findsNothing);
    expect(find.text('Delete'), findsNothing);
    expect(c.previews, ['d']);
  });
}
