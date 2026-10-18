import 'dart:math';

import 'package:flutter/material.dart';
import 'package:xterm/xterm.dart';

import 'dock_client.dart';
import 'dock_style.dart';
import 'pair_page.dart';
import 'results_page.dart';
import 'settings_page.dart';

export 'dock_style.dart' show blue, pink, ink;

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(DockApp(client: DockClient()..restore()));
}

class DockApp extends StatelessWidget {
  final DockClient client;
  const DockApp({super.key, required this.client});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Agent Dock',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      brightness: Brightness.dark,
      useMaterial3: true,
      scaffoldBackgroundColor: ink,
      colorScheme: const ColorScheme.dark(
        primary: blue,
        secondary: pink,
        surface: Color(0xff0b0c14),
        error: Color(0xffffa7bc),
      ),
      appBarTheme: const AppBarTheme(backgroundColor: ink, centerTitle: false),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xff11131e),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: blue.withValues(alpha: .55)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: pink, width: 1.5),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(minimumSize: const Size(48, 48)),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(48, 48),
          side: BorderSide(color: blue.withValues(alpha: .55)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
      ),
      navigationBarTheme: const NavigationBarThemeData(
        backgroundColor: Color(0xff090a11),
        indicatorColor: Color(0xff2b2847),
      ),
      badgeTheme: const BadgeThemeData(
        backgroundColor: Color(0xffdc3249),
        textColor: Colors.white,
      ),
    ),
    home: DockHome(client: client),
  );
}

class DockHome extends StatefulWidget {
  final DockClient client;
  const DockHome({super.key, required this.client});
  @override
  State<DockHome> createState() => _DockHomeState();
}

