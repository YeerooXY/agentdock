import 'dart:math';

import 'package:flutter/material.dart';

import 'agent_identity.dart';
import 'dock_client.dart';
import 'dock_style.dart';

class ConsoleSwitcher extends StatefulWidget {
  final DockClient client;
  final String name;
  final bool showAgentMark;
  final VoidCallback onOpened;
  final ValueChanged<String> onSelected;
  const ConsoleSwitcher({
    super.key,
    required this.client,
    required this.name,
    this.showAgentMark = true,
    required this.onOpened,
    required this.onSelected,
  });
  @override
  State<ConsoleSwitcher> createState() => _ConsoleSwitcherState();
}

class _ConsoleSwitcherState extends State<ConsoleSwitcher> {
  bool open = false;
  String pc = '';
  int generation = -1;
  @override
  Widget build(BuildContext context) => PopupMenuButton<String>(
    tooltip: 'Switch console',
    enabled: widget.client.connected,
    position: PopupMenuPosition.under,
    onOpened: () {
      pc = widget.client.activePC;
      generation = widget.client.generation;
      widget.onOpened();
      setState(() => open = true);
    },
    onCanceled: () => setState(() => open = false),
    onSelected: (value) {
      setState(() => open = false);
      if (widget.client.connected &&
          widget.client.activePC == pc &&
          widget.client.generation == generation) {
        widget.onSelected(value);
      }
    },
    constraints: BoxConstraints(
      minWidth: min(240, MediaQuery.sizeOf(context).width - 32),
      maxWidth: min(340, MediaQuery.sizeOf(context).width - 32),
      maxHeight: MediaQuery.sizeOf(context).height * .65,
    ),
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(14),
      side: BorderSide(color: blue.withValues(alpha: .5)),
    ),
    popUpAnimationStyle: MediaQuery.disableAnimationsOf(context)
        ? AnimationStyle.noAnimation
        : const AnimationStyle(
            duration: Duration(milliseconds: 180),
            reverseDuration: Duration(milliseconds: 130),
            curve: Curves.easeOutCubic,
          ),
    itemBuilder: (_) => [
      for (final session in widget.client.sessions)
        PopupMenuItem(
          value: session['id'] as String,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                Badge(
                  isLabelVisible: [
                    'ready',
                    'attention',
                  ].contains(session['state']),
                  child: AgentMark(session['provider'] as String, size: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    session['name'] as String,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (session['id'] == widget.client.selected)
                  const Icon(Icons.check, size: 20, color: pink),
              ],
            ),
          ),
        ),
      const PopupMenuDivider(),
      const PopupMenuItem(
        value: '+',
        child: Row(
          children: [
            Icon(Icons.add, color: pink),
            SizedBox(width: 12),
            Text('New console'),
          ],
        ),
      ),
    ],
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (widget.showAgentMark)
            if (widget.client.sessions
                    .where((s) => s['id'] == widget.client.selected)
                    .firstOrNull
                case final session?) ...[
              AgentMark(session['provider'] as String, size: 20),
              const SizedBox(width: 5),
            ],
          Flexible(
            child: Text(
              widget.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 18,
                color: pink,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(width: 4),
          AnimatedRotation(
            turns: open ? .5 : 0,
            duration: MediaQuery.disableAnimationsOf(context)
                ? Duration.zero
                : const Duration(milliseconds: 180),
            child: const Icon(Icons.expand_more, size: 19, color: pink),
          ),
        ],
      ),
    ),
  );
}
