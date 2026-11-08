import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';

/// Which PC addresses the phone may contact, and how it verifies them.
/// Paddock connects only through Tailscale, to a certificate pinned at pairing.
abstract final class EndpointPolicy {
  /// Lets tests reach a loopback server in place of a Tailscale address.
  static bool loopbackForTests = false;

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
    // Codes from a PC still set up for Wi-Fi or direct internet are refused
    // with the way forward.
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

  static Duration routeTimeout(Map<String, dynamic> config, String url) =>
      Duration(seconds: config['localUrl'] == url ? 2 : 12);

  /// An HTTP client that trusts only the pinned certificate for
  /// `config['url']`. No system roots are trusted.
  static HttpClient pinned(Map<String, dynamic> config) {
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
}