class _DockHomeState extends State<DockHome> with WidgetsBindingObserver {
  DockClient get c => widget.client;
  int page = 0;
  final composer = TextEditingController(), composerFocus = FocusNode();
  // xterm requests focus on touch-down, before it can recognize a scroll.
  // Only the keyboard button may enable terminal focus.
  final terminalFocus = FocusNode(canRequestFocus: false, skipTraversal: true);
  bool keyboardWasVisible = false;
  bool sending = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    terminalFocus.addListener(terminalFocusChanged);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    composer.dispose();
    composerFocus.dispose();
    terminalFocus.removeListener(terminalFocusChanged);
    terminalFocus.dispose();
    super.dispose();
  }

  void terminalFocusChanged() {
    if (!terminalFocus.hasFocus) stopTerminalTyping();
  }

  void stopTerminalTyping() {
    terminalFocus.canRequestFocus = false;
  }

  void startTerminalTyping() {
    terminalFocus.canRequestFocus = true;
    terminalFocus.requestFocus();
  }

  @override
  void didChangeMetrics() {
    final visible = View.of(context).viewInsets.bottom > 0;
    // Android's Back button hides the IME without clearing xterm's focus.
    if (keyboardWasVisible && !visible) stopTerminalTyping();
    keyboardWasVisible = visible;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) c.setForeground(true);
    if ([
      AppLifecycleState.paused,
      AppLifecycleState.hidden,
      AppLifecycleState.detached,
    ].contains(state)) {
      stopTerminalTyping();
      c.setForeground(false);
    }
  }

  Future<void> run(Future<dynamic> Function() action) async {
    try {
      await action();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Bad state: ', ''))),
        );
      }
    }
  }

  Future<void> send() async {
    if (sending || composer.text.trim().isEmpty) return;
    final text = composer.text;
    setState(() => sending = true);
    await run(() async {
      await c.submit(text);
      if (mounted && composer.text == text) composer.clear();
    });
    if (mounted) setState(() => sending = false);
  }

  Future<void> newConsole() async {
    final name = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New console'),
        content: TextField(
          controller: name,
          maxLength: 64,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Name (optional)'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, name.text),
            child: const Text('Open'),
          ),
        ],
      ),
    );
    name.dispose();
    if (value == null) return;
    await run(() async {
      final session = await c.request('console.create', {'name': value});
      await c.select(session['id'] as String);
    });
  }

  Future<void> switchConsole() async {
    stopTerminalTyping();
    composerFocus.unfocus();
    final id = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const Padding(
              padding: EdgeInsets.all(20),
              child: Text(
                'Consoles',
                style: TextStyle(fontSize: 22, color: pink),
              ),
            ),
            ...c.sessions.map(
              (s) => ListTile(
                leading: Badge(
                  isLabelVisible: ['ready', 'attention'].contains(s['state']),
                  child: const Icon(Icons.terminal, color: blue),
                ),
                title: Text(
                  s['name'] as String,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: Text('${s['provider']} · ${s['state']}'),
                trailing: s['id'] == c.selected
                    ? const Icon(Icons.check, color: pink)
                    : null,
                onTap: () => Navigator.pop(ctx, s['id']),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.add, color: pink),
              title: const Text('New console'),
              onTap: () => Navigator.pop(ctx, '+'),
            ),
          ],
        ),
      ),
    );
    if (id == '+') {
      await newConsole();
    } else if (id != null) {
      await run(() => c.select(id));
    }
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: c,
    builder: (context, _) {
      if (c.pairing == null) return PairPage(client: c);
      final current = c.sessions
          .where((s) => s['id'] == c.selected)
          .firstOrNull;
      return Scaffold(
        appBar: AppBar(
          leading: const Padding(
            padding: EdgeInsets.all(14),
            child: DockMark(),
          ),
          title: Text(
            page == 0
                ? (current?['name'] as String? ?? 'Consoles')
                : page == 1
                ? 'Results'
                : 'Usage',
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: pink, fontWeight: FontWeight.w600),
          ),
          actions: [
            if (page == 0)
              IconButton(
                onPressed: c.connected ? switchConsole : null,
                icon: const Icon(Icons.grid_view_rounded, color: blue),
                tooltip: 'Switch console',
              ),
            IconButton(
              onPressed: () => run(c.connect),
              icon: Icon(
                c.connected ? Icons.link : Icons.sync,
                color: c.connected ? blue : pink,
              ),
              tooltip: c.connected ? 'Connected' : 'Reconnect',
            ),
          ],
        ),
        body: SafeArea(
          top: false,
          child: Column(
            children: [
              if (!c.connected)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 10,
                  ),
                  color: const Color(0xff2b2035),
                  child: Text(c.status, style: const TextStyle(fontSize: 12)),
                ),
              Expanded(
                child: page == 0
                    ? terminal(current)
                    : page == 1
                    ? ResultsPage(client: c)
                    : SettingsPage(client: c),
              ),
            ],
          ),
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: page,
          onDestinationSelected: (value) {
            stopTerminalTyping();
            composerFocus.unfocus();
            setState(() => page = value);
            run(() => c.setStreaming(value == 0));
          },
          destinations: [
            const NavigationDestination(
              icon: Icon(Icons.terminal, color: blue),
              label: 'Console',
            ),
            NavigationDestination(
              icon: Badge(
                isLabelVisible: (c.state['unreadResults'] as num? ?? 0) > 0,
                label: Text('${c.state['unreadResults'] ?? 0}'),
                child: const Icon(Icons.photo_library_outlined, color: pink),
              ),
              label: 'Results',
            ),
            const NavigationDestination(
              icon: Icon(Icons.bar_chart_rounded, color: blue),
              label: 'Usage',
            ),
          ],
        ),
      );
    },
  );
  Widget terminal(Map<String, dynamic>? session) {
    final view = c.screen;
    if (session == null) {
      return Center(
        child: FilledButton.icon(
          onPressed: c.connected ? newConsole : null,
          icon: const Icon(Icons.add),
          label: const Text('New console'),
        ),
      );
    }
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
          child: Row(
            children: [
              Icon(
                session['state'] == 'ready'
                    ? Icons.check_circle_outline
                    : Icons.circle,
                size: 12,
                color: session['state'] == 'ready'
                    ? const Color(0xff96e6b8)
                    : blue,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${session['provider']} · ${session['state']}',
                  style: const TextStyle(
                    color: Color(0xffb5bbd0),
                    fontSize: 12,
                  ),
                ),
              ),
              Text(
                '${session['slot']} / ${c.state['capacity'] ?? 9}',
                style: const TextStyle(color: blue, fontSize: 12),
              ),
            ],
          ),
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: DockFrame(
              radius: 14,
              background: Colors.black,
              ready: session['state'] == 'ready',
              child: view == null
                  ? const Center(child: CircularProgressIndicator())
                  : LayoutBuilder(
                      builder: (ctx, size) => Listener(
                        onPointerDown: (_) {
                          stopTerminalTyping();
                          composerFocus.unfocus();
                          if ([
                            'ready',
                            'attention',
                          ].contains(session['state'])) {
                            run(c.acknowledge);
                          }
                        },
                        child: SingleChildScrollView(
                          key: ValueKey((c.selected, view.cols)),
                          scrollDirection: Axis.horizontal,
                          child: SizedBox(
                            width: max(size.maxWidth, view.cols * 7.3 + 16),
                            height: size.maxHeight,
                            child: TerminalView(
                              view.terminal,
                              key: ValueKey((c.selected, view.terminal)),
                              autoResize: false,
                              readOnly: !c.connected,
                              focusNode: terminalFocus,
                              deleteDetection: true,
                              textStyle: const TerminalStyle(
                                fontSize: 12,
                                height: 1.3,
                              ),
                              padding: const EdgeInsets.all(8),
                              theme: terminalTheme,
                            ),
                          ),
                        ),
                      ),
                    ),
            ),
          ),
        ),
        Row(
          children: [
            Expanded(
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final key in [
                      ('Enter', '\r'),
                      ('Esc', '\x1b'),
                      ('Tab', '\t'),
                      ('Ctrl C', '\x03'),
                      ('↑', '\x1b[A'),
                      ('↓', '\x1b[B'),
                      ('←', '\x1b[D'),
                      ('→', '\x1b[C'),
                    ])
                      TextButton(
                        onPressed: c.connected && !sending
                            ? () => run(() => c.input(key.$2))
                            : null,
                        child: Text(key.$1),
                      ),
                  ],
                ),
              ),
            ),
            IconButton(
              tooltip: 'Type directly in terminal',
              onPressed: c.connected ? startTerminalTyping : null,
              icon: const Icon(Icons.keyboard_alt_outlined, color: pink),
            ),
          ],
        ),
        if (c.inputError.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              c.inputError,
              style: const TextStyle(color: pink, fontSize: 12),
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 0, 10, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: composer,
                  focusNode: composerFocus,
                  minLines: 1,
                  maxLines: 3,
                  textInputAction: TextInputAction.newline,
                  autocorrect: false,
                  enableSuggestions: false,
                  decoration: const InputDecoration(
                    labelText: 'Command or message',
                    isDense: true,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              DockSendButton(
                onPressed: c.connected && !sending ? send : null,
                sending: sending,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class DockMark extends StatelessWidget {
  const DockMark({super.key});
  @override
  Widget build(BuildContext context) => ShaderMask(
    shaderCallback: (rect) =>
        const LinearGradient(colors: [blue, pink]).createShader(rect),
    child: const Icon(Icons.auto_awesome, color: Colors.white),
  );
}

String formatBytes(int bytes) => bytes < 1024
    ? '$bytes B'
    : bytes < 1024 * 1024
    ? '${(bytes / 1024).toStringAsFixed(1)} KB'
    : '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
const terminalTheme = TerminalTheme(
  cursor: pink,
  selection: Color(0xff33405c),
  foreground: Color(0xffe5e7ef),
  background: Color(0xff010103),
  black: Color(0xff1b2126),
  red: Color(0xffef8a86),
  green: Color(0xffb9e888),
  yellow: Color(0xffe8c57e),
  blue: blue,
  magenta: pink,
  cyan: Color(0xff89ccc4),
  white: Color(0xffe1e8e3),
  brightBlack: Color(0xff81908d),
  brightRed: Color(0xffffa5a0),
  brightGreen: Color(0xffceffa2),
  brightYellow: Color(0xffffdfa0),
  brightBlue: Color(0xffb9d3ff),
  brightMagenta: Color(0xffffb9e4),
  brightCyan: Color(0xffb9fff3),
  brightWhite: Colors.white,
  searchHitBackground: Color(0xff51436c),
  searchHitBackgroundCurrent: Color(0xff685383),
  searchHitForeground: Colors.white,
);
