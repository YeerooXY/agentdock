import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/preview_page.dart';
import 'widget_test.dart' show FakeDock;

class PreviewDock extends FakeDock {
  int reloads = 0;
  PreviewDock() {
    state['previews'] = [
      {'id': 'one', 'name': 'Website', 'url': 'http://localhost:5173/', 'state': 'open', 'phoneAllowed': false},
      {'id': 'two', 'name': 'App', 'url': 'http://localhost:3000/', 'state': 'open', 'phoneAllowed': true},
    ];
  }
  @override
  Future<int> previewStatus(String id, String address) async { reloads++; return 200; }
}

void main() {
  testWidgets('lists panels and shows PC permission', (tester) async {
    final client = PreviewDock(); addTearDown(client.dispose);
    await tester.pumpWidget(MaterialApp(home: PreviewListPage(client: client)));
    expect(find.text('Website'), findsOneWidget);
    expect(find.text('App'), findsOneWidget);
    await tester.tap(find.text('Website')); await tester.pumpAndSettle();
    expect(find.text('Not allowed on the PC'), findsOneWidget);
    expect(tester.widget<IconButton>(find.byTooltip('Reload')).onPressed, isNull);
  });

  testWidgets('reload checks an allowed panel', (tester) async {
    final client = PreviewDock(); addTearDown(client.dispose);
    await tester.pumpWidget(MaterialApp(home: PreviewListPage(client: client)));
    await tester.tap(find.text('App')); await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Reload')); await tester.pumpAndSettle();
    expect(client.reloads, 1);
    expect(find.text('HTTP 200'), findsOneWidget);
  });
}
