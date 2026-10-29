import 'dart:math';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'dock_client.dart';
import 'dock_style.dart';
import 'pair_page.dart';
import 'results_page.dart';
import 'projects_page.dart';
import 'settings_page.dart';
import 'update_panel.dart';
import 'connection_panel.dart';
import 'terminal_viewport.dart';
import 'terminal_links.dart';
import 'terminal_reading.dart';
import 'agent_identity.dart';
import 'console_actions.dart';
import 'console_switcher.dart';
import 'console_overview.dart';
import 'console_drafts.dart';
import 'code_page.dart';
import 'live_agent_controls.dart';
import 'agent_selection.dart';
import 'terminal_keys.dart';
import 'message_queue_sheet.dart';
import 'console_surface.dart';
import 'console_theme.dart';
import 'console_appearance_controls.dart';
import 'preview_page.dart';

export 'dock_style.dart' show blue, pink, ink;

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(DockApp(client: DockClient()..restore()));
}

class DockApp extends StatelessWidget {
  final DockClient client;
  const DockApp({super.key, required this.client});
  // One ThemeData per app theme; the client notifies often for output.
  static final _themes = <String, ThemeData>{};
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: client,
    builder: (context, _) {
      DockAccent.theme = client.appearance.theme;
      return _app(_themes.putIfAbsent(client.appearance.themeId, _theme));
    },
  );

  ThemeData _theme() => ThemeData(
    brightness: Brightness.dark,
    useMaterial3: true,
    scaffoldBackgroundColor: ink,
    colorScheme: ColorScheme.dark(
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
        borderSide: BorderSide(color: pink, width: 1.5),
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
  );

  Widget _app(ThemeData theme) => MaterialApp(
    title: 'Paddock',
    debugShowCheckedModeBanner: false,
    theme: theme,
    builder: (context, child) => AnimatedBuilder(
      animation: client,
      builder: (context, _) {
        final systemScale = MediaQuery.textScalerOf(context).scale(1);
        // Keep Android accessibility scaling, while allowing a small app-level
        // adjustment so dense terminal controls remain usable on small screens.
        final effective = (systemScale * client.textScale).clamp(.85, 1.55);
        return MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(effective)),
          child: child!,
        );
      },
    ),
    home: AnimatedBuilder(
      animation: client,
      builder: (_, _) =>
          DockHome(key: ValueKey(client.activePC), client: client),
    ),
  );
}

class DockHome extends StatefulWidget {
  final DockClient client;
  const DockHome({super.key, required this.client});
  @override
  State<DockHome> createState() => _DockHomeState();
}

typedef _CommandTarget = ({
  String pc,
  String session,
  String provider,
  int generation,
});

class _DockHomeState extends State<DockHome> with WidgetsBindingObserver {
  DockClient get c => widget.client;
  int page = 0;
  bool showConsoleOverview = false;
  final composer = TextEditingController(), composerFocus = FocusNode();
  final composerScroll = ScrollController();
  // xterm requests focus on touch-down, before it can recognize a scroll.
  // Only the keyboard button may enable terminal focus.
  final terminalFocus = FocusNode(canRequestFocus: false, skipTraversal: true);
  bool keyboardWasVisible = false;
  bool sending = false;
  bool attaching = false;
  bool chatMode = false;
  static const media = MethodChannel('agentdock/media');
  // The newest screenshot (taken in the last five minutes) offered as a chip.
  Map? recentShot;
  final dismissedShots = <int>{};
  bool fitWidth = false;
  _CommandTarget? stagedCommandTarget;
  Map<String, dynamic>? pinnedAccountSession;
  String pinnedAccountPC = '';
  int pinnedAccountGeneration = -1;
  String? draftKey;
  bool restoringDraft = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    terminalFocus.addListener(terminalFocusChanged);
    composer.addListener(draftChanged);
    composerScroll.addListener(() {
      if (!restoringDraft && draftKey != null && composerScroll.hasClients) {
        c.drafts.remember(draftKey!, 'composer', composerScroll.offset);
      }
    });
    c.addListener(syncDraft);
    c.addListener(syncProjectAccess);
    syncDraft();
    media.setMethodCallHandler((call) async {
      if (call.method == 'screenshot' &&
          mounted &&
          page == 0 &&
          c.selected.isNotEmpty) {
        // The capture is saved a moment after the callback.
        Future<void>.delayed(const Duration(seconds: 2), () async {
          if (!await checkRecentShot() && mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: const Text('Attach this screenshot?'),
                action: SnackBarAction(
                  label: 'Attach',
                  onPressed: () => checkRecentShot(ask: true),
                ),
              ),
            );
          }
        });
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    c.removeListener(syncDraft);
    c.removeListener(syncProjectAccess);
    unawaited(c.drafts.flush());
    composer.dispose();
    composerScroll.dispose();
    composerFocus.dispose();
    terminalFocus.removeListener(terminalFocusChanged);
    terminalFocus.dispose();
    super.dispose();
  }

  void terminalFocusChanged() {
    if (!terminalFocus.hasFocus) stopTerminalTyping();
  }

  void syncProjectAccess() {
    if (!mounted || page != 4 || canReadProjects(c)) return;
    setState(() => page = 0);
    run(() => c.setStreaming(true));
  }

