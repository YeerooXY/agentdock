import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:xterm/xterm.dart';

import 'pairing_request.dart';
import 'saved_devices.dart';
import 'console_drafts.dart';
import 'agent_selection.dart';
import 'agent_menu.dart';
import 'console_theme.dart';
import 'dock_style.dart';

class ConsoleScreen {
  final Terminal terminal = Terminal(maxLines: 3000);
  int sequence = -1, epoch = 0, cols = 110, rows = 30;
  bool receiving = false;
}

class _FrameBytes implements Sink<List<int>> {
  final bytes = <int>[];
  @override
  void add(List<int> chunk) {
    if (bytes.length + chunk.length > 5 * 1024 * 1024) {
      throw const FormatException('Frame too large');
    }
    bytes.addAll(chunk);
  }

  @override
  void close() {}
}

class DockClient extends ChangeNotifier {
  final Map<String, AgentSelection> _agentSelections = {};
  final Map<String, String> _selectionConfirmations = {};
  String _selectionKey(String id) {
    final session = sessions.where((s) => s['id'] == id).firstOrNull;
    return '$activePC:$generation:$id:${session?['providerSessionId']}';
  }

  AgentSelection agentSelection(String id) {
    final session =
        sessions.where((s) => s['id'] == id).firstOrNull ?? <String, dynamic>{};
    final reported = AgentSelection.fromSession(session),
        key = _selectionKey(id);
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
  String get activePC => pairing?['pin'] as String? ?? '';
  final resultFilters = <String, Map<String, String>>{};
  final _resultThumbnails = <String, Future<Uint8List?>>{};

  bool supportsResult(String capability) =>
      (state['capabilities'] as List? ?? []).contains(capability);

  Future<Uint8List?> resultThumbnail(String id) {
    final key = '$activePC:$id';
    if (!_resultThumbnails.containsKey(key) && _resultThumbnails.length >= 128) {
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
  bool _alertBaselinePending = false;
  final Set<String> _seenAlerts = {};
  int _alertModeGeneration = -1;
  bool get connectionAllowed => foreground || stayConnected;
  String deviceStoreError = '';
  final Map<String, String> _selections = {};
  final Set<String> _pendingConsoleOpenings = {};
  final Map<String, int> _consoleStateEffectSequences = {};
  final Map<String, String> _consoleStateEffectKinds = {};
  final Map<String, int> _consoleOutputBurstSequences = {};
  final Map<String, int> _consoleOutputSequences = {};
  final Map<String, DateTime> _consoleOutputLastPackets = {};
  final Map<String, int> _consoleOutputGenerations = {};
  final Set<String> _pendingConsoleOutputBaselines = {};
  int _consoleBaselineGeneration = -1;
  Map<String, dynamic>? pairing;
  Map<String, dynamic> state = {'sessions': <dynamic>[], 'unreadResults': 0};
  final Map<String, ConsoleScreen> screens = {};
  final Map<String, Completer<dynamic>> pending = {};
  WebSocket? socket;
  HttpClient? transport;
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
  int received = 0, sent = 0, attempts = 0, serial = 0, generation = 0;
  List<Map<String, dynamic>> get sessions =>
      (state['sessions'] as List? ?? []).cast<Map<String, dynamic>>();
  ConsoleScreen? get screen => screens[selected];

  /// Claims the one-shot opening produced by a live session-list addition.
  /// Initial snapshots and the first state after reconnect never add entries.
  bool claimConsoleOpening(String id) =>
      _pendingConsoleOpenings.remove('$activePC:$id');
  int consoleStateEffectSequence(String id) =>
      _consoleStateEffectSequences['$activePC:$id'] ?? 0;
  String? consoleStateEffectKind(String id) =>
      _consoleStateEffectKinds['$activePC:$id'];
  int consoleOutputBurstSequence(String id) =>
      _consoleOutputBurstSequences['$activePC:$id'] ?? 0;
  int consoleOutputSequence(String id) =>
      _consoleOutputSequences['$activePC:$id'] ?? 0;

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
      await storage.write(key: 'textScale', value: textScale.toStringAsFixed(2));
    }
  }

  Future<void> setConsoleAppearance(ConsoleAppearance value) async {
    await appearanceStore.save(value);
    if (_disposed) return;
    appearance = value;
    DockAccent.theme = value.theme;
    notifyListeners();
  }

  static Map<String, dynamic> parseInvite(String code, {DateTime? now}) {
    if (!code.trim().startsWith('agentdock:') || code.length > 4000) {
      throw const FormatException(
        'Use a pairing code from Paddock on your PC.',
      );
    }
    final invite = jsonDecode(
      utf8.decode(
        base64Url.decode(base64Url.normalize(code.trim().substring(10))),
      ),
    ) as Map<String, dynamic>;
    final uri = Uri.parse(invite['url'] as String);
    // Paddock connects only through Tailscale. Codes from a PC still set up
    // for Wi-Fi or direct internet are refused with the way forward.
    if (invite['v'] == 2 ||
        invite['v'] == 1 && validEndpoint(uri) && !tailnetEndpoint(uri)) {
      throw const FormatException(
        'Your PC is not set up for Tailscale. In Paddock on the PC, open Phone setup, choose its Tailscale address, then show a new QR code.',
      );
    }
    if (invite['v'] != 1 ||
        !tailnetEndpoint(uri) ||
        invite.containsKey('localUrl') ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(invite['pin'] as String? ?? '') ||
        !RegExp(r'^[A-Za-z0-9_-]{43}$')
            .hasMatch(invite['secret'] as String? ?? '')) {
      throw const FormatException('This pairing code is not valid.');
    }
    if ((invite['expires'] as num? ?? 0) <
        (now ?? DateTime.now()).millisecondsSinceEpoch) {
      throw const FormatException(
        'This code expired. Show a new QR code on your PC.',
      );
    }
    return invite;
  }

  /// Lets tests reach a loopback server in place of a Tailscale address.
  @visibleForTesting
  static bool loopbackForTests = false;

  /// A Tailscale address (100.64.0.0/10), the only route Paddock accepts.
  static bool tailnetEndpoint(Uri? uri) {
    if (loopbackForTests && uri?.host == '127.0.0.1' && validEndpoint(uri!)) {
      return true;
    }
    final b = uri == null
        ? null
        : InternetAddress.tryParse(uri.host)?.rawAddress;
    return uri != null &&
        b?.length == 4 &&
        b![0] == 100 &&
        b[1] >= 64 &&
        b[1] <= 127 &&
        validEndpoint(uri);
  }

  static bool validEndpoint(Uri uri, {bool internet = false}) {
    final ip = InternetAddress.tryParse(uri.host);
    final b = ip?.rawAddress;
    final private =
        b?.length == 4 &&
        (b![0] == 10 ||
            b[0] == 127 ||
            b[0] == 192 && b[1] == 168 ||
            b[0] == 172 && b[1] >= 16 && b[1] <= 31 ||
            b[0] == 100 && b[1] >= 64 && b[1] <= 127);
    final publicIp =
        b?.length == 4 &&
        !private &&
        b![0] != 0 &&
        b[0] < 224 &&
        !(b[0] == 169 && b[1] == 254) &&
        !(b[0] == 192 && b[1] == 0 && (b[2] == 0 || b[2] == 2)) &&
        !(b[0] == 198 &&
            (b[1] == 18 || b[1] == 19 || b[1] == 51 && b[2] == 100)) &&
        !(b[0] == 203 && b[1] == 0 && b[2] == 113);
    final hostname =
        ip == null &&
        uri.host.length <= 253 &&
        uri.host.contains('.') &&
        !RegExp(r'^[\d.]+$').hasMatch(uri.host) &&
        !RegExp(r'\.(local|localhost|lan|internal|home|invalid|test)$')
            .hasMatch(uri.host) &&
        uri.host
            .split('.')
            .every(
              (x) =>
                  RegExp(r'^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$').hasMatch(x),
            );
    if (uri.scheme != 'https' ||
        !(internet ? publicIp || hostname : private) ||
        uri.userInfo.isNotEmpty ||
        uri.path.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        !uri.hasPort ||
        uri.port < 1024 ||
        uri.port > 65535) {
      return false;
    }
    return true;
  }

  /// Saved routes the phone may try. Wi-Fi and internet routes saved before
  /// Paddock became Tailscale-only are skipped, never contacted.
  static List<String> endpoints(Map<String, dynamic> config) => {
    if (config['manualUrl'] is String) config['manualUrl'] as String,
    if (config['localUrl'] is String) config['localUrl'] as String,
    if (config['url'] is String) config['url'] as String,
  }.where((url) => tailnetEndpoint(Uri.tryParse(url))).toList();

  static String connectionError(Object error, Map<String, dynamic> config) {
    if (error is HandshakeException) {
      return 'The server identity could not be verified. Check the address and phone clock. Pair again on your PC if its identity changed.';
    }
    if (error is WebSocketException && error.httpStatusCode == 401) {
      return 'This phone was not accepted. Its access may have been removed. Pair it again on your PC.';
    }
    final url = config['manualUrl'] ?? config['url'];
    final uri = url is String ? Uri.tryParse(url) : null;
    final ip = uri == null ? null : InternetAddress.tryParse(uri.host);
    final tailnet =
        ip != null &&
        ip.type == InternetAddressType.IPv4 &&
        ip.rawAddress[0] == 100 &&
        ip.rawAddress[1] >= 64 &&
        ip.rawAddress[1] <= 127;
    if (tailnet) {
      return 'PC unreachable. Turn on Tailscale on this phone, signed in to the same account as your PC, and check that Paddock is running.';
    }
    return 'Paddock now connects only through Tailscale. Turn on Tailscale on this phone and your PC, choose the PC’s Tailscale address in PC Phone setup, then enter it under Connection.';
  }

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
    screens.clear();
    selected = _selections[activePC] ?? '';
    state = {'sessions': <dynamic>[], 'unreadResults': 0};
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
    foreground = true;
    attempts = 0;
    await connect();
  }

