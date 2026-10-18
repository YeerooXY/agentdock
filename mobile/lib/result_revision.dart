import 'package:flutter/material.dart';

import 'main.dart' show pink;

Map? resultRevision(Map item) => (item['gitEnd'] ?? item['git']) as Map?;

List<Map> turnRevisions(List<dynamic> items) {
  final revisions = <String, Map>{};
  for (final item in items) {
    final git = resultRevision(item as Map);
    if (git != null) {
      revisions['${git['repository']}|${git['branch']}|${git['commit']}|${git['dirty']}'] =
          git;
    }
  }
  return revisions.values.toList();
}

String revisionLabel(Map? git) {
  final branch = git?['branch'] as String?;
  final commit = git?['commit'] as String?;
  if (branch == null && commit == null) return 'Revision unavailable';
  final hash = commit == null
      ? (git?['unborn'] == true ? 'No commits yet' : 'Commit unavailable')
      : commit.substring(0, commit.length < 8 ? commit.length : 8);
  final head =
      branch ??
      (git?['detached'] == true ? 'Detached HEAD' : 'Branch unavailable');
  return '$head · $hash${git?['dirty'] == true ? ' · Uncommitted changes' : ''}';
}

class ResultRevision extends StatelessWidget {
  final Map? git;
  const ResultRevision(this.git, {super.key});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Tooltip(
      message: [
        git?['repository'],
        git?['commit'],
      ].whereType<String>().join('\n'),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xff111c31), Color(0xff24102b)],
          ),
          border: Border.all(color: const Color(0xff7562a0)),
          borderRadius: BorderRadius.circular(7),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.commit, color: pink, size: 18),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                revisionLabel(git),
                style: const TextStyle(color: Color(0xffd2caff), fontSize: 12),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
