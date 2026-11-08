import 'package:flutter/material.dart';

import '../../dock_style.dart';

/// Connection or console state as a small dot. Reachable states pulse unless
/// the platform asks for reduced motion.
class StatusDot extends StatefulWidget {
  final String state;
  const StatusDot({super.key, required this.state});

  @override
  State<StatusDot> createState() => _StatusDotState();
}

class _StatusDotState extends State<StatusDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void dispose() {
    pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reachable = [
      'ready',
      'open',
      'attention',
      'idle',
    ].contains(widget.state);
    final working = widget.state == 'working' || widget.state == 'active';
    final animate =
        reachable &&
        !MediaQuery.disableAnimationsOf(context) &&
        TickerMode.valuesOf(context).enabled;
    if (animate && !pulse.isAnimating) pulse.repeat(reverse: true);
    if (!animate && pulse.isAnimating) pulse.stop();
    final color = reachable
        ? const Color(0xff8ee6aa)
        : working
        ? blue
        : const Color(0xffef777f);
    final label = working
        ? 'Working'
        : reachable
        ? 'Connected'
        : 'Disconnected';
    return Tooltip(
      message: label,
      child: Semantics(
        label: label,
        child: AnimatedBuilder(
          animation: pulse,
          builder: (_, _) => Opacity(
            opacity: animate ? .62 + pulse.value * .38 : 1,
            child: Container(
              width: 9,
              height: 9,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
          ),
        ),
      ),
    );
  }
}
