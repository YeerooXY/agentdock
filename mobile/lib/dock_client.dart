import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'core/alerts/alert_relay.dart';
import 'core/connection/endpoint_policy.dart';
import 'core/connection/socket_transport.dart';
import 'core/console_scope.dart';
import 'core/protocol/frame_codec.dart' as frames;
import 'core/protocol/request_tracker.dart';
import 'core/protocol/state_stream.dart';
import 'core/signal.dart';
import 'core/terminal/console_terminals.dart';
import 'core/terminal/console_submission.dart';
import 'pairing_request.dart';
import 'saved_devices.dart';
import 'console_drafts.dart';
import 'agent_selection.dart';
import 'agent_menu.dart';
import 'agent_profiles.dart';
import 'console_theme.dart';
import 'dock_style.dart';
import 'state_client.dart';
import 'state_models.dart';

export 'core/console_scope.dart' show ConsoleScope;
export 'core/signal.dart' show DockSignal;
export 'core/terminal/console_terminals.dart' show ConsoleScreen;

/// The phone's connection to one paired PC.
///
/// This facade keeps the map-shaped API used by pages and tests. It owns the
/// connection lifecycle (pairing, generation, retry, foreground) and composes
/// separately owned services:
/// - [SocketTransport]: pinned TLS client and event socket;
/// - [RequestTracker]: request/reply matching;
/// - [StateStream]: state protocol 2 frames;
/// - [ConsoleTerminals]: per-launch terminal buffers, signals and effects;
/// - [AlertRelay]: background notifications.
class DockClient extends ChangeNotifier implements ConsoleScope {
  /// Fires when the paired PC, link state, status text or generation changes.
  final connectionSignal = DockSignal();

  /// Fires when theme, lighting or text scale changes.
  final appearanceSignal = DockSignal();

  /// Fires when the selected console changes.
  final selectionSignal = DockSignal();
  Object? _connectionSeen, _appearanceSeen;
  String? _selectionSeen;

  final SocketTransport _transport = SocketTransport();
  final RequestTracker _requests = RequestTracker();
  late final ConsoleTerminals _terminals = ConsoleTerminals(this);
  late final StateStream _stream = StateStream(
    send: _sendFrame,
    apply: applyState,
    changed: notifyListeners,
    dropSocket: _transport.dropSocket,
  );
  late final AlertRelay _alerts = AlertRelay(
    (notification) => unawaited(
      background.invokeMethod('notify', notification).catchError((_) {}),
    ),
  );

  /// Notifier for one terminal, keyed by PC, session and launch. Output fires
  /// only this signal, not the client.
  DockSignal terminalSignal(String id) => _terminals.signal(id);

  String terminalKey(String id) => _terminals.key(id);

  Object get _connectionStamp =>
      Object.hash(activePC, connected, connecting, status, generation);
  Object get _appearanceStamp => Object.hash(
    appearance.themeId,
    appearance.starLevel,
    appearance.lighting,
    appearance.lightingSpeed,
    appearance.ambientMotion,
    appearance.openingAnimations,
    appearance.textures,
    textScale,
  );

  /// Every general change goes through here. The narrow signals fire only when
  /// their own values changed.
  @override
  void notifyListeners() {
    super.notifyListeners();
    if (_disposed) return;
    final connection = _connectionStamp, look = _appearanceStamp;
    if (_connectionSeen != connection) {
      _connectionSeen = connection;
      connectionSignal.fire();
    }
    if (_appearanceSeen != look) {
      _appearanceSeen = look;
      appearanceSignal.fire();
    }
    if (_selectionSeen != selected) {
      _selectionSeen = selected;
      selectionSignal.fire();
    }
  }

  final Map<String, AgentSelection> _agentSelections = {};
  final Map<String, String> _selectionConfirmations = {};
  String _selectionKey(String id) =>
      '$activePC:$generation:$id:${typedSession(id)?.providerSessionId}';

