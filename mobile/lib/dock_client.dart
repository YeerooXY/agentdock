import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:xterm/xterm.dart';

import 'pairing_request.dart';

class ConsoleScreen {
  final Terminal terminal = Terminal(maxLines: 1000);
  int sequence = -1, epoch = 0, cols = 110, rows = 30;
  bool receiving = false;
}

class DockClient extends ChangeNotifier {
  static const storage = FlutterSecureStorage();
  static const nativePush = MethodChannel('agentdock/push');
  Map<String, dynamic>? pairing;
  Map<String, dynamic> state = {'sessions': <dynamic>[], 'unreadResults': 0};
  final Map<String, ConsoleScreen> screens = {};
  final Map<String, Completer<dynamic>> pending = {};
  WebSocket? socket;
  HttpClient? transport;
  PairingRequest? _pairingRequest;
  Future<void> _pairingWrite = Future<void>.value();
  String pairingCode = '';
  bool _disposed = false;
  Timer? retry;
  StreamSubscription<String>? tokenRefresh;
  bool connected = false,
      connecting = false,
      foreground = true,
      streaming = true,
      dataSaver = true;
  String selected = '',
      status = 'Pair your PC to begin.',
      inputError = '',
      alerts = 'Not enabled';
  int received = 0, sent = 0, attempts = 0, serial = 0, generation = 0;
  List<Map<String, dynamic>> get sessions =>
      (state['sessions'] as List? ?? []).cast<Map<String, dynamic>>();
  ConsoleScreen? get screen => screens[selected];

  Future<void> restore() async {
    try {
      final raw = await storage.read(key: 'pc');
      if (raw != null) pairing = jsonDecode(raw) as Map<String, dynamic>;
      dataSaver = await storage.read(key: 'dataSaver') != 'false';
      if (pairing != null) await connect();
    } catch (_) {
      status = 'Saved connection could not be opened. Pair this PC again.';
      notifyListeners();
    }
  }