  static Duration routeTimeout(Map<String, dynamic> config, String url) =>
      Duration(seconds: config['localUrl'] == url ? 2 : 12);

  HttpClient pinned(Map<String, dynamic> config) {
    final endpoint = Uri.parse(config['url'] as String);
    final client = HttpClient(
      context: SecurityContext(withTrustedRoots: false),
    );
    client.connectionTimeout = routeTimeout(config, config['url'] as String);
    client.badCertificateCallback = (cert, host, port) =>
        host == endpoint.host &&
        port == endpoint.port &&
        cert.startValidity.isBefore(DateTime.now()) &&
        cert.endValidity.isAfter(DateTime.now()) &&
        sha256.convert(cert.der).toString() == config['pin'];
    return client;
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

  Future<WebSocket> openSocket(Map<String, dynamic> config, int current) async {
    Object? failure;
    Object? manualFailure;
    for (final endpoint in endpoints(config)) {
      if (!connectionAllowed || current != generation) {
        throw StateError('Connection paused.');
      }
      final client = pinned({...config, 'url': endpoint});
      transport = client;
      try {
        final ws = await WebSocket.connect(
          Uri.parse('$endpoint/v1/events').replace(scheme: 'wss').toString(),
          headers: {
            HttpHeaders.authorizationHeader: 'Bearer ${config['token']}',
          },
          customClient: client,
          compression: CompressionOptions.compressionOff,
        ).timeout(routeTimeout(config, endpoint));
        if (current != generation || !connectionAllowed) {
          await ws.close();
          client.close(force: true);
          throw StateError('Connection paused.');
        }
        // Detect a dead Wi-Fi/mobile route even when no terminal data is sent.
        ws.pingInterval = Duration(seconds: foreground ? 15 : 60);
        return ws;
      } catch (error) {
        failure = error;
        if (endpoint == config['manualUrl']) manualFailure = error;
        client.close(force: true);
      }
    }
    throw manualFailure ??
        failure ??
        StateError('The PC could not be reached.');
  }

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
      socket = ws;
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
    _pendingConsoleOpenings.clear();
    ++generation; // Ignore late events from the socket that just failed.
    connected = false;
    connecting = false;
    socket?.close();
    socket = null;
    transport?.close(force: true);
    for (final entry in pending.values) {
      if (!entry.isCompleted) {
        entry.completeError(
          StateError(
            'Connection lost. Check the console before sending again.',
          ),
        );
      }
    }
    pending.clear();
    status = connectionAllowed
        ? reason ?? 'Connection lost. Reconnecting to your PC…'
        : 'Paused';
    if (stayConnected) {
      unawaited(
        background
            .invokeMethod('status', {'name': '$pcName \u00b7 Reconnecting'})
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

  static String decodeFrame(dynamic raw) {
    if (raw is String) {
      if (raw.length > 5 * 1024 * 1024) {
        throw const FormatException('Frame too large');
      }
      return raw;
    }
    if (raw is! List<int> || raw.length > 5 * 1024 * 1024) {
      throw const FormatException('Frame too large');
    }
    final output = _FrameBytes();
    final decoder = gzip.decoder.startChunkedConversion(output);
    decoder.add(raw);
    decoder.close();
    return utf8.decode(output.bytes);
  }

  void handleMessage(dynamic raw) {
    try {
      received += raw is String
          ? utf8.encode(raw).length
          : (raw as List<int>).length;
      final text = decodeFrame(raw);
      final data = jsonDecode(text) as Map<String, dynamic>;
      if (data['type'] == 'reply') {
        final done = pending.remove(data['id']);
        if (done != null && !done.isCompleted) {
          if (data['error'] != null) {
            done.completeError(StateError(data['error'] as String));
          } else {
            done.complete(data['value']);
          }
        }
      } else if (data['type'] == 'state') {
        final previous = {for (final s in sessions) s['id']: s['state']};
        final nextState = data['state'] as Map<String, dynamic>;
        final nextSessions = (nextState['sessions'] as List? ?? [])
            .whereType<Map>()
            .cast<Map<String, dynamic>>()
            .toList();
        if (_consoleBaselineGeneration != generation) {
          _consoleBaselineGeneration = generation;
          _pendingConsoleOpenings.clear();
          _pendingConsoleOutputBaselines.addAll(
            nextSessions.map((session) => '$activePC:${session['id']}'),
          );
        } else {
          for (final session in nextSessions) {
            if (session['alive'] == true &&
                !previous.containsKey(session['id'])) {
              _pendingConsoleOpenings.add('$activePC:${session['id']}');
              _pendingConsoleOutputBaselines.add('$activePC:${session['id']}');
            }
            final key = '$activePC:${session['id']}',
                oldState = previous[session['id']],
                nextStateValue = session['state'];
            final effect = nextStateValue == 'ready' && oldState != 'ready'
                ? 'ready'
                : nextStateValue == 'error' && oldState != 'error'
                ? 'error'
                : null;
            if (effect != null) {
              _consoleStateEffectSequences.update(
                key,
                (value) => value + 1,
                ifAbsent: () => 1,
              );
              _consoleStateEffectKinds[key] = effect;
            }
          }
        }
        final nextIds = nextSessions
            .map((session) => '$activePC:${session['id']}')
            .toSet();
        _pendingConsoleOpenings.removeWhere((key) => !nextIds.contains(key));
        _consoleStateEffectSequences.removeWhere(
          (key, _) => !nextIds.contains(key),
        );
        _consoleStateEffectKinds.removeWhere(
          (key, _) => !nextIds.contains(key),
        );
        _consoleOutputBurstSequences.removeWhere(
          (key, _) => !nextIds.contains(key),
        );
        _consoleOutputSequences.removeWhere((key, _) => !nextIds.contains(key));
        _consoleOutputLastPackets.removeWhere(
          (key, _) => !nextIds.contains(key),
        );
        _consoleOutputGenerations.removeWhere(
          (key, _) => !nextIds.contains(key),
        );
        _pendingConsoleOutputBaselines.removeWhere(
          (key) => !nextIds.contains(key),
        );
        state = nextState;
        if (_alertModeGeneration != generation &&
            (state['capabilities'] as List? ?? []).contains('alerts.direct')) {
          _alertModeGeneration = generation;
          unawaited(syncAlertMode().catchError((_) {}));
        }
        if (stayConnected) {
          final events = state['alerts'] as List?;
          if (events != null) {
            for (final event in events.whereType<Map>()) {
              final key = '$activePC:${event['id']}';
              if (_seenAlerts.add(key) &&
                  !_alertBaselinePending &&
                  !foreground) {
                unawaited(
                  background
                      .invokeMethod('notify', {
                        // One notification per console: a newer alert replaces its older one.
                        'key': '$activePC:${event['sessionId'] ?? event['id']}',
                        'title': event['title'],
                        'text': event['message'] is String ? event['message'] : '',
                      })
                      .catchError((_) {}),
                );
              }
            }
            _alertBaselinePending = false;
          } else {
            for (final s in sessions) {
              if (previous.containsKey(s['id']) &&
                  previous[s['id']] != s['state'] &&
                  ['ready', 'attention', 'error'].contains(s['state']) &&
                  !foreground) {
                unawaited(
                  background
                      .invokeMethod('notify', {
                        'key': '$activePC:${s['id']}',
                        'title': '${s['name']} is ${s['state']}',
                      })
                      .catchError((_) {}),
                );
              }
            }
          }
          while (_seenAlerts.length > 500) {
            _seenAlerts.remove(_seenAlerts.first);
          }
        }
        unawaited(rememberRoutes(state['connection']));
        final ids = sessions.map((s) => s['id']).toSet();
        screens.removeWhere((id, _) => !ids.contains(id));
        if (!sessions.any((s) => s['id'] == selected)) {
          selected = sessions.isEmpty ? '' : sessions.first['id'] as String;
          if (selected.isNotEmpty && streaming) subscribe().catchError((_) {});
        }
      } else if (data['type'] == 'terminal') {
        final id = data['id'] as String;
        if (!sessions.any((s) => s['id'] == id)) return;
        // xterm.dart does not implement RIS (ESC c). A checkpoint needs a
        // fresh parser and buffers, including modes and partial escape input.
        final view = data['reset'] == true
            ? (screens[id] = makeScreen(id))
            : screens.putIfAbsent(id, () => makeScreen(id));
        final now = DateTime.now(), key = '$activePC:$id';
        final previousGeneration = _consoleOutputGenerations[key];
        if (data['reset'] == true ||
            _pendingConsoleOutputBaselines.contains(key) ||
            previousGeneration != generation) {
          final reconnectBaseline =
              _pendingConsoleOutputBaselines.remove(key) ||
              (previousGeneration != null && previousGeneration != generation);
          _consoleOutputGenerations[key] = generation;
          if (reconnectBaseline && _consoleOutputLastPackets.containsKey(key)) {
            _consoleOutputLastPackets[key] = now;
          }
        } else {
          final previousPacket = _consoleOutputLastPackets[key];
          _consoleOutputSequences.update(
            key,
            (value) => value + 1,
            ifAbsent: () => 1,
          );
          if (previousPacket == null ||
              now.difference(previousPacket) >
                  const Duration(milliseconds: 900)) {
            _consoleOutputBurstSequences.update(
              key,
              (value) => value + 1,
              ifAbsent: () => 1,
            );
          }
          _consoleOutputGenerations[key] = generation;
          _consoleOutputLastPackets[key] = now;
        }
        view.receiving = true;
        try {
          view.cols = (data['cols'] as num).toInt();
          view.rows = (data['rows'] as num).toInt();
          if (view.terminal.viewWidth != view.cols ||
              view.terminal.viewHeight != view.rows) {
            view.terminal.resize(view.cols, view.rows);
          }
          view.terminal.write(data['data'] as String);
          view.sequence = (data['sequence'] as num).toInt();
          view.epoch = (data['epoch'] as num).toInt();
        } finally {
          view.receiving = false;
        }
      }
      notifyListeners();
    } catch (_) {
      status = 'The PC sent an unreadable update. Reconnecting…';
      socket?.close();
    }
  }

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
    final id = '${DateTime.now().microsecondsSinceEpoch}-${serial++}',
        completer = Completer<dynamic>();
    pending[id] = completer;
    final data = jsonEncode({'id': id, 'method': method, 'payload': payload});
    sent += utf8.encode(data).length;
    socket!.add(data);
    try {
      return await completer.future.timeout(const Duration(seconds: 20));
    } finally {
      pending.remove(id);
    }
  }

  bool get canEditPrompts =>
      (state['capabilities'] as List? ?? []).contains('prompts.edit');

  Future<void> refreshQueue() async {
    final pin = activePC, transportGeneration = generation;
    final snapshot = await request('state');
    if (!connected || activePC != pin || generation != transportGeneration) return;
    if (snapshot is! Map) return;
    state = {...state, 'queues': snapshot['queues'], 'prompts': snapshot['prompts']};
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
    await request('input', {'id': id ?? selected, 'data': value});
    inputError = '';
  }

  Future<void> submit(
    String text, {
    bool command = false,
    bool Function()? canContinue,
  }) async {
    final id = selected, connection = socket, current = generation;
    final targetPC = activePC;
    final targetSession = sessions.where((s) => s['id'] == id).firstOrNull;
    final targetProvider = targetSession?['provider'];
    final targetChat = targetSession?['providerSessionId'];
    if (id.isEmpty ||
        !connected ||
        !foreground ||
        canContinue?.call() == false) {
      throw StateError('Select a connected console first.');
    }
    if (text.trim().isEmpty) return;
    if (command && !RegExp(r'^/[a-z][a-z0-9 /_-]*$').hasMatch(text)) {
      throw StateError('Choose a supported agent command.');
    }
    final paste = !command && screens[id]?.terminal.bracketedPasteMode == true;
    final value = paste ? '\x1b[200~$text\x1b[201~' : text;
    if (value.length > 65536) throw StateError('This message is too long.');
    await input(value, id: id);
    // Keep Enter out of a CLI's paste burst. The acknowledgement confirms the
    // PC accepted the text, not that the terminal app has processed its input.
    await Future<void>.delayed(const Duration(milliseconds: 150));
    if (!connected ||
        !foreground ||
        canContinue?.call() == false ||
        current != generation ||
        activePC != targetPC ||
        sessions.where((s) => s['id'] == id).firstOrNull?['provider'] !=
            targetProvider ||
        sessions
                .where((s) => s['id'] == id)
                .firstOrNull?['providerSessionId'] !=
            targetChat ||
        !identical(connection, socket) ||
        selected != id) {
      throw StateError(
        'Message was typed but not submitted. Check the original console.',
      );
    }
    await input('\r', id: id);
  }

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
    socket?.pingInterval = Duration(seconds: value ? 15 : 60);
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
    if ((state['capabilities'] as List? ?? []).contains('alerts.direct')) {
      await request('alerts.mode', {'direct': stayConnected});
    }
    if (stayConnected) {
      await background.invokeMethod('status', {
        'name': '$pcName \u00b7 $status',
      });
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
      // Baseline unread IDs instead of comparing clocks on different devices.
      // Reconnects within this run still deliver unseen events.
      _alertBaselinePending = !connected;
      for (final event in (state['alerts'] as List? ?? []).whereType<Map>()) {
        _seenAlerts.add('$activePC:${event['id']}');
      }
    }
    stayConnected = value;
    await storage.write(key: 'stayConnected', value: '$value');
    if (!value && stopNative) await background.invokeMethod('stop');
    if (connected) await syncAlertMode();
    if (!value && !foreground) disconnectTransport();
    notifyListeners();
  }

  void disconnectTransport() {
    _pendingConsoleOpenings.clear();
    generation++;
    retry?.cancel();
    socket?.close();
    socket = null;
    transport?.close(force: true);
    connected = false;
    connecting = false;
    for (final c in pending.values) {
      if (!c.isCompleted) {
        c.completeError(
          StateError(
            'Connection paused. Check the console before sending again.',
          ),
        );
      }
    }
    pending.clear();
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
    socket?.close();
    transport?.close(force: true);
    drafts.removeListener(notifyListeners);
    drafts.dispose();
    super.dispose();
  }
}