  AgentSelection agentSelection(String id) {
    final session = sessionMap(id) ?? <String, dynamic>{};
    final reported = AgentSelection.fromSession(session),
        key = _selectionKey(id);
    if (session['requestedSettings'] is Map) return reported;
    final terminal = screens[id]?.terminal;
    final observed = terminal == null
        ? null
        : selectionConfirmation(activeTerminalText(terminal));
    if (observed != null) {
      final signature = '${observed.model}:${observed.effort}';
      if (_selectionConfirmations[key] != signature) {
        final wasObserved = _selectionConfirmations.containsKey(key);
        _selectionConfirmations[key] = signature;
        if (wasObserved || reported.model == null) {
          _agentSelections[key] = AgentSelection(
            model: observed.model,
            effort: observed.effort,
            at: DateTime.now().millisecondsSinceEpoch,
          );
        }
      }
    }
    final saved = _agentSelections[key];
    return saved != null && saved.at >= reported.at ? saved : reported;
  }

  void rememberAgentSelection(String id, AgentSelection selection) {
    if (_agentSelections.length > 64) {
      _agentSelections.clear();
      _selectionConfirmations.clear();
    }
    _agentSelections[_selectionKey(id)] = selection;
    notifyListeners();
  }

  static const storage = FlutterSecureStorage();
  static const background = MethodChannel('agentdock/background');
  final SavedDevices devices;
  final ConsoleDrafts drafts;
  final ConsoleAppearanceStore appearanceStore;
  ConsoleAppearance appearance = const ConsoleAppearance();
  DockClient({
    SavedDevices? savedDevices,
    ConsoleDrafts? consoleDrafts,
    ConsoleAppearanceStore? consoleAppearanceStore,
  }) : appearanceStore =
           consoleAppearanceStore ??
           ConsoleAppearanceStore(
             read: () => storage.read(key: 'consoleAppearance.v1'),
             write: (value) =>
                 storage.write(key: 'consoleAppearance.v1', value: value),
           ),
       devices =
           savedDevices ??
           SavedDevices(
             read: (key) => storage.read(key: key),
             write: (key, value) => storage.write(key: key, value: value),
             delete: (key) => storage.delete(key: key),
           ),
       drafts =
           consoleDrafts ??
           ConsoleDrafts(
             read: () => storage.read(key: 'consoleDrafts.v1'),
             write: (value) =>
                 storage.write(key: 'consoleDrafts.v1', value: value),
           ) {
    drafts.addListener(notifyListeners);
    background.setMethodCallHandler((call) async {
      if (_disposed) return;
      if (call.method == 'stopped') {
        await setStayConnected(false, stopNative: false);
      }
    });
  }
  @override
  String get activePC => pairing?['pin'] as String? ?? '';
  final resultFilters = <String, Map<String, String>>{};
  final _resultThumbnails = <String, Future<Uint8List?>>{};

  bool supportsResult(String capability) => supports(capability);

  /// Whether the connected PC reports [capability].
  bool supports(String capability) =>
      (state['capabilities'] as List? ?? []).contains(capability);

  Future<Uint8List?> resultThumbnail(String id) {
    final key = '$activePC:$id';
    if (!_resultThumbnails.containsKey(key) &&
        _resultThumbnails.length >= 128) {
      _resultThumbnails.remove(_resultThumbnails.keys.first);
    }
    return _resultThumbnails.putIfAbsent(key, () async {
      try {
        final value = await request('results.preview', {
          'id': id,
          'thumbnail': true,
        });
        final data = value['image'] as String?;
        return data == null ? null : base64Decode(data.split(',').last);
      } catch (_) {
        _resultThumbnails.remove(key);
        return null;
      }
    });
  }

  void forgetResultThumbnail(String id) {
    _resultThumbnails.remove('$activePC:$id');
  }

  String get pcName =>
      pairing == null ? 'Computers' : SavedDevices.label(pairing!);
  String get phoneName => devices.phoneName;
  bool changingDevice = false;
  bool stayConnected = false;
  double textScale = 1.0;
  int _alertModeGeneration = -1;
  bool get connectionAllowed => foreground || stayConnected;
  String deviceStoreError = '';
  final Map<String, String> _selections = {};
  Map<String, dynamic>? pairing;
  Map<String, dynamic> state = {'sessions': <dynamic>[], 'unreadResults': 0};
  Map<String, ConsoleScreen> get screens => _terminals.screens;
  Map<String, Completer<dynamic>> get pending => _requests.pending;
  WebSocket? get socket => _transport.socket;
  HttpClient? get transport => _transport.http;

