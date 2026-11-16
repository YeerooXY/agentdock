import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/account_usage.dart';
import 'package:agent_dock_mobile/dock_client.dart';
import 'package:agent_dock_mobile/settings_page.dart';

class UsageClient extends DockClient {
  Map<String, dynamic> usage = {
    'limits': [],
    'summary': {'cost': null, 'unpriced': 2, 'unknownUsage': 1},
  };
  Completer<dynamic>? response;
  bool fail = false;
  int reads = 0;
  final payloads = <Map<String, dynamic>>[];
  UsageClient() {
    connected = true;
    pairing = {'name': 'Test PC'};
  }

  @override
  Future<dynamic> request(
    String method, [
    Map<String, dynamic> payload = const {},
  ]) async {
    if (method != 'usage') throw StateError('Unexpected request: $method');
    reads++;
    payloads.add(payload);
    if (fail || !connected) throw StateError('Fixture offline');
    return response?.future ?? usage;
  }

  @override
  Future<void> reconnect() async {
    connected = true;
    notifyListeners();
  }
}

Map<String, dynamic> sampleAccount({String name = 'Codex', dynamic used = 38}) {
  final now = DateTime.now().millisecondsSinceEpoch;
  return {
    'name': name,
    'provider': 'codex',
    'observedAt': now - 21 * 60000,
    'windows': [
      {'minutes': 300, 'usedPercent': used, 'resetsAt': now + 3600000},
      {'minutes': 10080, 'usedPercent': null, 'resetsAt': null},
    ],
  };
}

