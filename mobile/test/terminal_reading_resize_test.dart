import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xterm/xterm.dart';
import 'package:agent_dock_mobile/terminal_reading.dart';

void main() {
  testWidgets('shrinking the view keeps the newest output in sight', (
    tester,
  ) async {
    final terminal = Terminal(maxLines: 200)..resize(40, 30);
    terminal.write(List.generate(20, (i) => 'line $i').join('\r\n'));
    final height = ValueNotifier<double>(600);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ValueListenableBuilder<double>(
            valueListenable: height,
            builder: (_, h, _) => Align(
              alignment: Alignment.topCenter,
              child: SizedBox(
                height: h,
                child: TerminalReadingView(terminal: terminal),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    height.value = 150;
    await tester.pumpAndSettle();
    final scroll = tester.state<ScrollableState>(
      find
          .descendant(
            of: find.byKey(const ValueKey('terminal-reading-scroll')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(scroll.position.extentAfter, lessThan(1));
    expect(scroll.position.maxScrollExtent, greaterThan(0));
  });
}
