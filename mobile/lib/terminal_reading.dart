import 'dart:async';

import 'package:flutter/material.dart';
import 'package:xterm/xterm.dart';

import 'terminal_styles.dart';
export 'terminal_styles.dart' show terminalReadingText;
import 'console_drafts.dart';

class TerminalReadingView extends StatefulWidget {
  final Terminal terminal;
  final TerminalTheme theme;
  final ConsoleDrafts? positions;
  final String positionKey;
  const TerminalReadingView({
    super.key,
    required this.terminal,
    this.theme = TerminalThemes.defaultTheme,
    this.positions,
    this.positionKey = '',
  });

  @override
  State<TerminalReadingView> createState() => _TerminalReadingViewState();
}

class _TerminalReadingViewState extends State<TerminalReadingView> {
  final _scroll = ScrollController();
  String _text = '';
  TextSpan _span = const TextSpan();
  Timer? _timer;
  bool _selecting = false;
  bool _pending = false;

  @override
  void initState() {
    super.initState();
    _text = terminalReadingText(widget.terminal);
    _span = terminalReadingSpan(widget.terminal, widget.theme);
    _scroll.addListener(_savePlace);
    widget.terminal.addListener(_changed);
    _restorePlace();
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
      _span = terminalReadingSpan(widget.terminal, widget.theme);
      _restorePlace();
    } else if (oldWidget.theme != widget.theme) {
      _span = terminalReadingSpan(widget.terminal, widget.theme);
    }
  }

  void _savePlace() {
    if (_scroll.hasClients) {
      widget.positions?.remember(
        widget.positionKey,
        'reading',
        _scroll.position.extentAfter < 24 ? -1 : _scroll.offset,
      );
    }
  }

  void _restorePlace() {
    final saved = widget.positions?.position(widget.positionKey, 'reading');
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      _scroll.jumpTo(
        saved == null || saved < 0
            ? _scroll.position.maxScrollExtent
            : saved.toDouble().clamp(0.0, _scroll.position.maxScrollExtent),
      );
    });
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
      final span = terminalReadingSpan(widget.terminal, widget.theme);
      if (_text == next &&
          _span.compareTo(span) == RenderComparison.identical) {
        return;
      }
      final following =
          !_scroll.hasClients || _scroll.position.extentAfter < 24;
      setState(() {
        _text = next;
        _span = span;
      });
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
                _span = terminalReadingSpan(widget.terminal, widget.theme);
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
            child: SelectableText.rich(
              _span,
              key: ValueKey(widget.positionKey),
              // Native selection handles and Copy; selection never requests
              // terminal input or sends anything to the PC.
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 16,
                height: 1.45,
                color: Color(0xffe4e7ef),
              ),
              cursorColor: widget.theme.cursor,
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