  void enterChatMode() {
    final key = draftKey;
    final offset = key == null ? null : c.drafts.position(key, 'composer');
    if (!chatMode) setState(() => chatMode = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !chatMode || key != draftKey) return;
      // Reopening a draft is also a reading action. Let the next field tap
      // focus it, so Flutter does not jump from saved scrollback to the caret.
      if (composer.text.isEmpty) composerFocus.requestFocus();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted &&
            chatMode &&
            key == draftKey &&
            offset != null &&
            composerScroll.hasClients) {
          composerScroll.jumpTo(
            offset.toDouble().clamp(0, composerScroll.position.maxScrollExtent),
          );
        }
      });
    });
  }

  void leaveChatMode() {
    stopTerminalTyping();
    composerFocus.unfocus();
    if (chatMode) setState(() => chatMode = false);
  }

  void draftChanged() {
    if (restoringDraft) return;
    if (draftKey != null) {
      c.drafts.set(draftKey!, composer.text);
      c.drafts.remember(
        draftKey!,
        'selection',
        composer.selection.extentOffset,
      );
    }
    if (mounted) setState(() {});
  }

  void syncDraft() {
    final session = c.sessions.where((s) => s['id'] == c.selected).firstOrNull;
    final key = session == null
        ? null
        : ConsoleDrafts.key(
            c.activePC,
            (session['consoleKey'] ?? session['id']) as String,
          );
    if (key == draftKey) return;
    draftKey = key;
    restoringDraft = true;
    final value = key == null ? '' : c.drafts.get(key);
    final savedOffset = key == null
        ? 0.0
        : c.drafts.position(key, 'composer')?.toDouble();
    composer.value = TextEditingValue(
      text: value,
      selection: TextSelection.collapsed(
        offset:
            (key == null
                    ? value.length
                    : c.drafts.position(key, 'selection')?.toInt() ??
                          value.length)
                .clamp(0, value.length),
      ),
    );
    chatMode = false;
    composerFocus.unfocus();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && draftKey == key && composerScroll.hasClients) {
        composerScroll.jumpTo(
          (savedOffset ?? composerScroll.position.maxScrollExtent).clamp(
            0.0,
            composerScroll.position.maxScrollExtent,
          ),
        );
      }
      if (draftKey == key) restoringDraft = false;
    });
    stagedCommandTarget = null;
    stopTerminalTyping();
  }

  void stopTerminalTyping() {
    terminalFocus.canRequestFocus = false;
  }

  void startTerminalTyping() {
    if (!fitWidth) {
      setState(() => fitWidth = true);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) startTerminalTyping();
      });
      return;
    }
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
    if (state == AppLifecycleState.resumed) {
      c.setForeground(true);
      unawaited(checkRecentShot());
    }
    if ([
      AppLifecycleState.paused,
      AppLifecycleState.hidden,
      AppLifecycleState.detached,
    ].contains(state)) {
      stopTerminalTyping();
      unawaited(c.drafts.flush());
      c.setForeground(false);
    }
  }

  Future<void> run(Future<dynamic> Function() action) async {
    try {
      await action();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              e is PlatformException
                  ? e.message ?? 'This action is unavailable.'
                  : e.toString().replaceFirst('Bad state: ', ''),
            ),
          ),
        );
      }
    }
  }

  Future<void> send() async {
    if (sending || composer.text.trim().isEmpty) return;
    if (stagedCommandTarget case final target?) {
      if (!commandTargetIsCurrent(target)) {
        await run(() async {
          throw StateError('Console changed. Choose the command again.');
        });
        return;
      }
    }
    final text = composer.text;
    final sentKey = draftKey;
    setState(() => sending = true);
    await run(() async {
      await c.submit(text);
      if (sentKey != null && c.drafts.get(sentKey) == text) {
        c.drafts.set(sentKey, '');
      }
      if (mounted && draftKey == sentKey && composer.text == text) {
        composer.clear();
        stagedCommandTarget = null;
      }
    });
    if (mounted) setState(() => sending = false);
  }

  bool commandTargetIsCurrent(_CommandTarget target) =>
      mounted &&
      page == 0 &&
      c.connected &&
      c.foreground &&
      c.activePC == target.pc &&
      c.selected == target.session &&
      c.generation == target.generation &&
      c.sessions.any(
        (s) => s['id'] == target.session && s['provider'] == target.provider,
      );

  Future<void> liveControls(String action) async {
    stopTerminalTyping();
    composerFocus.unfocus();
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => LiveAgentControls(client: c, action: action),
    );
  }

  Future<void> newConsole() async {
    final pc = c.activePC, generation = c.generation;
    stopTerminalTyping();
    composerFocus.unfocus();
    final value = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => NewConsoleSheet(client: c),
    );
    if (value == null ||
        !mounted ||
        !c.connected ||
        c.activePC != pc ||
        c.generation != generation) {
      return;
    }
    await run(() async {
      final session = await c.request('console.create', value);
      if (mounted &&
          c.connected &&
          c.activePC == pc &&
          c.generation == generation) {
        setState(() => showConsoleOverview = false);
        await c.select(session['id'] as String);
        if (value['chooseModel'] == true && mounted) {
          await liveControls('Model');
        }
      }
    });
  }

  /// Offers the newest screenshot. With [ask], requests photo access first
  /// and attaches the screenshot directly, or opens the picker if denied.
  Future<bool> checkRecentShot({bool ask = false}) async {
    if (page != 0 || c.selected.isEmpty || !supports('console.attachments')) {
      return false;
    }
    try {
      if (ask && await media.invokeMethod<bool>('allowRecent') != true) {
        await pickImage();
        return true;
      }
      final found = await media.invokeMethod<Map>('recent', {'seconds': 300});
      if (!mounted || found == null) return false;
      if (found['permission'] != true) {
        if (ask) await pickImage();
        return ask;
      }
      final id = found['id'] as int?;
      final shot = id == null || dismissedShots.contains(id) ? null : found;
      setState(() => recentShot = shot);
      if (ask && shot != null) await attachRecentShot();
      return shot != null;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  Future<void> attachRecentShot() async {
    final id = recentShot?['id'] as int?;
    if (id == null) return;
    await attachImage(
      () => media.invokeMethod<Uint8List>('recentImage', {'id': id}),
    );
    if (mounted && !attaching) {
      setState(() {
        dismissedShots.add(id);
        recentShot = null;
      });
    }
  }

  Future<void> pickImage() =>
      attachImage(() => media.invokeMethod<Uint8List>('pick'));

  Future<void> attachImage(Future<Uint8List?> Function() source) async {
    if (attaching || sending) return;
    if (!supports('console.attachments')) {
      await run(() async {
        throw StateError('Update Paddock on the PC to attach images.');
      });
      return;
    }
    final key = draftKey, pc = c.activePC, id = c.selected;
    setState(() => attaching = true);
    await run(() async {
      final bytes = await source();
      // The Android picker backgrounds the activity. It can reconnect, but a
      // changed PC/console must never receive the selected image.
      if (bytes == null) return;
      if (!mounted || draftKey != key || c.activePC != pc || c.selected != id) {
        throw StateError('Console changed. Choose the image again.');
      }
      for (var i = 0; i < 40 && (!c.foreground || !c.connected); i++) {
        await Future<void>.delayed(const Duration(milliseconds: 250));
      }
      if (!mounted || draftKey != key || c.activePC != pc || c.selected != id) {
        throw StateError('Console changed. Choose the image again.');
      }
      final file = await c.attachImage(bytes);
      if (!mounted || draftKey != key) return;
      final suffix =
          '\nInspect the attached image file: ${file.replaceAll('\n', '')}\n';
      composer.value = TextEditingValue(
        text: composer.text + suffix,
        selection: TextSelection.collapsed(
          offset: composer.text.length + suffix.length,
        ),
      );
    });
    if (mounted) setState(() => attaching = false);
  }

  bool supports(String capability) =>
      (c.state['capabilities'] as List? ?? []).contains(capability);

  Future<void> pickFile(Map<String, dynamic> session) async {
    if (!supports('console.files')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Update Paddock on your PC to choose files here.'),
        ),
      );
      return;
    }
    final target = (
      pc: c.activePC,
      session: c.selected,
      provider: session['provider'] as String,
      generation: c.generation,
    );
    final draft = composer.value;
    stopTerminalTyping();
    composerFocus.unfocus();
    final path = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * .85,
      ),
      builder: (_) => ConsoleFilesSheet(client: c, sessionId: target.session),
    );
    if (path == null ||
        !commandTargetIsCurrent(target) ||
        composer.value != draft) {
      return;
    }
    // Insert a relative path as draft text. No command or file content is sent.
    final start = draft.selection.isValid
        ? draft.selection.start
        : draft.text.length;
    final end = draft.selection.isValid
        ? draft.selection.end
        : draft.text.length;
    final value = path.contains(RegExp(r'\s')) ? '"$path"' : path;
    final inserted =
        '${start > 0 && !RegExp(r'[\s@/]$').hasMatch(draft.text.substring(0, start)) ? ' ' : ''}$value ';
    composer.value = TextEditingValue(
      text: draft.text.replaceRange(start, end, inserted),
      selection: TextSelection.collapsed(offset: start + inserted.length),
    );
    stagedCommandTarget = target;
  }

  Future<void> closeConsole(Map<String, dynamic> session) async {
    if (!supports('console.close')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Update Paddock on your PC to close consoles here.'),
        ),
      );
      return;
    }
    final target = (
      pc: c.activePC,
      session: c.selected,
      provider: session['provider'] as String,
      generation: c.generation,
    );
    stopTerminalTyping();
    composerFocus.unfocus();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Close ${session['name']}?'),
        content: Text(
          session['remote'] != null
              ? 'This ends the remote tmux session, including its running task. SSH-key login is required.'
              : 'This ends the console on your PC, including any running task.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep open'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Close console'),
          ),
        ],
      ),
    );
    if (confirmed == true && commandTargetIsCurrent(target)) {
      await run(
        () =>
            c.request('console.close', {'id': target.session, 'confirm': true}),
      );
    }
  }

  Future<void> offerAlerts() async {
    if (!mounted || c.stayConnected) return;
    final enable = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Turn on alerts?'),
        content: const Text(
          'Get a notification when a console is ready or needs you. Your phone stays connected to this PC, which uses extra battery. Change this later in Settings → Stay connected.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Not now'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Turn on'),
          ),
        ],
      ),
    );
    if (enable == true) await run(() => c.setStayConnected(true));
  }

  Future<void> copyConsole() async {
    final terminal = c.screen?.terminal;
    if (terminal == null) return;
    final text = terminalReadingText(terminal);
    stopTerminalTyping();
    composerFocus.unfocus();
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * .85,
      ),
      builder: (_) => ConsoleCopySheet(text: text),
    );
  }

  Future<void> showConsoleLinks(Map<String, dynamic> session) async {
    final screen = c.screen;
    if (screen == null) return;
    final pc = c.activePC, id = c.selected;
    final links = terminalLinks(screen.terminal);
    stopTerminalTyping();
    composerFocus.unfocus();
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * .85,
      ),
      builder: (_) => AnimatedBuilder(
        animation: c,
        builder: (_, _) => TerminalLinksSheet(
          links: links,
          consoleName: session['name'] as String? ?? 'Console',
          enabled:
              c.activePC == pc &&
              c.selected == id &&
              c.screen?.terminal == screen.terminal,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: c,
    builder: (context, _) {
      if (c.pairing == null) return PairPage(client: c);
      if (c.offerAlerts && c.connected) {
        c.offerAlerts = false;
        WidgetsBinding.instance.addPostFrameCallback((_) => offerAlerts());
      }
      final current = c.sessions
          .where((s) => s['id'] == c.selected)
          .firstOrNull;
      final tablet = MediaQuery.sizeOf(context).shortestSide >= 600;
      final overviewShown = !tablet && (showConsoleOverview || current == null);
      final menuSession = pinnedAccountSession ?? current;
      final projectAccess = canReadProjects(c);
      final destinations = [0, if (projectAccess) 4, 1, 2, 3];
      return Scaffold(
        appBar: AppBar(
          leadingWidth: 34,
          titleSpacing: 8,
          toolbarHeight: max(
            56,
            MediaQuery.textScalerOf(context).scale(18) + 26,
          ),
          leading: Padding(
            padding: const EdgeInsets.all(6),
            child: overviewShown || current == null
                ? const DockMark()
                : AgentMark(current['provider'] as String, size: 24),
          ),
          title: page == 0
              ? Row(
                  children: [
                    Expanded(
                      child: ConsoleSwitcher(
                        client: c,
                        name: overviewShown || current == null
                            ? 'All consoles'
                            : current['name'] as String,
                        showAgentMark: false,
                        showProjectName: !overviewShown,
                        onOpened: () {
                          stopTerminalTyping();
                          composerFocus.unfocus();
                        },
                        onSelected: (id) {
                          if (id == ConsoleSwitcher.allConsoles) {
                            if (!tablet) setState(() => showConsoleOverview = true);
                          } else if (id == '+') {
                            newConsole();
                          } else if (c.sessions.any((s) => s['id'] == id)) {
                            setState(() => showConsoleOverview = false);
                            run(() => c.select(id));
                          }
                        },
                      ),
                    ),
                    if (!overviewShown)
                      StatusDot(
                        state: !c.connected
                            ? 'disconnected'
                            : current?['state'] as String? ?? 'active',
                      ),
                    const SizedBox(width: 5),
                    Icon(Icons.desktop_windows, size: 14, color: blue),
                    const SizedBox(width: 3),
                    ConstrainedBox(
                      constraints: BoxConstraints(
                        maxWidth: MediaQuery.sizeOf(context).width * .23,
                      ),
                      child: Text(
                        c.pcName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 11, color: blue),
                      ),
                    ),
                  ],
                )
              : Text(
                  page == 1
                      ? 'Results'
                      : page == 4
                      ? 'Projects'
                      : page == 2
                      ? 'Usage'
                      : 'Settings',
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                  style: TextStyle(
                    fontSize: 20,
                    color: pink,
                    fontWeight: FontWeight.w600,
                  ),
                ),
          actions: [
            PopupMenuButton<String>(
              tooltip: 'More options',
              icon: Icon(Icons.more_vert, color: pink),
              onOpened: () {
                pinnedAccountSession = overviewShown || current == null
                    ? null
                    : Map<String, dynamic>.from(current);
                pinnedAccountPC = c.activePC;
                pinnedAccountGeneration = c.generation;
                stopTerminalTyping();
                composerFocus.unfocus();
              },
              onCanceled: () {
                pinnedAccountSession = null;
                pinnedAccountPC = '';
                pinnedAccountGeneration = -1;
              },
              onSelected: (action) {
                if (action == 'code') {
                  final source = pinnedAccountSession;
                  if (source != null && c.activePC == pinnedAccountPC &&
                      c.generation == pinnedAccountGeneration && c.connected) {
                    Navigator.of(context).push(MaterialPageRoute<void>(
                      builder: (_) => CodePage(client: c, consoleId: source['id'] as String),
                    )).then((_) {
                      if (!mounted || draftKey == null) return;
                      final value = c.drafts.get(draftKey!);
                      if (composer.text != value) {
                        restoringDraft = true;
                        composer.value = TextEditingValue(text: value,
                          selection: TextSelection.collapsed(offset: value.length));
                        restoringDraft = false;
                        setState(() {});
                      }
                    });
                  }
                  pinnedAccountSession = null;
                  return;
                }
                if (action == 'rename' || action == 'project') {
                  final pinned = pinnedAccountSession;
                  final pc = pinnedAccountPC;
                  final generation = pinnedAccountGeneration;
                  pinnedAccountSession = null;
                  if (pinned != null) {
                    manageConsole(action, pinned, pc, generation);
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                          'This console changed. Open its menu again.',
                        ),
                      ),
                    );
                  }
                  return;
                }
                if (action.startsWith('account-switch:') ||
                    action.startsWith('account-setup:')) {
                  final pinned = pinnedAccountSession;
                  final pc = pinnedAccountPC,
                      generation = pinnedAccountGeneration;
                  pinnedAccountSession = null;
                  if (pinned == null) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                          'Console changed. Open its account menu again.',
                        ),
                      ),
                    );
                    return;
                  }
                  final target = action.substring(
                    action.startsWith('account-setup:')
                        ? 'account-setup:'.length
                        : 'account-switch:'.length,
                  );
                  if (action.startsWith('account-setup:')) {
                    setupAccountPinned(pinned, target, pc, generation);
                  } else {
                    switchAccountPinned(pinned, target, pc, generation);
                  }
                  return;
                }
                pinnedAccountSession = null;
                pinnedAccountPC = '';
                pinnedAccountGeneration = -1;
                if (action == 'updates') openUpdates(context);
                if (action == 'previews') Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => PreviewListPage(client: c)),
                );
                if (action == 'reconnect') run(c.reconnect);
                if (action == 'display') displaySettings();
                if (action == 'appearance') appearanceSettings();
                if (current != null) consoleAction(action, current);
              },
              itemBuilder: (_) => [
                if (page == 0 && !overviewShown && menuSession != null) ...[
                  if (supports('code.read') && menuSession['remote'] == null &&
                      !['code', 'web'].contains(menuSession['purpose']))
                    PopupMenuItem(value: 'code', enabled: c.connected,
                      child: const Text('Code')),
                  if (supports('console.manage')) ...[
                    PopupMenuItem(
                      value: 'rename',
                      enabled: c.connected && menuSession['alive'] == true,
                      child: const Text('Rename'),
                    ),
                    PopupMenuItem(
                      value: 'project',
                      enabled: c.connected && menuSession['alive'] == true,
                      child: const Text('Project'),
                    ),
                  ],
                  if (['codex', 'claude'].contains(menuSession['provider']) &&
                      menuSession['draftSupported'] == true &&
                      menuSession['switching'] != true) ...[
                    for (final target
                        in (menuSession['switchTargets'] as List? ?? [])
                            .whereType<Map>()
                            .where((target) => target['ready'] == true))
                      PopupMenuItem(
                        value: 'account-switch:${target['id']}',
                        child: Text('Switch to ${target['label']}'),
                      ),
                    for (final target
                        in (menuSession['switchTargets'] as List? ?? [])
                            .whereType<Map>()
                            .where((target) => target['ready'] == true))
                      PopupMenuItem(
                        value: 'account-setup:${target['id']}',
                        child: Text('Set up ${target['label']}'),
                      ),
                  ],
                  if (menuSession['accountLabel'] is String)
                    PopupMenuItem(
                      enabled: false,
                      child: Text('Account · ${menuSession['accountLabel']}'),
                    ),
                  const PopupMenuItem(
                    value: 'display',
                    child: Text('Text & display'),
                  ),
                  const PopupMenuItem(
                    value: 'appearance',
                    child: Text('Console style'),
                  ),
                  const PopupMenuItem(value: 'copy', child: Text('Copy text')),
                  const PopupMenuItem(
                    value: 'links',
                    child: Text('Console links'),
                  ),
                  PopupMenuItem(
                    value: 'keyboard',
                    enabled: c.connected,
                    child: const Text('Type directly in terminal'),
                  ),
                  const PopupMenuItem(
                    value: 'clear-view',
                    child: Text('Clear mobile history'),
                  ),
                  PopupMenuItem(
                    value: 'close',
                    enabled: c.connected,
                    child: const Text('Close console'),
                  ),
                  const PopupMenuDivider(),
                ],
                const PopupMenuItem(
                  value: 'previews',
                  child: Text('Previews'),
                ),
                const PopupMenuItem(
                  value: 'updates',
                  child: Text('App updates'),
                ),
                const PopupMenuItem(
                  value: 'reconnect',
                  child: Text('Reconnect'),
                ),
              ],
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
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          c.status,
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                      TextButton(
                        onPressed: () => openConnection(context, c),
                        child: const Text('Connection'),
                      ),
                    ],
                  ),
                ),
              Expanded(
                child: page == 0
                    ? consoleWorkspace(current)
                    : page == 1
                    ? ResultsPage(client: c)
                    : page == 4
                    ? ProjectsPage(
                        client: c,
                        onConsoleSelected: () {
                          setState(() {
                            page = 0;
                            showConsoleOverview = false;
                          });
                          run(() => c.setStreaming(true));
                        },
                      )
                    : SettingsPage(client: c, usageOnly: page == 2),
              ),
            ],
          ),
        ),
        bottomNavigationBar: MediaQuery.viewInsetsOf(context).bottom > 0
            ? null
            : NavigationBar(
                height: 64,
                labelBehavior: MediaQuery.textScalerOf(context).scale(14) > 22 ||
                        (projectAccess && MediaQuery.sizeOf(context).width < 380)
                    ? NavigationDestinationLabelBehavior.onlyShowSelected
                    : NavigationDestinationLabelBehavior.alwaysShow,
                selectedIndex: destinations.indexOf(page),
                onDestinationSelected: (value) {
                  stopTerminalTyping();
                  composerFocus.unfocus();
                  setState(() => page = destinations[value]);
                  run(() => c.setStreaming(page == 0));
                },
                destinations: [
                  NavigationDestination(
                    icon: Icon(Icons.terminal, color: blue),
                    label: 'Console',
                  ),
                  if (projectAccess)
                    NavigationDestination(
                      icon: Icon(Icons.folder_outlined, color: blue),
                      label: 'Projects',
                    ),
                  NavigationDestination(
                    icon: Badge(
                      isLabelVisible:
                          (c.state['unreadResults'] as num? ?? 0) > 0,
                      label: Text('${c.state['unreadResults'] ?? 0}'),
                      child: Icon(Icons.photo_library_outlined, color: pink),
                    ),
                    label: 'Results',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.bar_chart_rounded, color: blue),
                    label: 'Usage',
                  ),
                  NavigationDestination(
                    icon: Icon(Icons.settings_outlined, color: blue),
                    label: 'Settings',
                  ),
                ],
              ),
      );
    },
  );
  Widget consoleWorkspace(Map<String, dynamic>? current) {
    final tablet = MediaQuery.sizeOf(context).shortestSide >= 600;
    final overviewShown = !tablet && (showConsoleOverview || current == null);
    final overviewVisible = tablet || overviewShown;
    final paneWidth = min(360.0, MediaQuery.sizeOf(context).width * .4);
    final overview = ConsoleOverview(
      client: c,
      active: overviewVisible,
      onNewConsole: newConsole,
      onSelected: (id) {
        stopTerminalTyping();
        composerFocus.unfocus();
        setState(() => showConsoleOverview = false);
        run(() => c.select(id));
      },
    );
    // Both children retain the same element path across the tablet breakpoint.
    // Offstage keeps the terminal's full phone width while browsing consoles.
    return Stack(
      key: const ValueKey('console-workspace'),
      children: [
        Positioned.fill(
          left: tablet ? paneWidth + 1 : 0,
          child: Offstage(
            offstage: overviewShown,
            child: terminal(current),
          ),
        ),
        Positioned(
          left: 0, top: 0, bottom: 0,
          right: tablet ? null : 0,
          width: tablet ? paneWidth : null,
          child: Offstage(
            offstage: !overviewVisible,
            child: overview,
          ),
        ),
        Positioned(
          left: paneWidth, top: 0, bottom: 0, width: 1,
          child: Offstage(
            offstage: !tablet,
            child: const VerticalDivider(width: 1),
          ),
        ),
      ],
    );
  }

  Widget terminal(Map<String, dynamic>? session) {
    final view = c.screen;
    if (session == null) {
      if (c.appearance.themeId == 'void') {
        return Center(
          child: SizedBox(
            width: min(MediaQuery.sizeOf(context).width - 32, 520),
            height: 220,
            child: ConsoleSurface(
              appearance: c.appearance,
              openingKey: 'empty:${c.activePC}',
              connected: c.connected,
              connectionGeneration: c.generation,
              emptyPanel: true,
              child: Center(
                child: FilledButton.icon(
                  onPressed: c.connected ? newConsole : null,
                  icon: const Icon(Icons.add),
                  label: const Text('New console'),
                ),
              ),
            ),
          ),
        );
      }
      return Center(
        child: FilledButton.icon(
          onPressed: c.connected ? newConsole : null,
          icon: const Icon(Icons.add),
          label: const Text('New console'),
        ),
      );
    }
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        // A landscape keyboard can leave less room than the controls need.
        // Keep them reachable by scrolling instead of clipping the composer.
        child: SizedBox(
          height: !chatMode
              ? constraints.maxHeight
              : max(
                  constraints.maxHeight,
                  MediaQuery.viewInsetsOf(context).bottom > 0
                      ? 200 + MediaQuery.textScalerOf(context).scale(64)
                      : 160 + MediaQuery.textScalerOf(context).scale(32),
                ),
          child: terminalContents(session, view),
        ),
      ),
    );
  }

  void consoleAction(String action, Map<String, dynamic> session) {
    if (action == 'copy') copyConsole();
    if (action == 'links') showConsoleLinks(session);
    if (action == 'keyboard') startTerminalTyping();
    if (action == 'clear-view') {
      c.clearSelectedView();
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Mobile history cleared')));
    }
    if (action == 'files') pickFile(session);
    if (action == 'image') pickImage();
    if (action == 'close') closeConsole(session);
  }

  Future<void> manageConsole(
    String action,
    Map<String, dynamic> session,
    String pc,
    int generation,
  ) async {
    if (!supports('console.manage')) return;
    bool currentLaunch() =>
        mounted &&
        c.connected &&
        c.activePC == pc &&
        c.generation == generation &&
        c.selected == session['id'] &&
        c.sessions.any(
          (item) =>
              item['id'] == session['id'] &&
              item['alive'] == true &&
              item['dismissed'] != true &&
              item['consoleKey'] == session['consoleKey'] &&
              item['launchId'] == session['launchId'],
        );
    Future<void> submit(Map<String, dynamic> value) => run(() async {
      if (!currentLaunch()) {
        throw StateError('This console changed. Open its menu again.');
      }
      await c.request('console.$action', {
        'id': session['id'],
        'consoleKey': session['consoleKey'],
        'launchId': session['launchId'],
        ...value,
      });
    });
    if (action == 'rename') {
      var editedName = session['name'] as String;
      final name = await showDialog<String>(
        context: context,
        builder: (ctx) => StatefulBuilder(
          builder: (ctx, update) => AlertDialog(
            title: const Text('Rename console'),
            content: TextFormField(
              initialValue: editedName,
              autofocus: true,
              maxLength: 64,
              decoration: const InputDecoration(labelText: 'Name'),
              onChanged: (value) => update(() => editedName = value),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: editedName.trim().isEmpty
                    ? null
                    : () => Navigator.pop(ctx, editedName.trim()),
                child: const Text('Save'),
              ),
            ],
          ),
        ),
      );
      if (name != null && mounted) await submit({'name': name});
    } else {
      final projects = (c.state['projects'] as List? ?? []).whereType<Map>();
      final missingProject = session['projectId'] != null &&
          !projects.any((project) => project['id'] == session['projectId']);
      final choice = await showModalBottomSheet<Map<String, dynamic>>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * .75,
        ),
        builder: (ctx) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              if (missingProject)
                const ListTile(
                  title: Text('Archived project'),
                  enabled: false,
                  selected: true,
                  trailing: Icon(Icons.check),
                ),
              for (final project in <Map>[
                {'id': null, 'name': 'No project'},
                ...projects,
              ])
                ListTile(
                  title: Text(project['name'] as String),
                  selected: project['id'] == session['projectId'],
                  trailing: project['id'] == session['projectId']
                      ? const Icon(Icons.check)
                      : null,
                  onTap: () => Navigator.pop(ctx, {'projectId': project['id']}),
                ),
            ],
          ),
        ),
      );
      if (choice != null && mounted) await submit(choice);
    }
  }

  Future<void> switchAccountPinned(
    Map<String, dynamic> session,
    String targetAccountId,
    String pc,
    int generation,
  ) async {
    if (!mounted) return;
    final id = '${session['id'] ?? ''}';
    bool currentLaunch() =>
        mounted &&
        c.connected &&
        c.foreground &&
        c.activePC == pc &&
        c.generation == generation &&
        c.selected == id &&
        c.sessions.any(
          (item) =>
              item['id'] == id &&
              item['launchId'] == session['launchId'] &&
              item['consoleKey'] == session['consoleKey'] &&
              item['accountId'] == session['accountId'],
        );
    if (!currentLaunch()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Console changed. Open its account menu again.'),
        ),
      );
      return;
    }
    try {
      await c.request('console.switch', {
        'id': id,
        'launchId': session['launchId'],
        'consoleKey': session['consoleKey'],
        'accountId': session['accountId'],
        'targetAccountId': targetAccountId,
      });
      if (!mounted) return;
      final stillSelected =
          mounted &&
          c.connected &&
          c.activePC == pc &&
          c.generation == generation &&
          c.selected == id &&
          c.sessions.any(
            (item) =>
                item['id'] == id &&
                item['consoleKey'] == session['consoleKey'] &&
                item['accountId'] == targetAccountId,
          );
      if (stillSelected) {
        final targets = (session['switchTargets'] as List? ?? [])
            .whereType<Map>();
        final label =
            targets
                .where((item) => item['id'] == targetAccountId)
                .firstOrNull?['label'] ??
            'account';
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Switched to $label.')));
      }
    } catch (error) {
      if (!mounted) return;
      if (currentLaunch()) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$error')));
      }
    }
  }

  Future<void> setupAccountPinned(
    Map<String, dynamic> session,
    String targetAccountId,
    String pc,
    int generation,
  ) async {
    if (!mounted) return;
    final id = '${session['id'] ?? ''}';
    bool currentLaunch() =>
        mounted &&
        c.connected &&
        c.foreground &&
        c.activePC == pc &&
        c.generation == generation &&
        c.selected == id &&
        c.sessions.any(
          (item) =>
              item['id'] == id &&
              item['launchId'] == session['launchId'] &&
              item['consoleKey'] == session['consoleKey'] &&
              item['accountId'] == session['accountId'],
        );
    if (!currentLaunch()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Console changed. Open its account menu again.'),
        ),
      );
      return;
    }
    try {
      final setup = await c.request('console.setup', {
        'id': id,
        'launchId': session['launchId'],
        'consoleKey': session['consoleKey'],
        'accountId': session['accountId'],
        'targetAccountId': targetAccountId,
      });
      if (!mounted) return;
      if (currentLaunch()) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Setup console opened on the PC in ${setup['cwd']}.'),
          ),
        );
      }
    } catch (error) {
      if (!mounted) return;
      if (currentLaunch()) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$error')));
      }
    }
  }

  Future<void> messageQueue() async {
    stopTerminalTyping();
    composerFocus.unfocus();
    final key = draftKey;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => MessageQueueSheet(
        client: c,
        draft: composer.text,
        draftSelection: composer.selection,
        onQueued: () {
          if (mounted && draftKey == key) composer.clear();
        },
        onUsePrompt: (text, cursorOffset) {
          if (!mounted || draftKey != key) return;
          composer.value = TextEditingValue(
            text: text,
            selection: TextSelection.collapsed(offset: cursorOffset),
          );
          stagedCommandTarget = null;
        },
      ),
    );
  }

  Future<void> terminalKeys() async {
    stopTerminalTyping();
    composerFocus.unfocus();
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => TerminalKeys(client: c),
    );
  }

  int queuedCount(Object? id) =>
      ((((c.state['queues'] as Map?)?[id] as Map?)?['entries']) as List? ?? [])
          .length;

  Future<void> displaySettings() async {
    stopTerminalTyping();
    composerFocus.unfocus();
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Text & display',
                    style: TextStyle(fontSize: 22, color: pink),
                  ),
                ),
                const SizedBox(height: 16),
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(
                      value: false,
                      icon: Icon(Icons.wrap_text),
                      label: Text('Wrap text'),
                    ),
                    ButtonSegment(
                      value: true,
                      icon: Icon(Icons.grid_view),
                      label: Text('Grid'),
                    ),
                  ],
                  selected: {fitWidth},
                  onSelectionChanged: (value) {
                    setState(() => fitWidth = value.single);
                    update(() {});
                  },
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    const Expanded(child: Text('Text size')),
                    Text(
                      '${(c.textScale * 100).round()}%',
                      style: TextStyle(color: blue),
                    ),
                  ],
                ),
                Slider(
                  value: c.textScale,
                  min: .85,
                  max: 1.15,
                  divisions: 6,
                  label: '${(c.textScale * 100).round()}%',
                  onChanged: (value) {
                    run(() => c.setTextScale(value, save: false));
                    update(() {});
                  },
                  onChangeEnd: (value) => run(() => c.setTextScale(value)),
                ),
                if (fitWidth)
                  const Text(
                    'Grid fits the PC’s columns. Use Wrap text for larger terminal text.',
                    style: TextStyle(color: muted),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> appearanceSettings() async {
    stopTerminalTyping();
    composerFocus.unfocus();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (context) => SizedBox(
        height: MediaQuery.sizeOf(context).height * .85,
        child: SafeArea(
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: IconButton(
                  tooltip: 'Close appearance',
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                  child: ConsoleAppearanceControls(client: c),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget terminalContents(Map<String, dynamic> session, ConsoleScreen? view) {
    final provider = (session['provider'] as String).toLowerCase();
    final selection = c.agentSelection(session['id'] as String);
    return Column(
      children: [
        if (session['switchOffer'] is Map && session['switching'] != true)
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 2),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: blue.withValues(alpha: .10),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: blue.withValues(alpha: .35)),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                child: Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    Text(
                      'Usage reached ${(session['switchOffer'] as Map)['usedPercent'] ?? '?'}%.',
                      style: const TextStyle(color: muted),
                    ),
                    TextButton(
                      onPressed: c.connected
                          ? () {
                              final offer = session['switchOffer'] as Map;
                              switchAccountPinned(
                                Map<String, dynamic>.from(session),
                                '${offer['targetAccountId'] ?? ''}',
                                c.activePC,
                                c.generation,
                              );
                            }
                          : null,
                      child: Text(
                        'Switch to ${(session['switchOffer'] as Map)['targetLabel'] ?? 'account'}',
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: ConsoleSurface(
              appearance: c.appearance,
              openingKey: '${c.activePC}:${session['id']}',
              connected: c.connected,
              connectionGeneration: c.generation,
              playOpening: c.claimConsoleOpening(session['id'] as String),
              sessionState: session['state'] as String?,
              stateEffectSequence: c.consoleStateEffectSequence(
                session['id'] as String,
              ),
              stateEffectKind: c.consoleStateEffectKind(
                session['id'] as String,
              ),
              activity: c.consoleOutputSequence(session['id'] as String),
              outputBurst: c.consoleOutputBurstSequence(
                session['id'] as String,
              ),
              child: view == null
                  ? const Center(child: CircularProgressIndicator())
                  : Listener(
                      onPointerDown: (_) {
                        // Touching output must never activate the keyboard.
                        stopTerminalTyping();
                        composerFocus.unfocus();
                        if (['ready', 'attention'].contains(session['state'])) {
                          run(c.acknowledge);
                        }
                      },
                      child: TerminalViewport(
                        key: ValueKey(draftKey),
                        positions: c.drafts,
                        positionKey: draftKey ?? '',
                        terminal: view.terminal,
                        columns: view.cols,
                        fitWidth: fitWidth,
                        readOnly: !c.connected,
                        focusNode: terminalFocus,
                        theme: c.appearance.theme.terminal,
                      ),
                    ),
            ),
          ),
        ),
        if (!chatMode)
          Align(
            alignment: Alignment.centerRight,
            child: Tooltip(
              message: 'Terminal keys',
              child: TextButton.icon(
                onPressed: c.connected && !sending ? terminalKeys : null,
                icon: const Icon(Icons.keyboard_alt_outlined, size: 20),
                label: const Text('Terminal keys'),
              ),
            ),
          ),
        if (chatMode) ...[
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Row(
              children: [
                Expanded(
                  child: Wrap(
                    children: [
                      TextButton.icon(
                        onPressed: c.connected && !sending
                            ? () => liveControls('Model')
                            : null,
                        icon: const Icon(Icons.tune, size: 18),
                        label: Text(
                          selection.model == null
                              ? 'Model unknown'
                              : modelLabel(selection.model!),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (['claude', 'codex'].contains(provider))
                        TextButton.icon(
                          onPressed: c.connected && !sending
                              ? () => liveControls('Effort')
                              : null,
                          icon: const Icon(Icons.speed, size: 18),
                          label: Text(
                            selection.effort == null
                                ? 'Effort unknown'
                                : effortLabel(selection.effort!),
                          ),
                        ),
                    ],
                  ),
                ),
                if ((c.state['capabilities'] as List? ?? []).contains(
                      'console.queue',
                    ) &&
                    (session['purpose'] ?? 'agent') == 'agent' &&
                    !['shell', 'custom'].contains(session['provider']))
                  IconButton(
                    tooltip: 'Queue',
                    onPressed: c.connected && !sending ? messageQueue : null,
                    icon: Badge(
                      isLabelVisible: queuedCount(session['id']) > 0,
                      label: Text('${queuedCount(session['id'])}'),
                      child: Icon(Icons.playlist_play, color: blue),
                    ),
                  ),
                IconButton(
                  tooltip: 'Terminal keys',
                  onPressed: c.connected && !sending ? terminalKeys : null,
                  icon: Icon(Icons.keyboard_alt_outlined, color: blue),
                ),
                IconButton(
                  tooltip: 'Collapse chat',
                  onPressed: leaveChatMode,
                  icon: Icon(Icons.keyboard_arrow_down, color: pink),
                ),
              ],
            ),
          ),
          if (recentShot case final shot?)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
              child: Align(
                alignment: Alignment.centerLeft,
                child: InputChip(
                  key: const ValueKey('recent-screenshot'),
                  avatar: shot['thumbnail'] is Uint8List
                      ? ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: Image.memory(
                            shot['thumbnail'] as Uint8List,
                            fit: BoxFit.cover,
                            gaplessPlayback: true,
                          ),
                        )
                      : const Icon(Icons.screenshot_outlined),
                  label: Text(
                    'Attach screenshot · ${TimeOfDay.fromDateTime(DateTime.fromMillisecondsSinceEpoch(shot['at'] as int)).format(context)}',
                    overflow: TextOverflow.ellipsis,
                  ),
                  onPressed: c.connected && !sending && !attaching
                      ? attachRecentShot
                      : null,
                  deleteButtonTooltipMessage: 'Dismiss',
                  onDeleted: () => setState(() {
                    dismissedShots.add(shot['id'] as int);
                    recentShot = null;
                  }),
                ),
              ),
            ),
          if (c.inputError.isNotEmpty || c.drafts.error.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                c.inputError.isNotEmpty ? c.inputError : c.drafts.error,
                style: TextStyle(color: pink, fontSize: 12),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      maxHeight: min(
                        MediaQuery.textScalerOf(context).scale(16) * 1.4 * 8.5 +
                            24,
                        max(72, MediaQuery.sizeOf(context).height * .35),
                      ),
                    ),
                    child: TextField(
                      controller: composer,
                      scrollController: composerScroll,
                      focusNode: composerFocus,
                      onChanged: (_) => stagedCommandTarget = null,
                      minLines: 1,
                      maxLines: null,
                      style: const TextStyle(fontSize: 16, height: 1.4),
                      textInputAction: TextInputAction.newline,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: InputDecoration(
                        hintText: 'Message',
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
                        ),
                        isDense: true,
                        suffixIcon: PopupMenuButton<String>(
                          tooltip: 'Attach',
                          icon: Icon(Icons.add, color: blue),
                          enabled: c.connected && !sending && !attaching,
                          onSelected: (action) =>
                              consoleAction(action, session),
                          itemBuilder: (_) => [
                            const PopupMenuItem(
                              value: 'files',
                              child: Text('Files'),
                            ),
                            if (session['remote'] == null)
                              const PopupMenuItem(
                                value: 'image',
                                child: Text('Image'),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                DockSendButton(
                  onPressed:
                      c.connected && !sending && composer.text.trim().isNotEmpty
                      ? send
                      : null,
                  sending: sending,
                ),
              ],
            ),
          ),
        ] else
          Semantics(
            button: true,
            label: composer.text.isEmpty
                ? 'Enter chat mode'
                : 'Enter chat mode, draft saved',
            child: InkWell(
              key: const ValueKey('enter-chat'),
              onTap: enterChatMode,
              child: SizedBox(
                height: 40,
                width: double.infinity,
                child: Center(
                  child: Container(
                    width: 96,
                    height: 4,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(colors: [blue, pink]),
                      borderRadius: BorderRadius.circular(4),
                      boxShadow: composer.text.isEmpty
                          ? null
                          : [
                              BoxShadow(
                                color: pink.withValues(alpha: .35),
                                blurRadius: 8,
                              ),
                            ],
                    ),
                  ),
                ),
              ),
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
        LinearGradient(colors: [blue, pink]).createShader(rect),
    child: const Icon(Icons.auto_awesome, color: Colors.white),
  );
}

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

String formatBytes(int bytes) => bytes < 1024
    ? '$bytes B'
    : bytes < 1024 * 1024
    ? '${(bytes / 1024).toStringAsFixed(1)} KB'
    : '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
final terminalTheme = ConsoleTheme.named('classic').terminal;