Future<void> showUsage(
  WidgetTester tester,
  UsageClient client, {
  double scale = 1,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: ThemeData.dark(),
      home: MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(scale)),
        child: Scaffold(body: SettingsPage(client: client, usageOnly: true)),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets(
    'refresh checks providers and polls until their readings complete',
    (tester) async {
      final client = UsageClient();
      addTearDown(client.dispose);
      client.usage = {
        'refreshing': true,
        'accounts': [
          {
            'id': 'claude:default',
            'provider': 'claude',
            'label': 'Claude',
            'usageCheck': {'status': 'refreshing'},
          },
        ],
        'limits': [],
      };
      await showUsage(tester, client);
      expect(client.payloads.first['refresh'], true);
      expect(find.text('Checking now'), findsOneWidget);
      client.usage = {
        'refreshing': false,
        'accounts': [
          {
            'id': 'claude:default',
            'provider': 'claude',
            'label': 'Claude',
            'usageCheck': {
              'status': 'sign-in',
              'message': 'Sign in through this CLI, then refresh.',
            },
          },
        ],
        'limits': [],
      };
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();
      expect(client.payloads.last['refresh'], isNull);
      expect(find.text('Sign in needed'), findsOneWidget);
      expect(
        find.text('Sign in through this CLI, then refresh.'),
        findsOneWidget,
      );
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('subscriptions the PC marks not set up are not listed', (
    tester,
  ) async {
    final client = UsageClient();
    addTearDown(client.dispose);
    client.usage = {
      'accounts': [
        {'id': 'claude:default', 'provider': 'claude', 'label': 'Claude Main', 'visible': true},
        {'id': 'gemini:default', 'provider': 'gemini', 'label': 'Gemini Unused', 'visible': false},
        {'id': 'codex:default', 'provider': 'codex', 'label': 'Codex Older Host'},
      ],
      'limits': [],
    };
    await showUsage(tester, client);
    expect(find.textContaining('Claude Main'), findsWidgets);
    expect(find.textContaining('Codex Older Host'), findsWidgets);
    expect(find.textContaining('Gemini Unused'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'native window names and unlimited allowances render without false percentages',
    (tester) async {
      final client = UsageClient();
      addTearDown(client.dispose);
      client.usage['limits'] = [
        {
          'provider': 'copilot',
          'name': 'Copilot',
          'observedAt': DateTime.now().millisecondsSinceEpoch,
          'usageCheck': {'status': 'current'},
          'windows': [
            {'label': 'Premium interactions', 'usedPercent': 25},
            {'label': 'Chat', 'unlimited': true},
          ],
        },
      ];
      await showUsage(tester, client);
      expect(find.text('Premium interactions'), findsOneWidget);
      expect(find.text('Unlimited'), findsOneWidget);
      expect(find.text('75% left'), findsOneWidget);
      expect(find.byKey(const ValueKey('usage-bar')), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('weekly-exhausted five-hour window has no false allowance bar', (tester) async {
    final fixture = jsonDecode(File('../tests/fixtures/state/dto/phone-usage-disabled.json').readAsStringSync()) as Map;
    final windows = (fixture['output'] as Map)['windows'] as List;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: UsageWindow(window: windows.last as Map))));
    expect(find.text('Not applicable'), findsOneWidget);
    expect(find.text('Weekly limit reached'), findsOneWidget);
    expect(find.text('Unknown'), findsNothing);
    expect(find.textContaining('% left'), findsNothing);
    expect(find.byKey(const ValueKey('usage-bar')), findsNothing);
  });

  testWidgets('usage recovers when the PC reconnects', (tester) async {
    final client = UsageClient()..connected = false;
    addTearDown(client.dispose);
    client.usage['limits'] = [sampleAccount()];
    await showUsage(tester, client);
    expect(find.textContaining('Connect to your PC'), findsOneWidget);
    client.reconnect();
    await tester.pumpAndSettle();
    expect(find.text('62% left'), findsOneWidget);
    expect(find.textContaining('Connect to your PC'), findsNothing);
    expect(client.reads, 2);
  });
  testWidgets(
    'account bars keep windows separate and unknown values explicit',
    (tester) async {
      final client = UsageClient();
      addTearDown(client.dispose);
      client.usage['limits'] = [sampleAccount()];
      await showUsage(tester, client);
      expect(find.text('5 hours'), findsOneWidget);
      expect(find.text('Weekly'), findsOneWidget);
      expect(find.text('62% left'), findsOneWidget);
      expect(find.text('Unknown% left'), findsNothing);
      expect(find.textContaining('Last refreshed: '), findsOneWidget);
      expect(find.textContaining('Resets in'), findsWidgets);
      final bars = tester
          .widgetList<FractionallySizedBox>(
            find.byKey(const ValueKey('usage-bar')),
          )
          .toList();
      expect(bars.map((bar) => bar.widthFactor), [.62, 0]);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      final semantics = tester.ensureSemantics();
      expect(
        find.bySemanticsLabel('Weekly allowance remaining'),
        findsOneWidget,
      );
      semantics.dispose();
    },
  );

  testWidgets(
    'refresh replaces data; failed refresh preserves the last readings',
    (tester) async {
      final client = UsageClient();
      addTearDown(client.dispose);
      client.usage['limits'] = [sampleAccount()];
      await showUsage(tester, client);
      client.fail = true;
      await tester.tap(find.byTooltip('Refresh usage'));
      await tester.pumpAndSettle();
      expect(find.text('62% left'), findsOneWidget);
      expect(find.textContaining('Showing previous data.'), findsOneWidget);
      client.fail = false;
      client.usage['limits'] = [sampleAccount(used: 61)];
      await tester.drag(find.byType(ListView).first, const Offset(0, 350));
      await tester.pumpAndSettle();
      expect(client.reads, 3);
      expect(find.text('39% left'), findsOneWidget);
      expect(find.textContaining('Showing previous data.'), findsNothing);
    },
  );

  testWidgets('named accounts keep their own readings and unmatched limits', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 2200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final client = UsageClient();
    addTearDown(client.dispose);
    client.usage['accounts'] = [
      {'id': 'codex:alpha', 'provider': 'codex', 'label': 'Alpha'},
      {'id': 'codex:beta', 'provider': 'codex', 'label': 'Beta'},
      {'id': 'claude:empty', 'provider': 'claude', 'label': 'Claude backup'},
    ];
    client.usage['limits'] = [
      {...sampleAccount(used: 38), 'accountId': 'codex:alpha'},
      {...sampleAccount(used: 91), 'accountId': 'codex:beta'},
      {
        ...sampleAccount(name: 'Older account', used: 12),
        'accountId': 'codex:older',
      },
    ];
    await showUsage(tester, client);
    final cards = tester
        .widgetList<AccountUsageCard>(find.byType(AccountUsageCard))
        .toList();
    expect(cards.map((card) => card.account['accountLabel']), [
      'Alpha',
      'Beta',
      'Claude backup',
      'Older account',
    ]);
    expect(find.text('62% left'), findsOneWidget);
    expect(find.text('9% left'), findsOneWidget);
    expect(find.text('88% left'), findsOneWidget);
    expect(find.text('Refresh to check account usage.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('loading, errors and empty readings are distinct', (
    tester,
  ) async {
    final client = UsageClient()..response = Completer<dynamic>();
    addTearDown(client.dispose);
    await showUsage(tester, client);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.textContaining('No account limits'), findsNothing);
    client.response!.completeError(StateError('Fixture error'));
    await tester.pumpAndSettle();
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.textContaining('Could not refresh usage'), findsOneWidget);
    expect(find.textContaining('No account limits'), findsNothing);
    client.response = null;
    await tester.tap(find.byTooltip('Refresh usage'));
    await tester.pumpAndSettle();
    expect(
      find.textContaining('No account limits reported yet.'),
      findsOneWidget,
    );
    expect(
      find.text('Unknown'),
      findsOneWidget,
    ); // Not a fabricated zero-dollar estimate.
    expect(find.textContaining('2 unpriced requests'), findsOneWidget);
  });

  testWidgets('leaving the page during a refresh is safe', (tester) async {
    final client = UsageClient()..response = Completer<dynamic>();
    addTearDown(client.dispose);
    await showUsage(tester, client);
    await tester.pumpWidget(const SizedBox());
    client.response!.complete(client.usage);
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  for (final width in [320.0, 393.0, 800.0]) {
    testWidgets('usage and controls fit ${width.toInt()}px at 200% text size', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final client = UsageClient();
      addTearDown(client.dispose);
      client.usage['limits'] = [
        sampleAccount(
          name: 'A long account name shared across all of my projects',
        ),
      ];
      await showUsage(tester, client, scale: 2);
      for (var i = 0; i < 24; i++) {
        await tester.drag(find.byType(ListView).first, const Offset(0, -250));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      }
    });
  }

  test('malformed, non-finite and out-of-range readings stay unknown', () {
    for (final value in [null, '50', -1, 101, double.nan, double.infinity]) {
      expect(usagePercent(value), isNull);
    }
    expect(usagePercent(0), 0);
    expect(usagePercent(100), 100);
    for (final value in [
      null,
      'yesterday',
      -1,
      double.nan,
      double.infinity,
      1e20,
    ]) {
      expect(usageDate(value), isNull);
    }
  });

  testWidgets('a passed reset never clears a reported limit', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: UsageWindow(
            window: {
              'minutes': 300,
              'usedPercent': 100,
              'resetsAt': 1700000000000,
            },
          ),
        ),
      ),
    );
    expect(find.text('0% left'), findsOneWidget);
    expect(find.text('Reset passed, refresh needed'), findsOneWidget);
  });

  test('usage wording follows the desktop rules', () {
    final now = DateTime.fromMillisecondsSinceEpoch(1700000000000);
    expect(usageSpan(const Duration(hours: 37, minutes: 5)), '1d 13h');
    expect(usageSpan(const Duration(hours: 5, minutes: 1)), '5h 1m');
    expect(usageSpan(const Duration(hours: 2)), '2h');
    expect(usageSpan(const Duration(seconds: 30)), '1m');
    expect(usageAge(now.subtract(const Duration(hours: 3, minutes: 1)), now), '3h 1m ago');
    expect(usageAge(now.subtract(const Duration(seconds: 20)), now), 'just now');
    expect(usageResetText({'unlimited': true}, now), 'No limit');
    expect(usageResetText({'resetsAt': 1700000000000 + 90 * 60000}, now), 'Resets in 1h 30m');
    expect(usageResetText({'resetsAt': 1690000000000}, now), 'Reset passed, refresh needed');
    expect(usageResetText({'resetLabel': 'Resets on 2026-12-01'}, now), 'Resets on 2026-12-01');
    expect(usageResetText({'minutes': 300}, now), 'Resets in 5h');
    expect(usageResetText({}, now), 'Reset time unknown');
    final sorted = sortedUsageWindows([
      {'label': 'Weekly', 'usedPercent': 40},
      {'label': 'Unknown'},
      {'label': '5-hour', 'usedPercent': 90},
    ]);
    expect(sorted.map((w) => w['label']), ['5-hour', 'Weekly', 'Unknown']);
    expect(usageStatusLabel({}), 'Not checked');
    expect(usageStatusLabel({'status': 'current'}), '');
    expect(usageStatusLabel({'status': 'not-isolated'}), 'Not isolated');
    expect(usageStatusLabel({'status': 'unsupported', 'reason': 'no-source'}), 'No quota source');
    expect(usageStatusLabel({'status': 'stale', 'failure': 'inactive'}), 'Stale');
    expect(usageStaleReason({'stale': true, 'staleReason': 'old'}), 'Older than five minutes.');
    expect(usageStaleReason({'stale': true, 'failure': 'inactive', 'message': 'Another account is open.'}), 'Another account is open.');
    expect(usageStaleReason({'stale': true, 'staleReason': 'check-failed', 'failure': 'timeout'}), 'The last check failed. Timed out.');
  });
}