  /// Whether the open socket uses state protocol 2 (/v2/events). PCs that
  /// answer 404 (older builds, or protocol 2 turned off) use /v1/events.
  bool get socketV2 => _transport.v2;
  set socketV2(bool value) => _transport.v2 = value;
  StateClient get v2State => _stream.cache;
  PairingRequest? _pairingRequest;
  String pairingCode = '';
  bool _disposed = false;
  Timer? retry;
  bool connected = false,
      connecting = false,
      foreground = true,
      streaming = true,
      dataSaver = true;
  String selected = '', status = 'Pair your PC to begin.', inputError = '';
  // Set after a new pairing so the home screen can offer direct alerts once.
  bool offerAlerts = false;
  int received = 0, sent = 0, attempts = 0;
  @override
  int generation = 0;
  int get serial => _requests.serial;
  @override
  List<Map<String, dynamic>> get sessions =>
      (state['sessions'] as List? ?? []).cast<Map<String, dynamic>>();

  /// Typed console list. The map list stays the wire-compatible source.
  List<Session> get typedSessions => sessions.map(Session.fromJson).toList();

  @override
  Map<String, dynamic>? sessionMap(String id) =>
      sessions.where((s) => s['id'] == id).firstOrNull;

  /// One console as a typed [Session], or null when it is not listed.
  Session? typedSession(String id) {
    final map = sessionMap(id);
    return map == null ? null : Session.fromJson(map);
  }

  Session? get selectedSession => typedSession(selected);
  ConsoleScreen? get screen => screens[selected];

  /// Claims the one-shot opening produced by a live session-list addition.
  /// Initial snapshots and the first state after reconnect never add entries.
  bool claimConsoleOpening(String id) => _terminals.claimOpening(id);
  int consoleStateEffectSequence(String id) =>
      _terminals.stateEffectSequence(id);
  String? consoleStateEffectKind(String id) => _terminals.stateEffectKind(id);
  int consoleOutputBurstSequence(String id) =>
      _terminals.outputBurstSequence(id);
  int consoleOutputSequence(String id) => _terminals.outputSequence(id);

  Future<void> restore() async {
    // A damaged appearance preference must not prevent pairing restoration.
    try {
      appearance = await appearanceStore.load();
      DockAccent.theme = appearance.theme;
      notifyListeners();
    } catch (_) {
      /* Keep the default appearance if storage is unavailable. */
    }
    try {
      await drafts.load();
      await devices.load();
      deviceStoreError = '';
      pairing = devices.find(devices.active);
      dataSaver = await storage.read(key: 'dataSaver') != 'false';
      final savedScale = double.tryParse(
        await storage.read(key: 'textScale') ?? '',
      );
      if (savedScale != null && savedScale.isFinite) {
        textScale = savedScale.clamp(.85, 1.15).toDouble();
        notifyListeners();
      }
      if (await storage.read(key: 'stayConnected') == 'true') {
        try {
          await setStayConnected(true);
        } catch (_) {
          stayConnected = false;
        }
      }
      if (pairing != null) await connect();
    } catch (_) {
      status =
          'Saved devices could not be opened. Restart Paddock to try again.';
      deviceStoreError = status;
      notifyListeners();
    }
  }

  /// Drags update the scale only; the final value is saved once, so out-of-order
  /// storage writes cannot leave an older size behind.
  Future<void> setTextScale(double value, {bool save = true}) async {
    textScale = value.clamp(.85, 1.15).toDouble();
    notifyListeners();
    if (save) {
      await storage.write(
        key: 'textScale',
        value: textScale.toStringAsFixed(2),
      );
    }
  }

  Future<void> setConsoleAppearance(ConsoleAppearance value) async {
    await appearanceStore.save(value);
    if (_disposed) return;
    appearance = value;
    DockAccent.theme = value.theme;
    notifyListeners();
  }

  // Endpoint policy, kept here for existing callers.
  static Map<String, dynamic> parseInvite(String code, {DateTime? now}) =>
      EndpointPolicy.parseInvite(code, now: now);

  /// Lets tests reach a loopback server in place of a Tailscale address.
  @visibleForTesting
  static bool get loopbackForTests => EndpointPolicy.loopbackForTests;
  @visibleForTesting
  static set loopbackForTests(bool value) =>
      EndpointPolicy.loopbackForTests = value;

