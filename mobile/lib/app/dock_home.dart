import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../agent_dialog_panel.dart';
import '../agent_identity.dart';
import '../build_counts.dart';
import '../code_page.dart';
import '../console_overview.dart';
import '../console_switcher.dart';
import '../core/widgets/dock_mark.dart';
import '../dock_client.dart';
import '../features/console/attachment_controller.dart';
import '../features/console/command_target.dart';
import '../features/console/composer_controller.dart';
import '../features/console/console_commands.dart';
import '../features/console/console_composer.dart';
import '../features/console/console_more_menu.dart';
import '../features/console/console_sheets.dart';
import '../features/console/console_terminal_pane.dart';
import '../features/console/console_title.dart';
import '../features/console/console_view_sheets.dart';
import '../features/console/console_workspace.dart';
import '../features/console/terminal_typing.dart';
import '../pair_page.dart';
import '../projects_page.dart';
import '../settings_page.dart';
import 'home_chrome.dart';

/// Composes pages and console controllers. Drafts, transport, command guards
/// and terminal lifetimes belong to their feature services.
class DockHome extends StatefulWidget {
  const DockHome({super.key, required this.client});
  final DockClient client;
  @override
  State<DockHome> createState() => _DockHomeState();
}

class _DockHomeState extends State<DockHome> with WidgetsBindingObserver {
  DockClient get c => widget.client;
  int page = HomePages.console;
  bool showConsoleOverview = false,
      fitWidth = false,
      keyboardWasVisible = false;
  final typing = TerminalTyping();
  late final ComposerController composer;
  late final AttachmentController attachments;
  late final ConsoleSheets sheets;
  late final ConsoleCommands commands;
  late final Listenable changes;

