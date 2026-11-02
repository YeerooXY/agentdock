import 'package:flutter/foundation.dart';

/// Counts builds of named regions so tests can prove which parts of the app
/// rebuild. Cheap enough to leave in release builds.
class BuildCounts {
  BuildCounts._();
  static final _counts = <String, int>{};

  static void hit(String region) => _counts.update(region, (v) => v + 1, ifAbsent: () => 1);

  @visibleForTesting
  static int of(String region) => _counts[region] ?? 0;

  @visibleForTesting
  static void reset() => _counts.clear();
}
