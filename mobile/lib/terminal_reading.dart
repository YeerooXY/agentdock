import 'dart:async';

import 'package:flutter/material.dart';
import 'package:xterm/xterm.dart';

import 'dock_style.dart';

/// Render parsed text, never raw ANSI bytes or a second resized terminal.
/// Keep hard newlines/indentation and join only terminal soft wraps.
String terminalReadingText(Terminal terminal) =>
    terminal.buffer.getText().trimRight();

class TerminalReadingView extends StatefulWidget {
  final Terminal terminal;
  const TerminalReadingView({super.key, required this.terminal});

  @override
  State<TerminalReadingView> createState() => _TerminalReadingViewState();
}

class _TerminalReadingViewState extends State<TerminalReadingView> {
  final _scroll = ScrollController();
  String _text = '';
  Timer? _timer;
  bool _selecting = false;
  bool _pending = false;

  @override
  void initState() {
    super.initState();
    _text = terminalReadingText(widget.terminal);
    widget.terminal.addListener(_changed);
    _followEnd();
  }

  @override
  void didUpdateWidget(TerminalReadingView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.terminal != widget.terminal) {
      oldWidget.terminal.removeListener(_changed);
      widget.terminal.addListener(_changed);
      _timer?.cancel();
      _selecting = _pending = false;
      _text = terminalReadingText(widget.terminal);
      _followEnd();
    }
  }

  void _followEnd() => WidgetsBinding.instance.addPostFrameCallback((_) {
    if (mounted && _scroll.hasClients && !_selecting) {
      _scroll.jumpTo(_scroll.position.maxScrollExtent);
    }
  });

  void _changed() {
    if (_timer?.isActive == true) return;
    _timer = Timer(const Duration(milliseconds: 150), () {
      if (!mounted) return;
      if (_selecting) {
        if (!_pending) setState(() => _pending = true);
        return;
      }
      final next = terminalReadingText(widget.terminal);
      if (_text == next) return;
      final following =
          !_scroll.hasClients || _scroll.position.extentAfter < 24;
      setState(() => _text = next);
      if (following) _followEnd();
    });
  }

  @override
  void dispose() {
    widget.terminal.removeListener(_changed);
    _timer?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      if (_pending)
        Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            icon: const Icon(Icons.refresh, size: 18),
            label: const Text('Show new output'),
            onPressed: () {
              setState(() {
                _selecting = _pending = false;
                _text = terminalReadingText(widget.terminal);
              });
              _followEnd();
            },
          ),
        ),
      Expanded(
        child: SingleChildScrollView(
          key: const ValueKey('terminal-reading-scroll'),
          controller: _scroll,
          padding: const EdgeInsets.all(12),
          child: SizedBox(
            width: double.infinity,
            child: SelectableText(
              _text.isEmpty ? ' ' : _text,
              key: ValueKey(widget.terminal),
              // Native selection handles and Copy; selection never requests
              // terminal input or sends anything to the PC.
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 16,
                height: 1.45,
                color: Color(0xffe4e7ef),
              ),
              cursorColor: pink,
              showCursor: false,
              onSelectionChanged: (selection, _) {
                _selecting = !selection.isCollapsed;
                if (!_selecting && _pending) {
                  _pending = false;
                  _changed();
                }
              },
            ),
          ),
        ),
      ),
    ],
  );
}
