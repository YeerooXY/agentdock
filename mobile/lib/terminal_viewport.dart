import 'dart:math';

import 'package:flutter/material.dart';
import 'package:xterm/xterm.dart';

import 'terminal_reading.dart';

/// Changes only the phone's rendering. The PC owns the terminal's cell grid.
class TerminalViewport extends StatefulWidget {
  final Terminal terminal;
  final int columns;
  final bool fitWidth, readOnly;
  final FocusNode focusNode;
  final TerminalTheme theme;

  const TerminalViewport({
    super.key,
    required this.terminal,
    required this.columns,
    required this.fitWidth,
    required this.readOnly,
    required this.focusNode,
    required this.theme,
  });

  @override
  State<TerminalViewport> createState() => _TerminalViewportState();
}

class _TerminalViewportState extends State<TerminalViewport> {
  static const _style = TerminalStyle(fontSize: 14, height: 1.3);
  static const _padding = EdgeInsets.all(8);
  final _scroll = ScrollController();
  var _view = GlobalKey<TerminalViewState>();
  ({
    double width,
    double height,
    double fontSize,
    int columns,
    Terminal terminal,
  })?
  _layout;
  int _layoutRevision = 0;

  @override
  void didUpdateWidget(TerminalViewport oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.terminal != widget.terminal) {
      _view = GlobalKey<TerminalViewState>();
    }
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _keepPlace(double width, double height, TextScaler scaler) {
    final layout = (
      width: width,
      height: height,
      fontSize: scaler.scale(_style.fontSize),
      columns: widget.columns,
      terminal: widget.terminal,
    );
    if (_layout == layout) return;
    final old = _view.currentState?.renderTerminal;
    final changedTerminal = _layout?.terminal != widget.terminal;
    final line = old != null && _scroll.hasClients
        ? _scroll.offset / old.cellSize.height
        : 0.0;
    final followCursor =
        changedTerminal ||
        old == null ||
        !_scroll.hasClients ||
        _scroll.offset >= _scroll.position.maxScrollExtent - 1 ||
        (old.cursorOffset.dy >= 0 && old.cursorOffset.dy < old.size.height);
    _layout = layout;
    final revision = ++_layoutRevision;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || revision != _layoutRevision || !_scroll.hasClients) {
        return;
      }
      final render = _view.currentState?.renderTerminal;
      if (render == null) return;
      // A short landscape viewport must not settle on blank cells below the
      // prompt. A reader in scrollback keeps the same first visible line.
      final offset = followCursor
          ? (widget.terminal.buffer.absoluteCursorY + 1) *
                    render.cellSize.height -
                render.size.height
          : line * render.cellSize.height;
      _scroll.jumpTo(offset.clamp(0.0, _scroll.position.maxScrollExtent));
    });
  }

  double _cellWidth(TextScaler scaler) {
    // Measure the same monospace font as xterm, including its fallback fonts.
    final painter = TextPainter(
      text: TextSpan(text: 'mmmmmmmmmm', style: _style.toTextStyle()),
      textDirection: TextDirection.ltr,
      textScaler: scaler,
    )..layout();
    final width = painter.width / 10;
    painter.dispose();
    return width;
  }

  @override
  Widget build(BuildContext context) => !widget.fitWidth
      ? TerminalReadingView(terminal: widget.terminal)
      : LayoutBuilder(
          builder: (context, constraints) {
            final cols = max(1, widget.columns);
            final available = max(
              1.0,
              constraints.maxWidth - _padding.horizontal - 1,
            );
            final scaler = widget.fitWidth
                ? TextScaler.linear(
                    min(
                      1.0,
                      available / (cols * _cellWidth(TextScaler.noScaling)),
                    ),
                  )
                : MediaQuery.textScalerOf(context);
            final width = widget.fitWidth
                ? constraints.maxWidth
                : max(
                    constraints.maxWidth,
                    cols * _cellWidth(scaler) + _padding.horizontal + 1,
                  );
            _keepPlace(width, constraints.maxHeight, scaler);
            return SingleChildScrollView(
              key: const ValueKey('terminal-horizontal-scroll'),
              scrollDirection: Axis.horizontal,
              physics: widget.fitWidth
                  ? const NeverScrollableScrollPhysics()
                  : null,
              child: SizedBox(
                width: width,
                height: constraints.maxHeight,
                child: TerminalView(
                  widget.terminal,
                  key: _view,
                  scrollController: _scroll,
                  autoResize: false,
                  readOnly: widget.readOnly,
                  focusNode: widget.focusNode,
                  deleteDetection: true,
                  textStyle: _style,
                  textScaler: scaler,
                  padding: _padding,
                  theme: widget.theme,
                ),
              ),
            );
          },
        );
}