  static bool tailnetEndpoint(Uri? uri) => EndpointPolicy.tailnetEndpoint(uri);
  static bool validEndpoint(Uri uri, {bool internet = false}) =>
      EndpointPolicy.validEndpoint(uri, internet: internet);
  static List<String> endpoints(Map<String, dynamic> config) =>
      EndpointPolicy.endpoints(config);
  static String connectionError(Object error, Map<String, dynamic> config) =>
      EndpointPolicy.connectionError(error, config);
  static Duration routeTimeout(Map<String, dynamic> config, String url) =>
      EndpointPolicy.routeTimeout(config, url);
  HttpClient pinned(Map<String, dynamic> config) =>
      EndpointPolicy.pinned(config);
  static String decodeFrame(dynamic raw) => frames.decodeFrame(raw);

  Future<void> updateAddress(String value) async {
    final url = value.trim();
    final uri = Uri.tryParse(url);
    if (!tailnetEndpoint(uri)) {
      throw const FormatException(
        'Use your PC’s Tailscale address with its port, like https://100.101.102.103:47831.',
      );
    }
    final previous = pairing;
    if (previous == null) throw StateError('Pair your PC first.');
    final current = generation, pin = previous['pin'] as String;
    // Only the address changes. The original certificate pin and device token
    // stay in place, so an unrelated server cannot receive credentials.
    await devices.patch(pin, {'manualUrl': url});
    if (activePC != pin || generation != current || _disposed) return;
    pairing = devices.find(pin);
    await reconnect();
  }

  Future<void> rememberRoutes(dynamic routes) async {
    final previous = pairing;
    if (previous == null || routes is! Map) return;
    final url = routes['url'];
    const String? localUrl = null;
    if (url is! String || !tailnetEndpoint(Uri.tryParse(url))) return;
    final name = routes['name'] is String ? routes['name'] : previous['name'];
    if (url == previous['url'] &&
        localUrl == previous['localUrl'] &&
        name == previous['name']) {
      return;
    }
    final current = generation, pin = previous['pin'] as String;
    // Called only for state received through the authenticated pinned socket.
    try {
      await devices.patch(pin, {
        'url': url,
        'localUrl': localUrl,
        'name': name,
        if (previous['manualUrl'] == url) 'manualUrl': null,
      });
      if (current == generation && activePC == pin && !_disposed) {
        pairing = devices.find(pin);
        notifyListeners();
      }
    } catch (_) {
      /* Keep the last saved routes if storage is unavailable. */
    }
  }

  void activate(Map<String, dynamic>? pc) {
    _selections[activePC] = selected;
    disconnectTransport();
    _resultThumbnails.clear();
    pairing = pc;
    AgentProfiles.apply(null);
    screens.clear();
    selected = _selections[activePC] ?? '';
    state = {'sessions': <dynamic>[], 'unreadResults': 0};
    _stream.clear();
    received = sent = attempts = 0;
    inputError = '';
    status = pc == null ? 'Pair your PC to begin.' : 'Connecting…';
    if (pc == null && stayConnected) {
      unawaited(setStayConnected(false).catchError((_) {}));
    }
    if (!_disposed) notifyListeners();
  }

  Future<void> switchPC(String pin) async {
    if (changingDevice || _pairingRequest != null) {
      throw StateError('Finish the current device change first.');
    }
    if (pin == activePC) return;
    changingDevice = true;
    try {
      await devices.select(pin);
      activate(devices.find(pin));
      unawaited(connect());
    } finally {
      changingDevice = false;
    }
  }

  Future<void> renamePC(String pin, String name) async {
    final pc = devices.find(pin);
    if (pc == null) throw StateError('This PC is no longer saved.');
    await devices.patch(pin, {'alias': SavedDevices.name(name)});
    if (activePC == pin) pairing = devices.find(pin);
    notifyListeners();
  }

  Future<void> renamePhone(String value) async {
    final name = SavedDevices.name(value);
    await devices.change((data) {
      data['phoneName'] = name;
      for (final pc in data['pcs'] as List) {
        pc['pendingPhoneName'] = name;
      }
    });
    if (pairing != null) pairing = devices.find(activePC);
    notifyListeners();
    await syncPhoneName();
  }

