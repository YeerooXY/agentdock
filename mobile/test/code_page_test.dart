import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/code_page.dart';
import 'package:agent_dock_mobile/console_drafts.dart';
import 'package:agent_dock_mobile/main.dart';
import 'widget_test.dart' show FakeDock, enterChat;

class CodeDock extends FakeDock {
  bool omitted = false;
  String fileText = 'const first = 1;\nconst second = 2;\nreturn first + second;';
  int breadcrumbDepth = 0;
  CodeDock() {
    state['capabilities'] = ['code.read'];
    state['sessions'][0]['consoleKey'] = 'source';
    state['sessions'].add({'id': 'two', 'consoleKey': 'target', 'name': 'Other console', 'provider': 'claude'});
  }
  @override
  Future<dynamic> request(String method, [Map<String, dynamic> payload = const {}]) async {
    if (method != 'code.list' && method != 'code.read') return super.request(method, payload);
    calls.add(method); payloads.add(Map.of(payload));
    if (method == 'code.read') {
      return {'path': 'src/example.js', 'folder': '/project',
        'text': omitted ? null : fileText,
        'omitted': omitted ? 'Credential and generated files are excluded from the code panel.' : null,
        'size': 64, 'lines': omitted ? 0 : 3};
    }
    final nested = payload['path'] == '/project/src';
    return {'path': nested ? '/project/src' : '/project', 'parent': nested ? '/project' : null,
      'breadcrumbs': [{'name': 'project', 'path': '/project'},
        if (nested) {'name': 'src', 'path': '/project/src'},
        if (nested) for (var i = 0; i < breadcrumbDepth; i++)
          {'name': 'nested-folder-$i', 'path': '/project/src/nested-folder-$i'}],
      'entries': [nested ? {'name': 'example.js', 'path': '/project/src/example.js', 'directory': false} :
        {'name': 'src', 'path': '/project/src', 'directory': true}], 'truncated': false};
  }
}

Future<void> openFile(WidgetTester tester, CodeDock c, {ThemeData? theme}) async {
  await tester.pumpWidget(MaterialApp(theme: theme, home: CodePage(client: c, consoleId: 'one')));
  await tester.pumpAndSettle();
  await tester.tap(find.text('src')); await tester.pumpAndSettle();
  await tester.tap(find.text('example.js')); await tester.pumpAndSettle();
}

Future<void> selectRange(WidgetTester tester) async {
  await tester.longPress(find.byKey(const ValueKey('code-line-1')));
  await tester.pumpAndSettle();
  expect(find.text('Ask agent: 1-1'), findsOneWidget);
  await tester.tap(find.byKey(const ValueKey('code-line-3')));
  await tester.pumpAndSettle();
  expect(find.text('Ask agent: 1-3'), findsOneWidget);
  await tester.tap(find.text('Ask agent: 1-3')); await tester.pumpAndSettle();
}