  static Map<String, dynamic> parseInvite(String code, {DateTime? now}) {
    if (!code.trim().startsWith('agentdock:') || code.length > 4000) {
      throw const FormatException(
        'Use a pairing code from Agent Dock on your PC.',
      );
    }
    final invite = jsonDecode(
      utf8.decode(
        base64Url.decode(base64Url.normalize(code.trim().substring(10))),
      ),
    ) as Map<String, dynamic>;
    final uri = Uri.parse(invite['url'] as String);
    final internet = invite['v'] == 2 && invite['mode'] == 'internet';
    if ((!internet && invite['v'] != 1) ||
        !validEndpoint(uri, internet: internet) ||
        (invite.containsKey('localUrl') &&
            (!internet ||
                !validEndpoint(Uri.parse(invite['localUrl'] as String)))) ||
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

  static List<String> endpoints(Map<String, dynamic> config) => {
    if (config['manualUrl'] is String) config['manualUrl'] as String,
    if (config['localUrl'] is String) config['localUrl'] as String,
    config['url'] as String,
  }.toList();

  static String connectionError(Object error, Map<String, dynamic> config) {
    if (error is HandshakeException) {
      return 'The server identity could not be verified. Check the address and phone clock. Pair again on your PC if its identity changed.';
    }
    if (error is WebSocketException && error.httpStatusCode == 401) {
      return 'This phone was not accepted. Its access may have been removed. Pair it again on your PC.';
    }
    final url = config['manualUrl'] ?? config['url'];
    final uri = url is String ? Uri.tryParse(url) : null;
    if (uri != null && validEndpoint(uri, internet: true)) {
      return 'PC unreachable. Check its internet address, router forwarding and that Dock is running. Home IP addresses can change.';
    }
    return 'PC unreachable. This pairing uses a private address. Use the same Wi-Fi or configure direct internet in PC Phone setup.';
  }

  Future<void> updateAddress(String value) async {
    final url = value.trim();
    final uri = Uri.tryParse(url);
    if (uri == null ||
        !(validEndpoint(uri) || validEndpoint(uri, internet: true))) {
      throw const FormatException(
        'Use an HTTPS address with a port from 1024 to 65535, without a path or password.',
      );
    }
    final previous = pairing;
    if (previous == null) throw StateError('Pair your PC first.');
    final saved = {...previous, 'manualUrl': url};
    // Only the address changes. The original certificate pin and device token
    // stay in place, so an unrelated server cannot receive credentials.
    await savePairing(saved);
    if (!identical(pairing, previous) || _disposed) return;
    pairing = saved;
    await reconnect();
  }

  Future<void> rememberRoutes(dynamic routes) async {
    final previous = pairing;
    if (previous == null || routes is! Map) return;
    final url = routes['url'], localUrl = routes['localUrl'];
    if (url is! String) return;
    final uri = Uri.tryParse(url);
    if (uri == null ||
        !(validEndpoint(uri) || validEndpoint(uri, internet: true))) {
      return;
    }
    if (localUrl != null &&
        (localUrl is! String ||
            !validEndpoint(Uri.tryParse(localUrl) ?? Uri()))) {
      return;
    }
    if (url == previous['url'] && localUrl == previous['localUrl']) return;
    final saved = {...previous, 'url': url}..remove('localUrl');
    if (localUrl != null) saved['localUrl'] = localUrl;
    if (saved['manualUrl'] == url) saved.remove('manualUrl');
    // Called only for state received through the authenticated pinned socket.
    pairing = saved;
    try {
      await savePairing(saved);
    } catch (_) {
      if (identical(pairing, saved)) pairing = previous;
    }
  }

  Future<void> savePairing(Map<String, dynamic>? value) {
    final json = value == null ? null : jsonEncode(value);
    final write = _pairingWrite
        .catchError((_) {})
        .then(
          (_) => json == null
              ? storage.delete(key: 'pc')
              : storage.write(key: 'pc', value: json),
        );
    _pairingWrite = write;
    return write;
  }

  Future<void> reconnect() async {
    if (pairing == null || !foreground) return;
    setForeground(false);
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
    });
    _pairingRequest = operation;
    try {
      final result = await operation.run((code) {
        pairingCode = code;
        if (!_disposed) notifyListeners();
      });
      operation.checkCancelled();
      final saved = {
        'url': invite['url'],
        if (invite['localUrl'] != null) 'localUrl': invite['localUrl'],
        'pin': invite['pin'],
        'token': result['token'],
        'id': result['id'],
        'name': result['name'],
      };
      await savePairing(saved);
      if (operation.cancelled || _disposed) {
        await savePairing(null);
        throw const FormatException('Pairing canceled.');
      }
      pairing = saved;
      _pairingRequest = null;
      pairingCode = '';
      await connect();
    } catch (_) {
      if (pairing == null) await operation.cancel();
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
      if (!foreground || current != generation) {
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
        if (current != generation || !foreground) {
          await ws.close();
          client.close(force: true);
          throw StateError('Connection paused.');
        }
        // Detect a dead Wi-Fi/mobile route even when no terminal data is sent.
        ws.pingInterval = const Duration(seconds: 15);
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
    if (pairing == null || !foreground || connecting || connected) return;
    connecting = true;
    final current = ++generation;
    status = 'Connecting…';
    notifyListeners();
    retry?.cancel();
    try {
      final ws = await openSocket(pairing!, current);
      if (current != generation || !foreground) {
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
      refreshAlerts().catchError((_) {});
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
    status = foreground
        ? reason ?? 'Connection lost. Reconnecting to your PC…'
        : 'Paused';
    if (foreground && pairing != null) {
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
      final String text = raw is String
          ? raw
          : utf8.decode(gzip.decode(raw as List<int>));
      if (text.length > 5 * 1024 * 1024) {
        throw const FormatException('Frame too large');
      }
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
        state = data['state'] as Map<String, dynamic>;
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
    view.terminal.onOutput = (text) {
      if (!view.receiving) {
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

  Future<void> subscribe() async {
    if (!connected) return;
    final view = screens.putIfAbsent(selected, () => makeScreen(selected));
    await request('subscribe', {
      'id': streaming ? selected : '',
      'sequence': view.sequence,
      'epoch': view.epoch,
      'saver': dataSaver,
    });
  }

  Future<void> select(String id) async {
    selected = id;
    inputError = '';
    await subscribe();
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

  Future<void> submit(String text) async {
    final id = selected, connection = socket, current = generation;
    if (id.isEmpty || !connected || !foreground) {
      throw StateError('Select a connected console first.');
    }
    if (text.trim().isEmpty) return;
    final paste = screens[id]?.terminal.bracketedPasteMode == true;
    final value = paste ? '\x1b[200~$text\x1b[201~' : text;
    if (value.length > 65536) throw StateError('This message is too long.');
    await input(value, id: id);
    // Keep Enter out of a CLI's paste burst. The acknowledgement confirms the
    // PC accepted the text, not that the terminal app has processed its input.
    await Future<void>.delayed(const Duration(milliseconds: 150));
    if (!connected ||
        !foreground ||
        current != generation ||
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
    if (value) {
      connect();
    } else {
      unawaited(cancelPairing());
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
      status = 'Paused';
      notifyListeners();
    }
  }

  Future<void> enableAlerts() async {
    final options = await request('push.config');
    if (options == null) {
      throw StateError(
        'Import your Firebase files in PC setup → Alerts first.',
      );
    }
    for (final app in Firebase.apps) {
      if (app.options.projectId != options['projectId']) await app.delete();
    }
    await nativePush.invokeMethod('configure', options);
    await Firebase.initializeApp();
    final permission = await FirebaseMessaging.instance.requestPermission();
    if (permission.authorizationStatus != AuthorizationStatus.authorized) {
      throw StateError(
        'Allow notifications in Android settings, then try again.',
      );
    }
    await FirebaseMessaging.instance.setAutoInitEnabled(true);
    // HTTP v1 direct-send currently accepts registration tokens, not FIDs.
    // ignore: deprecated_member_use
    final token = await FirebaseMessaging.instance.getToken();
    if (token == null) {
      throw StateError(
        'Google Play services could not register this phone. Try again.',
      );
    }
    await request('push.register', {'token': token});
    await storage.write(key: 'alerts', value: 'true');
    await tokenRefresh?.cancel();
    // ignore: deprecated_member_use
    tokenRefresh = FirebaseMessaging.instance.onTokenRefresh.listen((value) {
      if (connected) {
        request('push.register', {'token': value}).catchError((_) => null);
      }
    });
    alerts = 'Enabled';
    notifyListeners();
  }

  Future<void> refreshAlerts() async {
    if (await storage.read(key: 'alerts') != 'true') return;
    await Firebase.initializeApp();
    // Refresh a token that changed while the private connection was asleep.
    // ignore: deprecated_member_use
    final token = await FirebaseMessaging.instance.getToken();
    if (token != null && connected) {
      await request('push.register', {'token': token});
    }
    alerts = 'Enabled';
    notifyListeners();
  }

  Future<void> forget() async {
    if (connected) {
      try {
        await request('push.register', {'token': ''});
      } catch (_) {}
    }
    await tokenRefresh?.cancel();
    try {
      if (Firebase.apps.isNotEmpty) {
        // ignore: deprecated_member_use
        await FirebaseMessaging.instance.deleteToken();
        await FirebaseMessaging.instance.setAutoInitEnabled(false);
        await Firebase.app().delete();
      }
      await nativePush.invokeMethod('clear');
    } catch (_) {}
    await storage.delete(key: 'alerts');
    pairing = null;
    setForeground(false);
    foreground = true;
    await savePairing(null);
    screens.clear();
    selected = '';
    state = {'sessions': <dynamic>[], 'unreadResults': 0};
    status = 'Pair your PC to begin.';
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    unawaited(cancelPairing());
    foreground = false;
    generation++;
    retry?.cancel();
    socket?.close();
    transport?.close(force: true);
    tokenRefresh?.cancel();
    super.dispose();
  }
}
