import 'dart:async';
import 'dart:math';

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
  // Bound text layout on long chats; every retained row remains pageable.
  static const _pageRows = 120;
  final _scroll = ScrollController();
  final _readingFocus = FocusNode();
  TextSpan _span = const TextSpan();
  int? _pageEnd;
  BufferLine? _anchor;
  int _start = 0, _end = 0, _bufferLength = 0;
  Timer? _timer;
  bool _selecting = false;
  bool _pending = false;
  // Whether the reader was at the newest output before the viewport resized.
  bool _atEnd = true;
  double _height = 0;

  @override
  void initState() {
    super.initState();
    _restorePage();
    _span = _readPage();
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
      _restorePage();
      _span = _readPage();
      _restorePlace();
    } else if (oldWidget.theme != widget.theme) {
      _span = _readPage();
    }
  }

  TextSpan _readPage() {
    final length = widget.terminal.buffer.lines.length;
    _bufferLength = length;
    _end = min(_pageEnd ?? length, length);
    _start = max(0, _end - _pageRows);
    _anchor = length > 0 ? widget.terminal.buffer.lines[_start] : null;
    return terminalReadingSpan(
      widget.terminal,
      widget.theme,
      start: _start,
      end: _end,
    );
  }

  void _restorePage() {
    final end = widget.positions?.position(widget.positionKey, 'readingEnd');
    _pageEnd = end != null && end >= 0 ? end.toInt() : null;
  }

  void _movePage(int direction) {
    final lines = widget.terminal.buffer.lines;
    var start = 0;
    // Scrollback can roll while a page is frozen. Locate its original row.
    for (var y = 0; y < lines.length; y++) {
      if (identical(lines[y], _anchor)) {
        start = y;
        break;
      }
    }
    final end = direction < 0
        ? max(1, start)
        : start + (_end - _start) + _pageRows;
    _showPage(end >= lines.length ? null : end);
  }

  void _showPage(int? end) {
    setState(() {
      _pageEnd = end;
      _pending = _selecting = false;
      _atEnd = true;
      _span = _readPage();
    });
    widget.positions?.remember(widget.positionKey, 'readingEnd', end ?? -1);
    _followEnd();
    // Page controls may become disabled; keep keyboard focus in the reader.
    _readingFocus.requestFocus();
  }

  void _savePlace() {
    if (_scroll.hasClients) {
      _atEnd = _scroll.position.extentAfter < 24;
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
      if (widget.terminal.buffer.lines.length < _bufferLength) {
        _pageEnd = null;
        _pending = _selecting = false;
        _atEnd = true;
      }
      if (_selecting || _pageEnd != null || !_atEnd) {
        if (!_pending) setState(() => _pending = true);
        return;
      }
      // Convert only the current page; older rows do not enter text layout.
      final span = _readPage();
      if (_span.compareTo(span) == RenderComparison.identical) return;
      final following =
          !_scroll.hasClients || _scroll.position.extentAfter < 24;
      setState(() => _span = span);
      if (following) _followEnd();
    });
  }

  @override
  void dispose() {
    widget.terminal.removeListener(_changed);
    _timer?.cancel();
    _scroll.dispose();
    _readingFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      if (widget.terminal.buffer.lines.length > _pageRows)
        Wrap(
          children: [
            TextButton(
              onPressed: _start > 0 ? () => _movePage(-1) : null,
              child: const Text('Earlier'),
            ),
            TextButton(
              onPressed: _pageEnd != null ? () => _movePage(1) : null,
              child: const Text('Later'),
            ),
            IconButton(
              tooltip: 'Latest output',
              onPressed: _pageEnd != null ? () => _showPage(null) : null,
              icon: const Icon(Icons.vertical_align_bottom),
            ),
          ],
        ),
      if (_pending)
        Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            icon: const Icon(Icons.refresh, size: 18),
            label: const Text('Show new output'),
            onPressed: () {
              _showPage(null);
            },
          ),
        ),
      Expanded(
        child: LayoutBuilder(
          builder: (context, box) {
            // The keyboard and the chat field resize this view; keep the
            // prompt in sight when the reader was following the output.
            if (box.maxHeight != _height) {
              // The first layout keeps the place _restorePlace chose.
              if (_height != 0 && _atEnd) _followEnd();
              _height = box.maxHeight;
            }
            return SingleChildScrollView(
              key: const ValueKey('terminal-reading-scroll'),
              controller: _scroll,
              padding: const EdgeInsets.all(12),
              child: SizedBox(
                width: double.infinity,
                child: SelectableText.rich(
                  _span,
                  focusNode: _readingFocus,
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
            );
          },
        ),
      ),
    ],
  );
}
