import 'package:flutter/material.dart';

import 'dock_style.dart';

class WorktreeBadge extends StatelessWidget {
  final Map<String, dynamic> session;
  const WorktreeBadge({super.key, required this.session});

  @override
  Widget build(BuildContext context) {
    final tree = session['worktree'];
    if (tree is! Map || tree['branch'] is! String || tree['path'] is! String) {
      return const SizedBox.shrink();
    }
    final branch = tree['branch'] as String, path = tree['path'] as String;
    return Tooltip(
      message: 'Git worktree: $path',
      child: Semantics(
        label: 'Git worktree branch $branch, folder $path',
        child: ExcludeSemantics(
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.account_tree_outlined, size: 14, color: muted),
            const SizedBox(width: 4),
            Flexible(child: Text(branch, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: muted, fontSize: 12))),
          ]),
        ),
      ),
    );
  }
}