  Future<void> syncPhoneName() async {
    final pin = activePC, current = generation;
    final name = pairing?['pendingPhoneName'];
    if (!connected || name == null) return;
    try {
      await request('device.rename', {'name': name});
      await devices.change((data) {
        for (final pc in data['pcs'] as List) {
          if (pc['pin'] == pin && pc['pendingPhoneName'] == name) {
            pc.remove('pendingPhoneName');
          }
        }
      });
      if (generation == current) pairing = devices.find(pin);
    } catch (_) {
      /* Older hosts keep the pending name until they update. */
    }
  }

  Future<void> reconnect() async {
    if (pairing == null || !foreground) return;
    disconnectTransport();
    _transport.forgetV2Refusals();
    foreground = true;
    attempts = 0;
    await connect();
  }

  Future<void> pair(String code) async {
    if (deviceStoreError.isNotEmpty) throw FormatException(deviceStoreError);
    if (changingDevice) {
      throw StateError('Finish the current device change first.');
    }
    final invite = parseInvite(code);
    await cancelPairing();
    String? preferred;
    final operation = PairingRequest(invite, (route, auth, body) async {
      Object? failure;
      for (final url in {
        if (preferred != null) preferred!,
        ...endpoints(invite),
      }) {
        final client = pinned({...invite, 'url': url});
        try {
          final request = await client
              .postUrl(Uri.parse('$url$route'))
              .timeout(routeTimeout(invite, url));
          request.followRedirects = false;
          request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $auth');
          request.headers.contentType = ContentType.json;
          request.write(jsonEncode(body));
          final response = await request.close().timeout(
            routeTimeout(invite, url),
          );
          final chunks = <int>[];
          await for (final chunk in response.timeout(
            const Duration(seconds: 10),
          )) {
            chunks.addAll(chunk);
            if (chunks.length > 8192) {
              throw const FormatException(
                'The pairing response was too large.',
              );
            }
          }
          final decoded = jsonDecode(utf8.decode(chunks));
          if (decoded is! Map<String, dynamic>) {
            throw const FormatException(
              'The PC returned an invalid pairing response.',
            );
          }
          preferred = url;
          return PairReply(response.statusCode, decoded);
        } on FormatException {
          rethrow;
        } catch (error) {
          failure = error;
        } finally {
          client.close(force: true);
        }
      }
      throw failure ?? StateError('The PC could not be reached.');
    }, name: phoneName);
    _pairingRequest = operation;
    try {
      final result = await operation.run((code) {
        pairingCode = code;
        if (!_disposed) notifyListeners();
      });
      operation.checkCancelled();
      final saved = {
        'url': invite['url'],
        'localUrl': invite['localUrl'],
        'manualUrl': null,
        'pin': invite['pin'],
        'token': result['token'],
        'id': result['id'],
        'name': result['name'],
      };
      await devices.put(
        saved,
        activate: true,
        valid: () => !operation.cancelled && !_disposed,
      );
      _pairingRequest = null;
      pairingCode = '';
      activate(devices.find(saved['pin'] as String));
      offerAlerts = !stayConnected;
      unawaited(connect());
    } catch (_) {
      await operation.cancel();
      rethrow;
    } finally {
      if (_pairingRequest == operation) _pairingRequest = null;
      pairingCode = '';
      if (!_disposed) notifyListeners();
    }
  }

  Future<void> cancelPairing() async {
    await _pairingRequest?.cancel();
  }

  /// Opens a pinned socket for [current]. A later generation or a paused
  /// connection discards the result.
  Future<WebSocket> openSocket(Map<String, dynamic> config, int current) =>
      _transport.open(
        config,
        wanted: () => connectionAllowed && current == generation,
        foreground: () => foreground,
      );

  Future<void> connect() async {
    if (pairing == null || !connectionAllowed || connecting || connected) {
      return;
    }
    connecting = true;
    final current = ++generation;
    status = 'Connecting…';
    notifyListeners();
    retry?.cancel();
    try {
      final ws = await openSocket(pairing!, current);
      if (current != generation || !connectionAllowed) {
        await ws.close();
        return;
      }
      _transport.adopt(ws);
      connected = true;
      connecting = false;
      attempts = 0;
      status = 'Connected';
      ws.listen(
        (raw) {
          if (current == generation) handleMessage(raw);
        },
        onDone: () => disconnected(current),
        onError: (_) => disconnected(current),
        cancelOnError: true,
      );
      if (socketV2) _stream.start();
      if (selected.isNotEmpty && streaming) await subscribe();
      unawaited(syncPhoneName());
      unawaited(syncAlertMode().catchError((_) {}));
      notifyListeners();
    } catch (error) {
      if (current == generation) {
        connecting = false;
        disconnected(current, reason: connectionError(error, pairing!));
      }
    }
  }