Future<void> finishSheet(WidgetTester tester) async {
  await tester.pumpAndSettle();
  // Expire the four-second success SnackBar and the draft store's save timer.
  // pumpAndSettle alone only waits while frames are scheduled.
  await tester.pump(const Duration(seconds: 5));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('long lines scroll through the last character with Material letter spacing', (tester) async {
    tester.view.physicalSize = const Size(320, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final c = CodeDock()..fileText = '${'long_line_' * 50}END';
    addTearDown(c.dispose);
    await openFile(tester, c, theme: ThemeData(
      textTheme: const TextTheme(bodyMedium: TextStyle(letterSpacing: 3)),
    ));
    final line = find.text(c.fileText);
    expect(tester.widget<Text>(line).style!.letterSpacing, 3);
    final scroll = find.byKey(const ValueKey('code-lines-scroll'));
    final position = tester.state<ScrollableState>(find.descendant(
      of: scroll, matching: find.byType(Scrollable)).first).position;
    expect(position.maxScrollExtent, greaterThan(0));
    position.jumpTo(position.maxScrollExtent);
    await tester.pumpAndSettle();
    final viewport = tester.getRect(scroll);
    final text = tester.getRect(line);
    expect(text.right, lessThanOrEqualTo(viewport.right));
    expect(text.right, greaterThan(viewport.left));
    expect(tester.takeException(), isNull);
  });

  testWidgets('deep breadcrumbs scroll horizontally on a small phone with enlarged text', (tester) async {
    tester.view.physicalSize = const Size(320, 480);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final c = CodeDock()..breadcrumbDepth = 20;
    addTearDown(c.dispose);
    await tester.pumpWidget(MaterialApp(home: CodePage(client: c, consoleId: 'one')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('src')); await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    final crumbs = find.byKey(const ValueKey('code-breadcrumbs'));
    expect(tester.widget<SingleChildScrollView>(crumbs).scrollDirection, Axis.horizontal);
    final firstTop = tester.getTopLeft(find.text('project')).dy;
    await tester.ensureVisible(find.text('nested-folder-19'));
    await tester.pumpAndSettle();
    expect(tester.getTopLeft(find.text('nested-folder-19')).dy, firstTop);
    expect(find.text('example.js').hitTestable(), findsOneWidget);
    expect(find.byTooltip('Up').hitTestable(), findsOneWidget);
    await tester.tap(find.text('nested-folder-19')); await tester.pumpAndSettle();
    expect(c.payloads.last['path'], '/project/src/nested-folder-19');
    expect(tester.takeException(), isNull);
  });

  testWidgets('remote-object consoles hide Code even when the host supports it', (tester) async {
    final c = CodeDock(); addTearDown(c.dispose);
    c.state['sessions'][0]['remote'] = {'hostId': 'vm', 'folder': '/workspace'};
    await tester.pumpWidget(DockApp(client: c)); await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('More options')); await tester.pumpAndSettle();
    expect(find.text('Code'), findsNothing);
    expect(c.calls.where((method) => method.startsWith('code.')), isEmpty);
  });

  testWidgets('browse, up, open file and find numbered lines', (tester) async {
    final c = CodeDock(); addTearDown(c.dispose);
    await openFile(tester, c);
    expect(find.text('Read only'), findsOneWidget);
    expect(find.byKey(const ValueKey('code-line-3')), findsOneWidget);
    expect(c.payloads.every((p) => p['consoleId'] == 'one'), isTrue);
    await tester.enterText(find.byType(TextField), 'second ='); await tester.pumpAndSettle();
    expect(find.text('1 matching lines'), findsOneWidget);
    expect(find.byKey(const ValueKey('code-line-2')), findsOneWidget);
    expect(find.byKey(const ValueKey('code-line-1')), findsNothing);
    await tester.tap(find.byTooltip('Back to folder')); await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Up')); await tester.pumpAndSettle();
    expect(find.text('src'), findsOneWidget);
    expect(c.inputs, isEmpty);
  });

  testWidgets('private file shows the omission reason', (tester) async {
    final c = CodeDock()..omitted = true; addTearDown(c.dispose);
    await openFile(tester, c);
    expect(find.textContaining('Credential and generated files'), findsOneWidget);
    expect(find.byKey(const ValueKey('code-line-1')), findsNothing);
    expect(c.inputs, isEmpty);
  });

  testWidgets('long press and second tap add formatted context to chosen draft without sending', (tester) async {
    final c = CodeDock(); addTearDown(c.dispose);
    final source = ConsoleDrafts.key(c.activePC, 'source');
    final target = ConsoleDrafts.key(c.activePC, 'target');
    c.drafts.set(source, 'Source draft'); c.drafts.set(target, 'Existing draft');
    await openFile(tester, c); await selectRange(tester);
    expect(find.text('src/example.js:1-3'), findsOneWidget);
    await tester.tap(find.text('Look for a bug')); await tester.pumpAndSettle();
    await tester.tap(find.byType(DropdownButtonFormField<String>)); await tester.pumpAndSettle();
    await tester.tap(find.text('Other console').last); await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Add to draft'));
    await tester.tap(find.text('Add to draft')); await finishSheet(tester);
    expect(c.drafts.get(source), 'Source draft');
    expect(c.drafts.get(target), 'Existing draft\n\nLook for a bug\n\n'
      'File: src/example.js:1-3  (/project)\n```javascript\n'
      'const first = 1;\nconst second = 2;\nreturn first + second;\n```');
    expect(c.inputs, isEmpty);
    expect(c.calls.where((method) => method == 'input' || method == 'queue.add'), isEmpty);
  });

  testWidgets('cancel keeps drafts unchanged', (tester) async {
    final c = CodeDock(); addTearDown(c.dispose);
    final key = ConsoleDrafts.key(c.activePC, 'source'); c.drafts.set(key, 'Keep this');
    await openFile(tester, c); await selectRange(tester);
    await tester.enterText(find.widgetWithText(TextField, 'Note'), 'Explain the return');
    await tester.ensureVisible(find.text('Cancel'));
    await tester.tap(find.text('Cancel')); await finishSheet(tester);
    expect(c.drafts.get(key), 'Keep this'); expect(c.inputs, isEmpty);
  });

  testWidgets('old host hides Code in the console menu', (tester) async {
    final c = CodeDock(); addTearDown(c.dispose); c.state['capabilities'] = [];
    await tester.pumpWidget(DockApp(client: c)); await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('More options')); await tester.pumpAndSettle();
    expect(find.text('Code'), findsNothing);
  });

  testWidgets('console menu opens Code and restores the updated composer draft', (tester) async {
    final c = CodeDock(); addTearDown(c.dispose);
    await tester.pumpWidget(DockApp(client: c)); await tester.pumpAndSettle();
    await enterChat(tester);
    await tester.enterText(find.byType(TextField).last, 'Existing');
    await tester.tap(find.byTooltip('More options')); await tester.pumpAndSettle();
    await tester.tap(find.text('Code')); await tester.pumpAndSettle();
    await tester.tap(find.text('src')); await tester.pumpAndSettle();
    await tester.tap(find.text('example.js')); await tester.pumpAndSettle();
    await selectRange(tester);
    await tester.ensureVisible(find.text('Add to draft'));
    await tester.tap(find.text('Add to draft')); await finishSheet(tester);
    await tester.pageBack(); await tester.pumpAndSettle();
    expect(tester.widget<TextField>(find.byType(TextField).last).controller!.text,
      startsWith('Existing\n\nFile: src/example.js:1-3  (/project)'));
    expect(c.inputs, isEmpty);
  });

  testWidgets('small phone and large text retain draft controls', (tester) async {
    tester.view.physicalSize = const Size(320, 740); tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.view.resetPhysicalSize); addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final c = CodeDock(); addTearDown(c.dispose);
    await openFile(tester, c);
    await tester.longPressAt(tester.getTopLeft(find.byKey(const ValueKey('code-line-1'))) + const Offset(80, 16));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Ask agent: 1-1'));
    await tester.tap(find.text('Ask agent: 1-1')); await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Add to draft'));
    expect(tester.takeException(), isNull);
    await tester.ensureVisible(find.text('Cancel'));
    await tester.tap(find.text('Cancel')); await finishSheet(tester);
  });

  test('context protects embedded fences and matches desktop language names', () {
    expect(formatCodeContext(path: 'note.md', folder: 'repo', from: 2, to: 2,
      text: '```', note: ' Explain '), 'Explain\n\nFile: note.md:2-2  (repo)\n````markdown\n```\n````');
    expect(() => formatCodeContext(path: 'a.txt', folder: 'repo', from: 1, to: 1,
      text: 'a' * 60000), throwsStateError);
  });
}
