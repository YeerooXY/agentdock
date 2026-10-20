import 'package:flutter/material.dart';

import 'dock_style.dart';
import 'agent_identity.dart';

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

Color accountColor(String provider) =>
    ['codex', 'openai'].contains(provider.toLowerCase())
    ? blue
    : AgentIdentity.of(provider).color;

class AccountProviderHeader extends StatelessWidget {
  final String provider, name;
  const AccountProviderHeader({
    super.key,
    required this.provider,
    required this.name,
  });

  @override
  Widget build(BuildContext context) => Row(
    children: [
      AgentMark(provider, size: 32),
      const SizedBox(width: 12),
      Expanded(
        child: Text(
          name,
          style: TextStyle(
            fontSize: 20,
            color: accountColor(provider),
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    ],
  );
}

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
    final provider = '${account['provider'] ?? ''}';
    final accent = accountColor(provider);
    final now = DateTime.now(), observed = usageDate(account['observedAt']);
    final age = observed == null ? null : now.difference(observed);
    final stale = age != null && age > const Duration(minutes: 10);
    final windows =
        (account['windows'] is List ? account['windows'] as List : [])
            .whereType<Map>()
            .toList();
    return DockFrame(
      background: Color.alphaBlend(
        accent.withValues(alpha: .04),
        const Color(0xff0b0c14),
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AccountProviderHeader(
              provider: provider,
              name: '${account['name'] ?? account['provider'] ?? 'Account'}',
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
                child: UsageWindow(window: window, accent: accent),
              ),
          ],
        ),
      ),
    );
  }
}

class UsageWindow extends StatelessWidget {
  final Map<dynamic, dynamic> window;
  final Color accent;
  const UsageWindow({super.key, required this.window, this.accent = blue});

  @override
  Widget build(BuildContext context) {
    final used = usagePercent(window['usedPercent']);
    final remaining = used == null ? null : 100 - used;
    final label = windowLabel(window['minutes']);
    final reset = usageDate(window['resetsAt']);
    final amount = remaining == null
        ? 'Unknown'
        : '${percentLabel(remaining)}% left';
    final color = remaining != null && remaining <= 10
        ? const Color(0xffefbc7a)
        : accent;
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
                style: TextStyle(color: color, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Semantics(
          label: '$label allowance remaining',
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
                  widthFactor: (remaining ?? 0) / 100,
                  heightFactor: 1,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [color.withValues(alpha: .8), color],
                      ),
                    ),
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
