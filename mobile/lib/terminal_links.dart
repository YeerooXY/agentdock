import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:xterm/xterm.dart';

import 'dock_style.dart';

Uri? terminalLinkUri(String value) {
  if (value.length > 8192 ||
      RegExp(r'[\s\x00-\x1f\x7f\\<>"`\u202a-\u202e\u2066-\u2069]')
          .hasMatch(value) ||
      RegExp(r'%(?![a-fA-F0-9]{2})').hasMatch(value)) {
    return null;
  }
  try {
    final uri = Uri.parse(value);
    if (!['https', 'http'].contains(uri.scheme) ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.port < 1 ||
        uri.port > 65535) {
      return null;
    }
    return uri;
  } on FormatException {
    return null;
  }
}

/// Read the rendered buffer on demand. Never fetch, log or persist these URLs.
/// xterm removes soft wraps; full-width, URL-only hard wraps also occur in CLIs.
List<String> terminalLinks(Terminal terminal) {
  final rows = terminal.buffer.getText().split('\n');
  final logical = <String>[];
  for (var i = 0; i < rows.length; i++) {
    var line = rows[i].trim();
    var previousWidth = rows[i].length;
    while (line.startsWith(RegExp(r'https?://')) &&
        !RegExp(r'\s').hasMatch(line) &&
        previousWidth >= terminal.viewWidth - 2 &&
        i + 1 < rows.length &&
        line.length <= 8192) {
      final next = rows[i + 1].trim();
      if (next.isEmpty ||
          next.contains(RegExp(r'[\s<>"`\\]')) ||
          next.startsWith(RegExp(r'https?://'))) {
        break;
      }
      previousWidth = rows[++i].length;
      line += next;
    }
    logical.add(line);
  }
  final found = <String>[];
  for (final match in RegExp(
    r'''https?://[^\s<>"'`\\]+''',
  ).allMatches(logical.join('\n'))) {
    var value = match[0]!.replaceFirst(RegExp(r'[.,;!]+$'), '');
    for (final pair in [('(', ')'), ('[', ']'), ('{', '}')]) {
      while (value.endsWith(pair.$2) &&
          pair.$2.allMatches(value).length > pair.$1.allMatches(value).length) {
        value = value.substring(0, value.length - 1);
      }
    }
    if (terminalLinkUri(value) != null) found.add(value);
  }
  return found.reversed.toSet().take(30).toList();
}

class TerminalLinksSheet extends StatelessWidget {
  final List<String> links;
  final String consoleName;
  final bool enabled;
  final Future<bool> Function(Uri)? open;
  final Future<void> Function(String)? copy;
  const TerminalLinksSheet({
    super.key,
    required this.links,
    required this.consoleName,
    this.enabled = true,
    this.open,
    this.copy,
  });

  @override
  Widget build(BuildContext context) => SafeArea(
    child: ListView(
      shrinkWrap: true,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(
            'Console links',
            style: TextStyle(color: pink, fontSize: 22),
          ),
          subtitle: Text(consoleName),
          trailing: IconButton(
            tooltip: 'Close links',
            onPressed: () => Navigator.pop(context),
            icon: Icon(Icons.close, color: blue),
          ),
        ),
        if (!enabled)
          Text('Console changed. Reopen Links.', style: TextStyle(color: pink))
        else if (links.isEmpty)
          const Text(
            'No web links in this console’s loaded output.',
            style: TextStyle(color: muted),
          ),
        for (final link in links)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: _LinkCard(
              key: ValueKey(link),
              link: link,
              enabled: enabled,
              open: open,
              copy: copy,
            ),
          ),
      ],
    ),
  );
}

class _LinkCard extends StatefulWidget {
  final String link;
  final bool enabled;
  final Future<bool> Function(Uri)? open;
  final Future<void> Function(String)? copy;
  const _LinkCard({
    super.key,
    required this.link,
    required this.enabled,
    this.open,
    this.copy,
  });
  @override
  State<_LinkCard> createState() => _LinkCardState();
}

class _LinkCardState extends State<_LinkCard> {
  bool busy = false, expanded = false;
  String message = '';

  Future<void> act(bool opening) async {
    if (busy || !widget.enabled) return;
    final uri = terminalLinkUri(widget.link);
    if (uri == null) return;
    setState(() {
      busy = true;
      message = '';
    });
    try {
      if (opening) {
        final ok =
            await (widget.open?.call(uri) ??
                launchUrl(uri, mode: LaunchMode.externalApplication));
        if (!ok) throw StateError('Browser unavailable');
      } else {
        await (widget.copy?.call(widget.link) ??
            Clipboard.setData(ClipboardData(text: widget.link)));
        if (mounted) setState(() => message = 'Link copied');
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => message = opening
              ? 'Could not open the browser. Try Copy.'
              : 'Could not copy the link. Try again.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final uri = terminalLinkUri(widget.link);
    return DockFrame(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              uri?.authority ?? 'Web link',
              style: TextStyle(color: blue, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              widget.link,
              maxLines: expanded ? null : 3,
              overflow: expanded ? null : TextOverflow.ellipsis,
              style: const TextStyle(color: muted, fontSize: 13),
            ),
            Wrap(
              spacing: 8,
              children: [
                TextButton.icon(
                  onPressed: widget.enabled && !busy && uri != null
                      ? () => act(true)
                      : null,
                  icon: const Icon(Icons.open_in_browser),
                  label: const Text('Open'),
                ),
                TextButton.icon(
                  onPressed: widget.enabled && !busy && uri != null
                      ? () => act(false)
                      : null,
                  icon: Icon(Icons.copy, color: pink),
                  label: const Text('Copy'),
                ),
                TextButton(
                  onPressed: () => setState(() => expanded = !expanded),
                  child: Text(expanded ? 'Less' : 'Full link'),
                ),
              ],
            ),
            if (message.isNotEmpty)
              Text(message, style: TextStyle(color: pink)),
          ],
        ),
      ),
    );
  }
}