  void disconnected(int current, {String? reason}) {
    if (current != generation) return;
    _terminals.cancelOpenings();
    ++generation; // Ignore late events from the socket that just failed.
    connected = false;
    connecting = false;
    _transport.close();
    _requests.failAll(
      'Connection lost. Check the console before sending again.',
    );
    status = connectionAllowed
        ? reason ?? 'Connection lost. Reconnecting to your PC…'
        : 'Paused';
    if (stayConnected) {
      unawaited(
        background
            .invokeMethod('status', {'name': '$pcName, Reconnecting'})
            .catchError((_) => null),
      );
    }
    if (connectionAllowed && pairing != null) {
      retry?.cancel();
      retry = Timer(
        Duration(seconds: min(30, 2 << min(attempts++, 4))),
        connect,
      );
    }
    notifyListeners();
  }

  void handleMessage(dynamic raw) {
    try {
      received += raw is String
          ? utf8.encode(raw).length
          : (raw as List<int>).length;
      Map<String, dynamic>? data =
          jsonDecode(decodeFrame(raw)) as Map<String, dynamic>;
      // Protocol 2 frames share the socket with replies and terminal output.
      if (socketV2) data = _stream.accept(data);
      if (data == null) return;
      switch (data['type']) {
        case 'reply':
          _requests.reply(data);
          notifyListeners();
        case 'state':
          applyState(data['state'] as Map<String, dynamic>);
          notifyListeners();
        case 'terminal':
          final structural = _terminals.receive(data, makeScreen);
          if (structural == null) return;
          terminalSignal(data['id'] as String).fire();
          if (structural) notifyListeners();
        default:
          notifyListeners();
      }
    } catch (_) {
      status = 'The PC sent an unreadable update. Reconnecting…';
      _transport.dropSocket();
    }
  }

  /// Applies a v1-shaped state map: a v1 `state` frame, or the map rebuilt
  /// from protocol 2 slices and extras.
  void applyState(Map<String, dynamic> nextState) {
    AgentProfiles.apply(nextState['agentProfiles']);
    final previous = {for (final s in sessions) s['id']: s['state']};
    final nextSessions = (nextState['sessions'] as List? ?? [])
        .whereType<Map>()
        .cast<Map<String, dynamic>>()
        .toList();
    _terminals.observeSessions(previous, nextSessions);
    state = nextState;
    if (_alertModeGeneration != generation && supports('alerts.direct')) {
      _alertModeGeneration = generation;
      unawaited(syncAlertMode().catchError((_) {}));
    }
    if (stayConnected) {
      _alerts.relay(
        pc: activePC,
        state: state,
        previousStates: previous,
        sessions: sessions,
        foreground: foreground,
      );
    }
    unawaited(rememberRoutes(state['connection']));
    _terminals.keepScreens(sessions.map((s) => s['id']).toSet());
    if (!sessions.any((s) => s['id'] == selected)) {
      selected = sessions.isEmpty ? '' : sessions.first['id'] as String;
      if (selected.isNotEmpty && streaming) subscribe().catchError((_) {});
    }
    if (!socketV2 && supports('state.v2')) {
      // The PC turned protocol 2 on: use it on the next connection.
      _transport.allowV2(activePC);
    }
  }

  void _sendFrame(Map<String, dynamic> message) {
    final bytes = _transport.send(jsonEncode(message));
    if (bytes != null) sent += bytes;
  }

  /// A terminal buffer whose keyboard output reaches only the console, PC and
  /// buffer it was created for.
  ConsoleScreen makeScreen(String id) {
    final view = ConsoleScreen();
    final pin = activePC;
    view.terminal.onOutput = (text) {
      if (!view.receiving && pin == activePC && identical(screens[id], view)) {
        input(text, id: id).catchError((error) {
          inputError = error.toString().replaceFirst('Bad state: ', '');
          notifyListeners();
        });
      }
    };
    return view;
  }

