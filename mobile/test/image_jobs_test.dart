import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agent_dock_mobile/image_jobs_page.dart';
import 'package:agent_dock_mobile/main.dart';
import 'package:agent_dock_mobile/results_page.dart';

import 'widget_test.dart' show FakeDock;

Map<String, dynamic> job(String id, {bool resume = false, String? result, Map<String, dynamic>? usage}) => {
  'id': id, 'provider': 'meshy', 'model': 'nano-banana-pro',
  'promptSummary': 'Preview a screen', 'status': resume ? 'interrupted' : 'complete',
  'startedAt': 1700000000000, 'finishedAt': null,
  'usage': usage ?? {'input': null, 'output': null, 'total': null, 'credits': null},
  'resultId': result, 'canResume': resume,
};

void main() {
  testWidgets('shows jobs, unknown usage, saved result and eligible resume', (tester) async {
    final client = FakeDock();
    addTearDown(client.dispose);
    client.state['imageJobs'] = [job('one', resume: true), job('two', result: 'r1', usage: {'credits': 9})];
    await tester.pumpWidget(MaterialApp(home: ImageJobsPage(client: client)));
    await tester.pumpAndSettle();
    expect(find.text('Status: interrupted'), findsOneWidget);
    expect(find.text('Usage: not reported'), findsOneWidget);
    expect(find.textContaining('Credits: 9'), findsOneWidget);
    expect(find.text('Resume'), findsOneWidget);
    await tester.ensureVisible(find.text('View result'));
    await tester.tap(find.text('View result'));
    await tester.pumpAndSettle();
    expect(find.byType(ResultDetail), findsOneWidget);
    expect(client.calls, contains('results.preview'));
  });

  testWidgets('resume requires confirmation and sends the same job id', (tester) async {
    final client = FakeDock();
    addTearDown(client.dispose);
    client.state['imageJobs'] = [job('accepted', resume: true), job('complete')];
    await tester.pumpWidget(MaterialApp(home: ImageJobsPage(client: client)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Resume'));
    await tester.pumpAndSettle();
    expect(find.text('Resume this job on your PC? It may use credits.'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(client.calls, isNot(contains('image.resume')));
    await tester.tap(find.text('Resume'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Resume').last);
    await tester.pumpAndSettle();
    final index = client.calls.indexOf('image.resume');
    expect(index, greaterThanOrEqualTo(0));
    expect(client.payloads[index], {'id': 'accepted'});
  });

  testWidgets('Results and the running chip open image jobs', (tester) async {
    final client = FakeDock();
    addTearDown(client.dispose);
    client.state['capabilities'] = ['image.jobs'];
    client.state['imageJobs'] = [job('running')];
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ResultsPage(client: client))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Image jobs'));
    await tester.pumpAndSettle();
    expect(find.byType(ImageJobsPage), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    client.state['imageJobsRunning'] = true;
    await tester.pumpWidget(DockApp(client: client));
    await tester.pumpAndSettle();
    expect(find.text('Image job running'), findsOneWidget);
    await tester.tap(find.text('Image job running'));
    await tester.pumpAndSettle();
    expect(find.byType(ImageJobsPage), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    client.state['imageJobsRunning'] = false;
    await tester.pumpWidget(DockApp(client: client));
    await tester.pumpAndSettle();
    expect(find.text('Image job running'), findsNothing);
  });
}
