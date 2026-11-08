import 'package:flutter/widgets.dart';

/// Keyboard focus for typing directly into the terminal.
///
/// xterm requests focus on touch-down, before it can recognize a scroll, so
/// the node refuses focus until the user explicitly chooses to type.
class TerminalTyping {
  TerminalTyping() {
    focus.addListener(_focusChanged);
  }

  final FocusNode focus = FocusNode(
    canRequestFocus: false,
    skipTraversal: true,
  );

  void _focusChanged() {
    if (!focus.hasFocus) stop();
  }

  void stop() => focus.canRequestFocus = false;

  void start() {
    focus.canRequestFocus = true;
    focus.requestFocus();
  }

  void dispose() {
    focus.removeListener(_focusChanged);
    focus.dispose();
  }
}
