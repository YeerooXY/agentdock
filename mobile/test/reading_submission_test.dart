import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xterm/xterm.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/console_drafts.dart';
import 'package:agent_dock_mobile/terminal_reading.dart';
import 'package:agent_dock_mobile/terminal_styles.dart';

import 'widget_test.dart' show FakeDock;

String reading(WidgetTester tester) => tester
    .widget<SelectableText>(find.byType(SelectableText).first)
    .textSpan!
    .toPlainText();

void main() {
  test(
    'acknowledged messages persist in the draft store and forget with their PC',
    () async {
      String? saved;
      final store = ConsoleDrafts(
        read: () async => saved,
        write: (v) async => saved = v,
      );
      final a = ConsoleDrafts.key('pc-a', 'chat'),
          b = ConsoleDrafts.key('pc-b', 'chat');
      store.set(a, 'unsent');
      store.recordSent(a, 'first');
      store.recordSent(a, 'latest\ncomplete text');
      store.recordSent(b, 'another PC');
      await store.flush();
      final reopened = ConsoleDrafts(
        read: () async => saved,
        write: (v) async => saved = v,
      );
      await reopened.load();
      expect(reopened.get(a), 'unsent');
      expect(reopened.lastSent(a), 'latest\ncomplete text');
      await reopened.forgetPC('pc-a');
      expect(reopened.lastSent(a), '');
      expect(reopened.lastSent(b), 'another PC');
      expect(jsonDecode(saved!)['@sent'].length, 1);
      store.dispose();
      reopened.dispose();
    },
  );

  testWidgets(
    'long scrollback renders a bounded page and every retained row is reachable',
    (tester) async {
      final t = Terminal(maxLines: 3000)..resize(66, 24);
      t.write(List.generate(3200, (i) => 'Line $i').join('\r\n'));
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: TerminalReadingView(terminal: t)),
        ),
      );
      await tester.pumpAndSettle();
      expect(reading(tester), contains('Line 3199'));
      final seen = <String>{};
      while (true) {
        final text = reading(tester);
        expect(text.split('\n').length, lessThanOrEqualTo(120));
        seen.addAll(text.split('\n'));
        final earlier = find.widgetWithText(TextButton, 'Earlier');
        if (tester.widget<TextButton>(earlier).onPressed == null) break;
        await tester.tap(earlier);
        await tester.pumpAndSettle();
      }
      expect(seen, containsAll([for (var i = 200; i < 3200; i++) 'Line $i']));
      t.write('\r\nNew output');
      await tester.pump(const Duration(milliseconds: 160));
      final frozen = reading(tester);
      expect(frozen, isNot(contains('New output')));
      await tester.tap(find.text('Show new output'));
      await tester.pumpAndSettle();
      expect(reading(tester), contains('New output'));
      expect(FocusManager.instance.primaryFocus?.context?.widget, isNotNull);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('clearing scrollback replaces a frozen earlier page', (
    tester,
  ) async {
    final t = Terminal(maxLines: 3000)..resize(66, 24);
    t.write(List.generate(400, (i) => 'History $i').join('\r\n'));
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: TerminalReadingView(terminal: t)),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Earlier'));
    await tester.pumpAndSettle();
    expect(reading(tester), contains('History 200'));
    t.mainBuffer.clearScrollback();
    t.write('');
    await tester.pump(const Duration(milliseconds: 160));
    await tester.pumpAndSettle();
    expect(reading(tester), isNot(contains('History 200')));
    expect(reading(tester), contains('History 399'));
    expect(find.text('Earlier'), findsNothing);
  });

  test(
    'page text keeps ANSI spans, skipped cells and wrap joins consistent',
    () {
      final t = Terminal()..resize(12, 8);
      t.write(
        'before\r\n\x1b[31mred\x1b[0m\x1b[3Cgap\r\nwrapped words beyond the row\r\nafter',
      );
      final plain = terminalReadingText(t, start: 1, end: 4);
      expect(
        terminalReadingSpan(
          t,
          TerminalThemes.defaultTheme,
          start: 1,
          end: 4,
        ).toPlainText(),
        plain,
      );
      expect(plain, isNot(contains('before')));
      expect(plain, contains('red   gap'));
    },
  );

  testWidgets('paging keeps focus after Enter and Space at enlarged text', (
    tester,
  ) async {
    final t = Terminal(maxLines: 3000)..resize(66, 24);
    t.write(List.generate(500, (i) => 'Keyboard row $i').join('\r\n'));
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MediaQuery(
            data: const MediaQueryData(textScaler: TextScaler.linear(2)),
            child: TerminalReadingView(terminal: t),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    for (final key in [LogicalKeyboardKey.enter, LogicalKeyboardKey.space]) {
      final earlier = find.text('Earlier');
      Focus.of(tester.element(earlier)).requestFocus();
      await tester.pump();
      await tester.sendKeyEvent(key);
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<SelectableText>(find.byType(SelectableText))
            .focusNode!
            .hasFocus,
        isTrue,
      );
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.sendKeyDownEvent(LogicalKeyboardKey.shift);
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.shift);
      await tester.pump();
      expect(FocusManager.instance.primaryFocus, isNot(isA<FocusScopeNode>()));
    }
    expect(reading(tester), isNot(contains('Keyboard row 499')));
    expect(tester.takeException(), isNull);
  });

  testWidgets('an earlier page is restored when the reader reopens', (
    tester,
  ) async {
    final drafts = ConsoleDrafts(read: () async => null, write: (_) async {});
    addTearDown(drafts.dispose);
    final t = Terminal()..resize(66, 24);
    t.write(List.generate(400, (i) => 'Saved row $i').join('\r\n'));
    Widget view() => MaterialApp(
      home: Scaffold(
        body: TerminalReadingView(
          terminal: t,
          positions: drafts,
          positionKey: 'reader',
        ),
      ),
    );
    await tester.pumpWidget(view());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Earlier'));
    await tester.pumpAndSettle();
    final before = reading(tester);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    await tester.pumpWidget(view());
    await tester.pumpAndSettle();
    expect(reading(tester), before);
  });

  testWidgets(
    'sent preview follows acknowledgement, preserves the composer and isolates consoles',
    (tester) async {
      final c = FakeDock();
      addTearDown(c.dispose);
      await tester.pumpWidget(DockApp(client: c));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(TextField).last);
      await tester.pumpAndSettle();
      const message = 'The complete prompt\nwith a second line and Unicode 中文';
      final field = find.byType(TextField).last;
      await tester.enterText(field, message);
      await tester.pump();
      await tester.tap(find.byTooltip('Send to console'));
      await tester.pump();
      expect(find.byTooltip('View sent message'), findsNothing);
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pumpAndSettle();
      expect(c.drafts.lastSent(ConsoleDrafts.key('', 'one')), message);
      expect(tester.widget<TextField>(field).controller!.text, '');
      expect(find.byTooltip('View sent message'), findsOneWidget);
      await tester.tap(find.byTooltip('View sent message'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(SelectableText, message), findsOneWidget);
      await tester.tap(find.text('Close'));
      await tester.pumpAndSettle();
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.sendKeyDownEvent(LogicalKeyboardKey.shift);
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.shift);
      expect(FocusManager.instance.primaryFocus?.context, isNotNull);
      c.onInput = (_) async => throw StateError('offline');
      await tester.enterText(field, 'failed next message');
      await tester.pump();
      await tester.tap(find.byTooltip('Send to console'));
      await tester.pumpAndSettle();
      expect(c.drafts.lastSent(ConsoleDrafts.key('', 'one')), message);
      expect(
        tester.widget<TextField>(field).controller!.text,
        'failed next message',
      );
      ScaffoldMessenger.of(tester.element(field)).clearSnackBars();
      await tester.pumpAndSettle();
      c.onInput = (payload) async {
        if (payload['data'] == '\r') {
          throw StateError('Enter was not acknowledged');
        }
      };
      await tester.tap(find.byTooltip('Send to console'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));
      await tester.pumpAndSettle();
      expect(c.inputs.last['data'], '\r');
      expect(c.drafts.lastSent(ConsoleDrafts.key('', 'one')), message);
      expect(
        tester.widget<TextField>(field).controller!.text,
        'failed next message',
      );
      ScaffoldMessenger.of(tester.element(field)).clearSnackBars();
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      c.state['sessions'].add({
        'id': 'two',
        'provider': 'claude',
        'name': 'Other',
        'state': 'ready',
      });
      c.screens['two'] = c.makeScreen('two');
      await c.select('two');
      await tester.pumpAndSettle();
      await tester.tap(find.byType(TextField).last);
      await tester.pumpAndSettle();
      expect(find.byTooltip('View sent message'), findsNothing);
    },
  );
}
