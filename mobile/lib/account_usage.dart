import 'package:flutter/material.dart';

import 'dock_style.dart';

DateTime? usageDate(dynamic value) {
  if (value is! num || !value.isFinite || value <= 0) return null;
  try {
    return DateTime.fromMillisecondsSinceEpoch(value.toInt()).toLocal();
  } on ArgumentError {
    return null;
  }
}

double? usagePercent(dynamic value) =>
    value is num && value.isFinite && value >= 0 && value <= 100
    ? value.toDouble()
    : null;

String percentLabel(double value) =>
    value.toStringAsFixed(value == value.roundToDouble() ? 0 : 1);

String windowLabel(dynamic minutes) => switch (minutes) {
  300 => '5 hours',
  10080 => 'Weekly',
  1440 => 'Daily',
  num n when n.isFinite && n > 0 => '$n minutes',
  _ => 'Account window',
};

String localUsageDate(BuildContext context, DateTime value) {
  final labels = MaterialLocalizations.of(context);
  final time = labels.formatTimeOfDay(
    TimeOfDay.fromDateTime(value),
    alwaysUse24HourFormat: MediaQuery.alwaysUse24HourFormatOf(context),
  );
  return '${labels.formatShortDate(value)} at $time';
}

class AccountUsageCard extends StatelessWidget {
  final Map<dynamic, dynamic> account;
  const AccountUsageCard({super.key, required this.account});

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now(), observed = usageDate(account['observedAt']);
    final age = observed == null ? null : now.difference(observed);
    final stale = age != null && age > const Duration(minutes: 10);
    final windows =
        (account['windows'] is List ? account['windows'] as List : [])
            .whereType<Map>()
            .toList();
    return DockFrame(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${account['name'] ?? account['provider'] ?? 'Account'}',
              style: const TextStyle(
                fontSize: 20,
                color: blue,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              observed == null
                  ? 'Last update unknown'
                  : stale
                  ? 'Stale · Updated ${localUsageDate(context, observed)}'
                  : age!.isNegative
                  ? 'Check PC clock · ${localUsageDate(context, observed)}'
                  : age.inMinutes < 1
                  ? 'Updated just now'
                  : 'Updated ${age.inMinutes} min ago',
              style: TextStyle(fontSize: 12, color: stale ? pink : muted),
            ),
            if (windows.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 16),
                child: Text(
                  'No limits reported for this account.',
                  style: TextStyle(color: muted),
                ),
              ),
            for (final window in windows)
              Padding(
                padding: const EdgeInsets.only(top: 20),
                child: UsageWindow(window: window),
              ),
          ],
        ),
      ),
    );
  }
}

class UsageWindow extends StatelessWidget {
  final Map<dynamic, dynamic> window;
  const UsageWindow({super.key, required this.window});

  @override
  Widget build(BuildContext context) {
    final used = usagePercent(window['usedPercent']);
    final label = windowLabel(window['minutes']);
    final reset = usageDate(window['resetsAt']);
    final amount = used == null ? 'Unknown' : '${percentLabel(used)}% used';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: double.infinity,
          child: Wrap(
            alignment: WrapAlignment.spaceBetween,
            spacing: 16,
            runSpacing: 4,
            children: [
              Text(label, style: const TextStyle(fontWeight: FontWeight.w500)),
              Text(
                amount,
                style: const TextStyle(
                  color: pink,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Semantics(
          label: '$label account usage',
          value: amount,
          child: ExcludeSemantics(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: Container(
                width: double.infinity,
                height: 10,
                color: const Color(0xff2b2d40),
                alignment: AlignmentDirectional.centerStart,
                child: FractionallySizedBox(
                  key: const ValueKey('usage-bar'),
                  widthFactor: (used ?? 0) / 100,
                  heightFactor: 1,
                  child: const DecoratedBox(
                    decoration: BoxDecoration(gradient: dockGradient),
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          reset == null
              ? 'Reset time unavailable'
              : reset.isBefore(DateTime.now())
              ? 'Reset time passed · refresh to check'
              : 'Resets ${localUsageDate(context, reset)}',
          style: const TextStyle(fontSize: 12, color: muted, height: 1.4),
        ),
      ],
    );
  }
}

class ApiUsageCard extends StatelessWidget {
  final Map<dynamic, dynamic> summary;
  const ApiUsageCard({super.key, required this.summary});

  @override
  Widget build(BuildContext context) {
    final cost = summary['cost'];
    final known = cost is num && cost.isFinite && cost >= 0;
    return DockFrame(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'API estimate',
              style: TextStyle(color: blue, fontSize: 18),
            ),
            const SizedBox(height: 8),
            Text(
              known ? '\$${cost.toStringAsFixed(4)}' : 'Unknown',
              style: const TextStyle(
                color: pink,
                fontSize: 28,
                fontWeight: FontWeight.w600,
              ),
            ),
            const Text(
              'Last 30 days · Requests through Dock only',
              style: TextStyle(color: muted, fontSize: 12, height: 1.5),
            ),
            const SizedBox(height: 10),
            Text(
              '${summary['unpriced'] ?? 0} unpriced requests · ${summary['unknownUsage'] ?? 0} with unknown usage',
              style: const TextStyle(color: muted, fontSize: 12, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }
}
