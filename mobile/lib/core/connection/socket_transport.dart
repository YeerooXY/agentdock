import 'dart:convert';
import 'dart:io';

import 'endpoint_policy.dart';

/// Owns the pinned HTTP client and the event socket to one PC.
///
/// It opens and closes the socket and writes text frames. Connection state,
/// generations and retry timing stay with the caller, which decides whether a
/// result is still wanted.
class SocketTransport {
  WebSocket? _socket;
  HttpClient? _http;

  /// Whether the open socket speaks state protocol 2 (/v2/events).
  bool v2 = false;

  /// PCs that answered 404 on /v2/events. Cleared on a manual reconnect, or
  /// when the PC later reports protocol 2.
  final Set<String> _v2Refused = {};

  WebSocket? get socket => _socket;
  HttpClient? get http => _http;

  /// Tries each saved route in turn. [wanted] is checked before each attempt
  /// and after a socket opens; a stale attempt closes what it opened.
  Future<WebSocket> open(
    Map<String, dynamic> config, {
    required bool Function() wanted,
    required bool Function() foreground,
  }) async {
    Object? failure;
    Object? manualFailure;
    for (final endpoint in EndpointPolicy.endpoints(config)) {
      if (!wanted()) throw StateError('Connection paused.');
      final client = EndpointPolicy.pinned({...config, 'url': endpoint});
      _http = client;
      final pin = config['pin'] as String? ?? '';
      Future<WebSocket> connect(String route) => WebSocket.connect(
        Uri.parse('$endpoint$route').replace(scheme: 'wss').toString(),
        headers: {HttpHeaders.authorizationHeader: 'Bearer ${config['token']}'},
        customClient: client,
        compression: CompressionOptions.compressionOff,
      ).timeout(EndpointPolicy.routeTimeout(config, endpoint));
      try {
        WebSocket ws;
        var useV2 = !_v2Refused.contains(pin);
        if (useV2) {
          try {
            ws = await connect('/v2/events');
          } on WebSocketException catch (error) {
            // Older PCs, or protocol 2 turned off: the authenticated phone gets 404.
            if (error.httpStatusCode != 404) rethrow;
            _v2Refused.add(pin);
            useV2 = false;
            ws = await connect('/v1/events');
          }
        } else {
          ws = await connect('/v1/events');
        }
        if (!wanted()) {
          await ws.close();
          client.close(force: true);
          throw StateError('Connection paused.');
        }
        v2 = useV2;
        // Detect a dead Wi-Fi/mobile route even when no terminal data is sent.
        ws.pingInterval = Duration(seconds: foreground() ? 15 : 60);
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

  /// Makes [ws] the current socket after the caller accepted it.
  void adopt(WebSocket ws) => _socket = ws;

  /// Writes one text frame. Returns the bytes written, or null with no socket.
  int? send(String data) {
    final ws = _socket;
    if (ws == null) return null;
    ws.add(data);
    return utf8.encode(data).length;
  }

  void setForeground(bool foreground) {
    _socket?.pingInterval = Duration(seconds: foreground ? 15 : 60);
  }

  /// Closes the socket; its done handler reports the loss.
  void dropSocket() {
    _socket?.close();
  }

  void forgetV2Refusals() => _v2Refused.clear();

  /// The PC turned protocol 2 on: use it on the next connection.
  void allowV2(String pin) => _v2Refused.remove(pin);

  /// Closes everything. Late events from the old socket must be ignored by
  /// the caller's generation check.
  void close() {
    _socket?.close();
    _socket = null;
    v2 = false;
    _http?.close(force: true);
  }
}