  bool get onConsolePage => mounted && page == HomePages.console;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    composer = ComposerController(c, releaseTerminal: typing.stop);
    attachments = AttachmentController(
      c,
      composer,
      onConsolePage: () => onConsolePage,
    );
    sheets = ConsoleSheets(
      client: c,
      composer: composer,
      releaseInput: releaseInput,
      onConsolePage: () => onConsolePage,
    );
    commands = ConsoleCommands(
      client: c,
      run: run,
      releaseInput: releaseInput,
      onConsolePage: () => onConsolePage,
    );
    changes = Listenable.merge([c, composer, attachments]);
    c.addListener(syncProjectAccess);
    attachments.watchScreenshots(() {
      Future<void>.delayed(const Duration(seconds: 2), () async {
        if (!await attachments.checkRecentShot(run) && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('Attach this screenshot?'),
              action: SnackBarAction(
                label: 'Attach',
                onPressed: () => attachments.checkRecentShot(run, ask: true),
              ),
            ),
          );
        }
      });
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    c.removeListener(syncProjectAccess);
    attachments.dispose();
    composer.dispose();
    typing.dispose();
    super.dispose();
  }

  void releaseInput() {
    typing.stop();
    composer.focus.unfocus();
  }

  void syncProjectAccess() {
    if (!mounted || page != HomePages.projects || canReadProjects(c)) return;
    setState(() => page = HomePages.console);
    unawaited(run(() => c.setStreaming(true)));
  }

  @override
  void didChangeMetrics() {
    final visible = View.of(context).viewInsets.bottom > 0;
    if (keyboardWasVisible && !visible) typing.stop();
    keyboardWasVisible = visible;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      c.setForeground(true);
      unawaited(attachments.checkRecentShot(run));
    }
    if ([
      AppLifecycleState.paused,
      AppLifecycleState.hidden,
      AppLifecycleState.detached,
    ].contains(state)) {
      typing.stop();
      unawaited(c.drafts.flush());
      c.setForeground(false);
    }
  }

  Future<void> run(Future<dynamic> Function() action) async {
    try {
      await action();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            error is PlatformException
                ? error.message ?? 'This action is unavailable.'
                : error.toString().replaceFirst('Bad state: ', ''),
          ),
        ),
      );
    }
  }

  void selectPage(int value) {
    if (![
      HomePages.console,
      HomePages.usage,
      HomePages.settings,
      if (canReadProjects(c)) HomePages.projects,
    ].contains(value)) {
      value = canReadProjects(c) ? HomePages.projects : HomePages.console;
    }
    releaseInput();
    setState(() => page = value);
    unawaited(run(() => c.setStreaming(page == HomePages.console)));
  }

  void selectConsole(String id) {
    releaseInput();
    if (id == ConsoleSwitcher.allConsoles) {
      if (MediaQuery.sizeOf(context).shortestSide < 600) {
        setState(() => showConsoleOverview = true);
      }
    } else if (id == '+') {
      unawaited(newConsole());
    } else if (c.sessions.any((session) => session['id'] == id)) {
      setState(() => showConsoleOverview = false);
      unawaited(run(() => c.select(id)));
    }
  }

  Future<void> newConsole() => commands.create(
    context,
    onCreated: (id, chooseModel) async {
      setState(() => showConsoleOverview = false);
      await c.select(id);
      if (chooseModel && mounted) await sheets.liveControls(context, 'Model');
    },
  );

  void startTerminalTyping() {
    if (!fitWidth) {
      setState(() => fitWidth = true);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) startTerminalTyping();
      });
      return;
    }
    typing.start();
  }

  void consoleAction(String action, Map<String, dynamic> session) {
    switch (action) {
      case 'copy':
        unawaited(sheets.copy(context));
      case 'links':
        unawaited(sheets.links(context, session));
      case 'keyboard':
        startTerminalTyping();
      case 'clear-view':
        c.clearSelectedView();
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Mobile history cleared')));
      case 'files':
        unawaited(sheets.pickFile(context));
      case 'image':
        unawaited(attachments.pickImage(run));
      case 'close':
        unawaited(commands.close(context, session));
    }
  }

  void openCode(LaunchTarget target) {
    Navigator.of(context)
        .push(
          MaterialPageRoute<void>(
            builder: (_) => CodePage(client: c, consoleId: target.id),
          ),
        )
        .then((_) {
          if (mounted) composer.reloadDraft();
        });
  }

  void viewOptions(Map<String, dynamic> session) {
    unawaited(
      showConsoleViewOptions(
        context,
        onDisplay: () => showDisplaySettings(
          context,
          c,
          fitWidth: () => fitWidth,
          onFitWidth: (value) => setState(() => fitWidth = value),
          run: run,
        ),
        onStyle: () => showAppearanceSettings(context, c),
        onCopy: () => sheets.copy(context),
        onLinks: () => sheets.links(context, session),
        onClearHistory: () => consoleAction('clear-view', session),
      ),
    );
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

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: changes,
    builder: (context, _) {
      BuildCounts.hit('shell');
      if (c.pairing == null) return PairPage(client: c);
      if (c.offerAlerts && c.connected) {
        c.offerAlerts = false;
        WidgetsBinding.instance.addPostFrameCallback((_) => offerAlerts());
      }
      final current = c.sessions
          .where((session) => session['id'] == c.selected)
          .firstOrNull;
      final tablet = MediaQuery.sizeOf(context).shortestSide >= 600;
      final overviewShown = !tablet && (showConsoleOverview || current == null);
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
          title: page == HomePages.console
              ? ConsoleTitle(
                  client: c,
                  current: current,
                  overviewShown: overviewShown,
                  onOpened: releaseInput,
                  onSelected: selectConsole,
                )
              : HomePageTitle(page: page),
          actions: [
            if (!(c.state['capabilities'] as List? ?? []).contains(
              'projects.workspace',
            ))
              TasksButton(client: c),
            ConsoleMoreMenu(
              client: c,
              consoleItems: page == HomePages.console && !overviewShown,
              current: overviewShown ? null : current,
              onOpened: releaseInput,
              onCode: openCode,
              onManage: (action, target) =>
                  commands.manage(context, action, target),
              onSwitchAccount: (target, account) =>
                  commands.switchAccount(context, target, account),
              onSetupAccount: (target, account) =>
                  commands.setupAccount(context, target, account),
              onApp: () => showAppOptions(context, c, run),
              onView: viewOptions,
              onConsoleAction: consoleAction,
            ),
          ],
        ),
        body: SafeArea(
          top: false,
          child: Column(
            children: [
              if (!c.connected)
                DisconnectedBanner(client: c, onRetry: () => run(c.reconnect)),
              if (c.state['imageJobsRunning'] == true && c.connected)
                ImageJobsChip(client: c),
              Expanded(
                child: page == HomePages.console
                    ? workspace(current, tablet, overviewShown)
                    : page == HomePages.projects
                    ? ProjectsPage(
                        client: c,
                        onConsoleSelected: () {
                          setState(() {
                            page = HomePages.console;
                            showConsoleOverview = false;
                          });
                          unawaited(run(() => c.setStreaming(true)));
                        },
                      )
                    : SettingsPage(
                        client: c,
                        usageOnly: page == HomePages.usage,
                      ),
              ),
            ],
          ),
        ),
        bottomNavigationBar: MediaQuery.viewInsetsOf(context).bottom > 0
            ? null
            : HomeNavigationBar(
                page: page,
                projectAccess: canReadProjects(c),
                onPage: selectPage,
              ),
      );
    },
  );

  Widget workspace(
    Map<String, dynamic>? current,
    bool tablet,
    bool overviewShown,
  ) => ConsoleWorkspace(
    key: const ValueKey('console-workspace'),
    tablet: tablet,
    overviewShown: overviewShown,
    terminal: terminal(current),
    overview: ConsoleOverview(
      client: c,
      active: tablet || overviewShown,
      onNewConsole: newConsole,
      onSelected: selectConsole,
    ),
  );

  Widget terminal(Map<String, dynamic>? session) {
    if (session == null) {
      return EmptyConsolePane(client: c, onNewConsole: newConsole);
    }
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        child: SizedBox(
          height: !composer.chatMode
              ? constraints.maxHeight
              : max(
                  constraints.maxHeight,
                  MediaQuery.viewInsetsOf(context).bottom > 0
                      ? 200 + MediaQuery.textScalerOf(context).scale(64)
                      : 160 + MediaQuery.textScalerOf(context).scale(32),
                ),
          child: Column(
            children: [
              Expanded(
                child: ConsoleTerminalPane(
                  client: c,
                  session: session,
                  view: c.screen,
                  playOpening: c.claimConsoleOpening(session['id'] as String),
                  draftKey: composer.draftKey,
                  fitWidth: fitWidth,
                  focusNode: typing.focus,
                  onPointerDown: () {
                    releaseInput();
                    if (['ready', 'attention'].contains(session['state'])) {
                      unawaited(run(c.acknowledge));
                    }
                  },
                ),
              ),
              AgentDialogPanel(
                client: c,
                onTerminalKeys: () => sheets.terminalKeys(context),
              ),
              if (!composer.chatMode)
                TerminalKeysButton(
                  onPressed: c.connected && !composer.sending
                      ? () => sheets.terminalKeys(context)
                      : null,
                ),
              if (composer.chatMode)
                ConsoleChatPanel(
                  client: c,
                  session: session,
                  composer: composer,
                  attachments: attachments,
                  onLiveControls: (action) =>
                      sheets.liveControls(context, action),
                  onQueue: () => sheets.messageQueue(context),
                  onTerminalKeys: () => sheets.terminalKeys(context),
                  onAttach: (action) => consoleAction(action, session),
                  onAttachRecent: () => attachments.attachRecentShot(run),
                  onSend: () =>
                      composer.send(run, onConsolePage: () => onConsolePage),
                )
              else
                EnterChatHandle(
                  hasDraft: composer.editor.text.isNotEmpty,
                  onTap: composer.enterChatMode,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