  Future<dynamic> request(
    String method, [
    Map<String, dynamic> payload = const {},
  ]) async {
    if (!connected || socket == null) {
      throw StateError('Reconnect to your PC first.');
    }
    final (:id, :completer) = _requests.open();
    _sendFrame({
      if (socketV2) 'type': 'request',
      'id': id,
      'method': method,
      'payload': payload,
    });
    try {
      return await completer.future.timeout(RequestTracker.timeout(method));
    } finally {
      _requests.close(id);
    }
  }

  Future<int> previewStatus(String id, String address) async {
    final config = pairing;
    if (!connected || config == null) {
      throw StateError('Reconnect to your PC first.');
    }
    final path = Uri.tryParse(address);
    if (path == null || !RegExp(r'^[a-f0-9-]{36}$').hasMatch(id)) {
      throw const FormatException('Invalid preview.');
    }
    Object? failure;
    for (final endpoint in endpoints(config)) {
      final client = pinned({...config, 'url': endpoint});
      try {
        final uri = Uri.parse(endpoint).replace(
          path: '/v1/preview/$id${path.path.isEmpty ? '/' : path.path}',
          query: path.hasQuery ? path.query : null,
        );
        final request = await client
            .getUrl(uri)
            .timeout(routeTimeout(config, endpoint));
        request.followRedirects = false;
        request.headers.set(
          HttpHeaders.authorizationHeader,
          'Bearer ${config['token']}',
        );
        final response = await request.close().timeout(
          const Duration(seconds: 32),
        );
        await response.drain<void>().timeout(const Duration(seconds: 32));
        return response.statusCode;
      } catch (error) {
        failure = error;
      } finally {
        client.close(force: true);
      }
    }
    throw failure ?? StateError('The PC could not be reached.');
  }

  bool get canEditPrompts => supports('prompts.edit');

  Future<void> refreshQueue() async {
    final pin = activePC, transportGeneration = generation;
    final snapshot = await request('state');
    if (!connected || activePC != pin || generation != transportGeneration) {
      return;
    }
    if (snapshot is! Map) return;
    state = {
      ...state,
      'queues': snapshot['queues'],
      'prompts': snapshot['prompts'],
    };
    notifyListeners();
  }

  Future<void> subscribe() async {
    if (!connected) return;
    final view = screens.putIfAbsent(selected, () => makeScreen(selected));
    await request('subscribe', {
      'id': streaming && foreground ? selected : '',
      'sequence': view.sequence,
      'epoch': view.epoch,
      'saver': dataSaver,
    });
  }

  Future<void> select(String id) async {
    selected = id;
    inputError = '';
    notifyListeners();
    await subscribe();
  }

  /// Discard phone scrollback, preserving the active screen, parser modes and
  /// cursor needed by subsequent PTY frames. A host reset can send a new snapshot.
  void clearSelectedView() {
    final id = selected;
    final current = screens[id];
    if (id.isEmpty || current == null) return;
    current.terminal.mainBuffer.clearScrollback();
    current.terminal.altBuffer.clearScrollback();
    current.terminal.write('');
    notifyListeners();
  }

  Future<void> setStreaming(bool value) async {
    streaming = value;
    await subscribe();
  }

  Future<void> input(String value, {String? id}) async {
    if (typedSession(id ?? selected)?.taskId != null) {
      throw StateError('Use the worker composer for steering.');
    }
    await request('input', {'id': id ?? selected, 'data': value});
    inputError = '';
  }

  late final ConsoleSubmission _submission = ConsoleSubmission(
    snapshot: () => (
      pc: activePC,
      selected: selected,
      generation: generation,
      connection: socket,
      connected: connected,
      foreground: foreground,
      bracketedPaste: screens[selected]?.terminal.bracketedPasteMode == true,
      session: typedSession(selected),
    ),
    request: (method, payload) => request(method, payload),
    input: input,
  );

  String workerSubmissionId(String id, String text) =>
      _submission.workerSubmissionId(id, text);

  Future<void> submit(
    String text, {
    bool command = false,
    bool Function()? canContinue,
  }) => _submission.submit(text, command: command, canContinue: canContinue);

