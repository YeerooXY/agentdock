import 'dart:math';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:xterm/xterm.dart';

import 'dock_client.dart';
import 'dock_style.dart';
import 'pair_page.dart';
import 'results_page.dart';
import 'settings_page.dart';
import 'update_panel.dart';
import 'connection_panel.dart';
import 'devices_page.dart';
import 'agent_commands.dart';
import 'terminal_viewport.dart';
import 'terminal_links.dart';
import 'terminal_reading.dart';
import 'agent_identity.dart';
import 'console_actions.dart';
import 'console_switcher.dart';
import 'console_drafts.dart';
import 'live_agent_controls.dart';

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
    home: AnimatedBuilder(
      animation: client,
      builder: (context, _) {
        final systemScale = MediaQuery.textScalerOf(context).scale(1);
        // Keep Android accessibility scaling, while allowing a small app-level
        // adjustment so dense terminal controls remain usable on small screens.
        final effective = (systemScale * client.textScale).clamp(.85, 1.55);
        return MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(effective)),
          child: DockHome(key: ValueKey(client.activePC), client: client),
        );
      },
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
  final composer = TextEditingController(), composerFocus = FocusNode();
  final composerScroll = ScrollController();
  // xterm requests focus on touch-down, before it can recognize a scroll.
  // Only the keyboard button may enable terminal focus.
  final terminalFocus = FocusNode(canRequestFocus: false, skipTraversal: true);
  bool keyboardWasVisible = false;
  bool sending = false;
  bool attaching = false;
  static const media = MethodChannel('agentdock/media');
  bool fitWidth = false;
  _CommandTarget? stagedCommandTarget;
  bool stagedSlashCommand = false;
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
    syncDraft();
    media.setMethodCallHandler((call) async {
      if (call.method == 'screenshot' &&
          mounted &&
          page == 0 &&
          c.selected.isNotEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Attach this screenshot?'),
            action: SnackBarAction(label: 'Choose image', onPressed: pickImage),
          ),
        );
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    c.removeListener(syncDraft);
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
    if (state == AppLifecycleState.resumed) c.setForeground(true);
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
      await c.submit(
        text,
        command: stagedCommandTarget != null && stagedSlashCommand,
      );
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

  Future<void> agentCommands(Map<String, dynamic> session) async {
    final catalog = AgentCommands.forProvider(session['provider'] as String);
    if (catalog == null || sending) return;
    final target = (
      pc: c.activePC,
      session: c.selected,
      provider: session['provider'] as String,
      generation: c.generation,
    );
    stopTerminalTyping();
    composerFocus.unfocus();
    final command = await showModalBottomSheet<AgentCommand>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => AnimatedBuilder(
        animation: c,
        builder: (_, _) => AgentCommandSheet(
          catalog: catalog,
          consoleName: session['name'] as String? ?? catalog.name,
          enabled: commandTargetIsCurrent(target),
        ),
      ),
    );
    if (!mounted || command == null || !commandTargetIsCurrent(target)) return;
    if (['Model', 'Effort', 'Commands'].contains(command.label)) {
      await liveControls(command.label);
      return;
    }
    if (composer.text.isNotEmpty && composer.text != command.text) {
      final replace = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Replace draft?'),
          content: Text('Replace your unsent message with ${command.text}?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Keep draft'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Replace'),
            ),
          ],
        ),
      );
      if (replace != true || !commandTargetIsCurrent(target)) return;
    }
    composer.value = TextEditingValue(
      text: command.text,
      selection: TextSelection.collapsed(offset: command.text.length),
    );
    stagedCommandTarget = target;
    stagedSlashCommand = true;
  }

  Future<void> liveControls(String action, {String? completion}) async {
    final key = draftKey;
    stopTerminalTyping();
    composerFocus.unfocus();
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => LiveAgentControls(
        client: c,
        theme: terminalTheme,
        action: action,
        completion: completion,
        onTyped: completion == null
            ? null
            : () {
                if (mounted && draftKey == key && composer.text == completion) {
                  composer.clear();
                }
              },
      ),
    );
  }

  Future<void> quickAgentControls(Map<String, dynamic> session) async {
    if (sending || !c.connected) return;
    stopTerminalTyping();
    composerFocus.unfocus();
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const ListTile(
                leading: Icon(Icons.auto_awesome, color: pink),
                title: Text('Quick agent controls'),
                subtitle: Text('Choose a control, then use the agent menu.'),
              ),
              ListTile(
                leading: Icon(
                  Icons.model_training_outlined,
                  color: AgentIdentity.of(session['provider'] as String).color,
                ),
                title: const Text('Model'),
                subtitle: const Text('Open the current agent model chooser'),
                onTap: () => Navigator.pop(context, 'Model'),
              ),
              if (['claude', 'codex'].contains(session['provider']))
                ListTile(
                  leading: const Icon(Icons.speed, color: blue),
                  title: const Text('Effort / speed'),
                  subtitle: const Text('Open the current agent effort chooser'),
                  onTap: () => Navigator.pop(context, 'Effort'),
                ),
            ],
          ),
        ),
      ),
    );
    if (mounted && action != null) await liveControls(action);
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
        await c.select(session['id'] as String);
        if (value['chooseModel'] == true && mounted) {
          await liveControls('Model');
        }
      }
    });
  }

  Future<void> pickImage() async {
    if (attaching || sending) return;
    if (!supports('console.attachments')) {
      await run(() async {
        throw StateError('Update Dock on the PC to attach images.');
      });
      return;
    }
    final key = draftKey, pc = c.activePC, id = c.selected;
    setState(() => attaching = true);
    await run(() async {
      final bytes = await media.invokeMethod<Uint8List>('pick');
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
      stagedSlashCommand = false;
    });
    if (mounted) setState(() => attaching = false);
  }

  bool supports(String capability) =>
      (c.state['capabilities'] as List? ?? []).contains(capability);

  Future<void> pickFile(Map<String, dynamic> session) async {
    if (!supports('console.files')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Update Dock on your PC to choose files here.'),
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
    stagedSlashCommand = false;
  }

  Future<void> closeConsole(Map<String, dynamic> session) async {
    if (!supports('console.close')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Update Dock on your PC to close consoles here.'),
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
      final current = c.sessions
          .where((s) => s['id'] == c.selected)
          .firstOrNull;
      return Scaffold(
        appBar: AppBar(
          leadingWidth: 40,
          titleSpacing: 8,
          toolbarHeight: max(
            kToolbarHeight,
            MediaQuery.textScalerOf(context).scale(20) * 1.2 +
                MediaQuery.textScalerOf(context).scale(12) * 1.2 +
                32,
          ),
          leading: const Padding(padding: EdgeInsets.all(8), child: DockMark()),
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (page == 0)
                ConsoleSwitcher(
                  client: c,
                  name: current?['name'] as String? ?? 'Consoles',
                  onOpened: () {
                    stopTerminalTyping();
                    composerFocus.unfocus();
                  },
                  onSelected: (id) {
                    if (id == '+') {
                      newConsole();
                    } else if (c.sessions.any((s) => s['id'] == id)) {
                      run(() => c.select(id));
                    }
                  },
                )
              else
                Text(
                  page == 1 ? 'Results' : 'Usage',
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                  style: const TextStyle(
                    fontSize: 20,
                    color: pink,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              Text(
                c.pcName,
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
                style: const TextStyle(fontSize: 12, color: blue),
              ),
            ],
          ),
          actions: [
            IconButton(
              onPressed: () {
                stopTerminalTyping();
                composerFocus.unfocus();
                openDevices(context, c);
              },
              icon: const Icon(Icons.devices, color: blue),
              tooltip: 'Devices',
            ),
            PopupMenuButton<String>(
              tooltip: 'More options',
              icon: const Icon(Icons.more_vert, color: pink),
              onOpened: () {
                stopTerminalTyping();
                composerFocus.unfocus();
              },
              onSelected: (action) {
                if (action == 'updates') openUpdates(context);
                if (action == 'reconnect') run(c.reconnect);
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'updates', child: Text('App updates')),
                PopupMenuItem(value: 'reconnect', child: Text('Reconnect')),
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
                    ? terminal(current)
                    : page == 1
                    ? ResultsPage(client: c)
                    : SettingsPage(client: c),
              ),
            ],
          ),
        ),
        bottomNavigationBar: MediaQuery.viewInsetsOf(context).bottom > 0
            ? null
            : NavigationBar(
                labelBehavior: MediaQuery.textScalerOf(context).scale(14) > 22
                    ? NavigationDestinationLabelBehavior.onlyShowSelected
                    : NavigationDestinationLabelBehavior.alwaysShow,
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
                      isLabelVisible:
                          (c.state['unreadResults'] as num? ?? 0) > 0,
                      label: Text('${c.state['unreadResults'] ?? 0}'),
                      child: const Icon(
                        Icons.photo_library_outlined,
                        color: pink,
                      ),
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
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        // A landscape keyboard can leave less room than the controls need.
        // Keep them reachable by scrolling instead of clipping the composer.
        child: SizedBox(
          height: max(
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

  Widget terminalContents(Map<String, dynamic> session, ConsoleScreen? view) {
    final compactControls =
        MediaQuery.sizeOf(context).width < 420 &&
        MediaQuery.textScalerOf(context).scale(14) > 20;
    void toggleDisplay() {
      stopTerminalTyping();
      composerFocus.unfocus();
      setState(() => fitWidth = !fitWidth);
    }

    final provider = session['provider'] as String;
    final catalog = AgentCommands.forProvider(provider);
    final prefix = composer.text.trimLeft().toLowerCase();
    final suggestions =
        prefix.startsWith('/') && !prefix.contains(RegExp(r'\s'))
        ? catalog?.commands
                  .where(
                    (x) =>
                        x.label != 'Effort' &&
                        x.text.toLowerCase().startsWith(prefix),
                  )
                  .toList() ??
              <AgentCommand>[]
        : <AgentCommand>[];
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 8, 0),
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
                  session['remote'] is Map
                      ? '${session['remote']['name']} \u00b7 SSH'
                      : '${session['state']}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: muted, fontSize: 12),
                ),
              ),
              if (compactControls)
                IconButton(
                  tooltip: fitWidth
                      ? 'Wrap text at reading size'
                      : 'Show the original terminal grid',
                  onPressed: toggleDisplay,
                  icon: Icon(
                    fitWidth ? Icons.fit_screen : Icons.wrap_text,
                    color: blue,
                  ),
                )
              else
                Tooltip(
                  message: fitWidth
                      ? 'Wrap text at reading size'
                      : 'Show the original terminal grid',
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 160),
                    child: TextButton.icon(
                      onPressed: toggleDisplay,
                      icon: Icon(
                        fitWidth ? Icons.fit_screen : Icons.text_fields,
                      ),
                      label: Text(
                        fitWidth ? 'Grid' : 'Wrap text',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ),
              IconButton(
                tooltip: 'Quick model and effort controls',
                onPressed: c.connected && !sending
                    ? () => quickAgentControls(session)
                    : null,
                icon: const Icon(Icons.auto_awesome, color: pink),
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
                  : Listener(
                      onPointerDown: (_) {
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
                        theme: terminalTheme,
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
                      ('↑', '\x1b[A'),
                      ('↓', '\x1b[B'),
                      ('←', '\x1b[D'),
                      ('→', '\x1b[C'),
                      ('Tab', '\t'),
                      ('Ctrl C', '\x03'),
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
              tooltip: 'Console links',
              onPressed: view == null ? null : () => showConsoleLinks(session),
              icon: const Icon(Icons.link, color: blue),
            ),
            IconButton(
              tooltip: 'Type directly in terminal',
              onPressed: c.connected ? startTerminalTyping : null,
              icon: const Icon(Icons.keyboard_alt_outlined, color: pink),
            ),
            PopupMenuButton<String>(
              tooltip: 'Console actions',
              icon: const Icon(Icons.more_vert, color: blue),
              onOpened: () {
                stopTerminalTyping();
                composerFocus.unfocus();
              },
              onSelected: (action) {
                if (action == 'copy') copyConsole();
                if (action == 'clear-view') {
                  c.clearSelectedView();
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Mobile view cleared')),
                  );
                }
                if (action == 'files') pickFile(session);
                if (action == 'image') pickImage();
                if (action == 'close') closeConsole(session);
                if (action == 'model') liveControls('Model');
                if (action == 'effort') liveControls('Effort');
                if (action == 'complete') {
                  liveControls(
                    'Commands',
                    completion: composer.text.isEmpty ? null : composer.text,
                  );
                }
              },
              itemBuilder: (_) => [
                PopupMenuItem(
                  value: 'image',
                  enabled:
                      c.connected &&
                      !sending &&
                      !attaching &&
                      session['remote'] == null,
                  child: Text(
                    attaching ? 'Attaching image\u2026' : 'Attach image',
                  ),
                ),
                if (catalog != null) ...[
                  PopupMenuItem(
                    value: 'model',
                    enabled: c.connected && !sending,
                    child: const Text('Choose model'),
                  ),
                  if (['claude', 'codex'].contains(provider))
                    PopupMenuItem(
                      value: 'effort',
                      enabled: c.connected && !sending,
                      child: const Text('Choose effort'),
                    ),
                  PopupMenuItem(
                    value: 'complete',
                    enabled: c.connected && !sending,
                    child: const Text('Live completion'),
                  ),
                ],
                PopupMenuItem(
                  value: 'copy',
                  enabled: view != null,
                  child: const Text('Copy text'),
                ),
                PopupMenuItem(
                  value: 'clear-view',
                  enabled: view != null,
                  child: const Text('Clear mobile view'),
                ),
                PopupMenuItem(
                  value: 'files',
                  enabled: c.connected && !sending,
                  child: const Text('Files'),
                ),
                PopupMenuItem(
                  value: 'close',
                  enabled: c.connected && !sending,
                  child: const Text('Close console'),
                ),
              ],
            ),
          ],
        ),
        if (suggestions.isNotEmpty)
          SizedBox(
            height: max(48, MediaQuery.textScalerOf(context).scale(20) + 24),
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              children: [
                for (final command in suggestions)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ActionChip(
                      label: Text(command.text),
                      onPressed: c.connected && !sending
                          ? () {
                              composer.value = TextEditingValue(
                                text: command.text,
                                selection: TextSelection.collapsed(
                                  offset: command.text.length,
                                ),
                              );
                              stagedCommandTarget = (
                                pc: c.activePC,
                                session: c.selected,
                                provider: provider,
                                generation: c.generation,
                              );
                              stagedSlashCommand = true;
                            }
                          : null,
                    ),
                  ),
              ],
            ),
          ),
        if (c.inputError.isNotEmpty || c.drafts.error.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              c.inputError.isNotEmpty ? c.inputError : c.drafts.error,
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
                  scrollController: composerScroll,
                  focusNode: composerFocus,
                  onChanged: (_) => stagedCommandTarget = null,
                  minLines: 1,
                  maxLines: 3,
                  textInputAction: TextInputAction.newline,
                  autocorrect: false,
                  enableSuggestions: false,
                  decoration: InputDecoration(
                    labelText: 'Command or message',
                    isDense: true,
                    suffixIcon: IconButton(
                      tooltip: 'Choose a file',
                      onPressed: c.connected && !sending
                          ? () => pickFile(session)
                          : null,
                      icon: const Icon(Icons.attach_file, color: blue),
                    ),
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
