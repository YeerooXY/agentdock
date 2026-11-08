import '../../dock_client.dart';
import '../../state_models.dart';

/// The PC, console, provider and connection a staged composer action was
/// prepared for. A changed target must never receive it.
class CommandTarget {
  final String pc, session, provider;
  final int generation;
  const CommandTarget({
    required this.pc,
    required this.session,
    required this.provider,
    required this.generation,
  });

  /// The selected console now, or null when nothing is selected.
  static CommandTarget? capture(DockClient c) {
    final session = c.selectedSession;
    if (session == null) return null;
    return CommandTarget(
      pc: c.activePC,
      session: session.id,
      provider: session.provider,
      generation: c.generation,
    );
  }

  bool isCurrent(DockClient c) =>
      c.connected &&
      c.foreground &&
      c.activePC == pc &&
      c.selected == session &&
      c.generation == generation &&
      c.typedSessions.any((s) => s.id == session && s.provider == provider);
}

/// One console launch as it was when its menu opened. Menu actions run only
/// if the same launch is still selected on the same PC and connection.
class LaunchTarget {
  /// A copy of the console's wire map, kept for request payloads.
  final Map<String, dynamic> session;
  final Session launch;
  final String pc;
  final int generation;

  LaunchTarget(
    Map<String, dynamic> session, {
    required this.pc,
    required this.generation,
  }) : session = Map<String, dynamic>.from(session),
       launch = Session.fromJson(session);

  static LaunchTarget capture(DockClient c, Map<String, dynamic> session) =>
      LaunchTarget(session, pc: c.activePC, generation: c.generation);

  String get id => launch.id;

  /// The identity fields every launch-scoped request carries.
  Map<String, dynamic> get identity => {
    'id': session['id'],
    'consoleKey': session['consoleKey'],
    'launchId': session['launchId'],
  };

  bool _selected(DockClient c) =>
      c.connected &&
      c.activePC == pc &&
      c.generation == generation &&
      c.selected == launch.id;

  bool _sameLaunch(Session s) =>
      s.id == launch.id &&
      s.consoleKey == launch.consoleKey &&
      s.launchId == launch.launchId;

  /// Still selected, alive and not dismissed (rename and project changes).
  bool isLiveLaunch(DockClient c) =>
      _selected(c) &&
      c.sessions.any((item) {
        final s = Session.fromJson(item);
        return _sameLaunch(s) && s.alive && item['dismissed'] != true;
      });

  /// Still selected in the foreground with the same account (account
  /// switching and setup).
  bool isSameAccount(DockClient c) =>
      c.foreground &&
      _selected(c) &&
      c.typedSessions.any(
        (s) => _sameLaunch(s) && s.accountId == launch.accountId,
      );

  /// The console now runs [accountId] on the same console key.
  bool switchedTo(DockClient c, String accountId) =>
      _selected(c) &&
      c.typedSessions.any(
        (s) =>
            s.id == launch.id &&
            s.consoleKey == launch.consoleKey &&
            s.accountId == accountId,
      );
}
