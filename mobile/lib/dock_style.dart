import 'package:flutter/material.dart';

const blue = Color(0xff9cbfff),
    pink = Color(0xffee9fd7),
    ink = Color(0xff030407),
    muted = Color(0xffb3bad0);
const dockGradient = LinearGradient(colors: [blue, pink]);

/// A quiet accent border shared by the console and usage cards.
class DockFrame extends StatelessWidget {
  final Widget child;
  final bool ready;
  final double radius;
  final Color background;
  const DockFrame({
    super.key,
    required this.child,
    this.ready = false,
    this.radius = 18,
    this.background = const Color(0xff0b0c14),
  });

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(1),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(radius),
      gradient: LinearGradient(
        colors: ready
            ? const [Color(0xff74c69a), Color(0xff4c9b70)]
            : [blue.withValues(alpha: .55), pink.withValues(alpha: .55)],
      ),
    ),
    child: ClipRRect(
      borderRadius: BorderRadius.circular(radius - 1),
      child: Material(color: background, child: child),
    ),
  );
}

class DockSendButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final bool sending;
  const DockSendButton({super.key, this.onPressed, this.sending = false});

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(14),
      gradient: onPressed != null || sending ? dockGradient : null,
      color: const Color(0xff292637),
    ),
    child: IconButton(
      tooltip: 'Send to console',
      onPressed: onPressed,
      style: IconButton.styleFrom(
        foregroundColor: ink,
        disabledForegroundColor: muted,
        minimumSize: const Size(48, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      icon: sending
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2, color: ink),
            )
          : const Icon(Icons.arrow_upward),
    ),
  );
}