  Future<void> acknowledge() async {
    if (connected && selected.isNotEmpty) {
      await request('acknowledge', {'id': selected});
    }
  }

  Future<void> setSaver(bool value) async {
    dataSaver = value;
    await storage.write(key: 'dataSaver', value: '$value');
    await subscribe();
    notifyListeners();
  }

  void setForeground(bool value) {
    foreground = value;
    _transport.setForeground(value);
    if (value) {
      // Opening Paddock reviews the alerts; clear them from the shade.
      unawaited(background.invokeMethod('clear').catchError((_) {}));
      connect();
      if (connected) unawaited(subscribe().catchError((_) {}));
    } else {
      unawaited(cancelPairing());
      if (stayConnected) {
        if (connected) unawaited(subscribe().catchError((_) {}));
      } else {
        disconnectTransport();
        status = 'Paused';
      }
      notifyListeners();
    }
  }

  Future<String> attachImage(Uint8List bytes) async {
    final id = selected, current = generation, pc = activePC;
    bool valid() =>
        connected &&
        foreground &&
        selected == id &&
        generation == current &&
        activePC == pc;
    if (!valid() || bytes.length > 4 * 1024 * 1024 || bytes.isEmpty) {
      throw StateError('Choose an image up to 4 MB.');
    }
    final start = await request('attachment.begin', {
      'id': id,
      'size': bytes.length,
    });
    for (var offset = 0; offset < bytes.length; offset += 32768) {
      if (!valid()) {
        throw StateError('Console changed. Choose the image again.');
      }
      await request('attachment.chunk', {
        'uploadId': start['uploadId'],
        'offset': offset,
        'data': base64Encode(
          bytes.sublist(offset, min(offset + 32768, bytes.length)),
        ),
      });
    }
    if (!valid()) throw StateError('Console changed. Choose the image again.');
    final result = await request('attachment.finish', {
      'uploadId': start['uploadId'],
    });
    if (!valid()) {
      throw StateError('Console changed. Check the original attachment.');
    }
    return result['path'] as String;
  }

  Future<void> syncAlertMode() async {
    if (supports('alerts.direct')) {
      await request('alerts.mode', {'direct': stayConnected});
    }
    if (stayConnected) {
      await background.invokeMethod('status', {'name': '$pcName, $status'});
    }
  }

  Future<void> setStayConnected(bool value, {bool stopNative = true}) async {
    if (value) {
      final allowed = await const MethodChannel('agentdock/permissions')
          .invokeMethod<bool>('notifications');
      if (allowed != true) {
        throw StateError(
          'Allow notifications in Android settings to use direct alerts.',
        );
      }
      await background.invokeMethod('start', {'name': pcName});
      _alerts.baseline(activePC, state['alerts'], connected: connected);
    }
    stayConnected = value;
    await storage.write(key: 'stayConnected', value: '$value');
    if (!value && stopNative) await background.invokeMethod('stop');
    if (connected) await syncAlertMode();
    if (!value && !foreground) disconnectTransport();
    notifyListeners();
  }

  void disconnectTransport() {
    _terminals.cancelOpenings();
    generation++;
    retry?.cancel();
    _transport.close();
    connected = false;
    connecting = false;
    _requests.failAll(
      'Connection paused. Check the console before sending again.',
    );
  }

  Future<void> forgetPC(String pin) async {
    if (changingDevice || _pairingRequest != null) {
      throw StateError('Finish the current device change first.');
    }
    changingDevice = true;
    try {
      await drafts.forgetPC(pin);
      await devices.remove(pin);
      _selections.remove(pin);
      if (pin == activePC) {
        activate(devices.find(devices.active));
        unawaited(connect());
      }
      notifyListeners();
    } finally {
      changingDevice = false;
    }
  }

  Future<void> forget() => forgetPC(activePC);

  @override
  void dispose() {
    _disposed = true;
    unawaited(cancelPairing());
    foreground = false;
    generation++;
    retry?.cancel();
    _transport.close();
    drafts.removeListener(notifyListeners);
    drafts.dispose();
    _stream.dispose();
    connectionSignal.dispose();
    appearanceSignal.dispose();
    selectionSignal.dispose();
    _terminals.dispose();
    super.dispose();
  }
}
