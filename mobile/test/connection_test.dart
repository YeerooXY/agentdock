import 'dart:convert';
import 'dart:io';

import 'package:agent_dock_mobile/dock_client.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

class OfflinePhone extends DockClient {
  int reconnects = 0;
  @override
  Future<void> reconnect() async {
    reconnects++;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test('compressed updates stop expanding at the frame limit', () {
    expect(
      DockClient.decodeFrame(gzip.encode(utf8.encode('{"type":"state"}'))),
      '{"type":"state"}',
    );
    final oversized = gzip.encode(List.filled(6 * 1024 * 1024, 32));
    expect(oversized.length, lessThan(10000));
    expect(() => DockClient.decodeFrame(oversized), throwsFormatException);
    expect(
      () => DockClient.decodeFrame(' ' * (6 * 1024 * 1024)),
      throwsFormatException,
    );
    expect(() => DockClient.decodeFrame([1, 2, 3]), throwsFormatException);
  });

  test(
    'address recovery preserves identity and learns routes without repairing',
    () async {
      final phone = OfflinePhone();
      addTearDown(phone.dispose);
      phone.pairing = {
        'url': 'https://8.8.8.8:47831',
        'localUrl': 'https://192.168.1.4:47831',
        'pin': 'original-pin',
        'token': 'private-token',
        'id': 'phone',
      };
      await phone.devices.put(phone.pairing!, activate: true);
      await phone.updateAddress('https://new-dock.duckdns.org:47831');
      expect(phone.reconnects, 1);
      expect(
        DockClient.endpoints(phone.pairing!).first,
        'https://new-dock.duckdns.org:47831',
      );
      await phone.rememberRoutes({
        'url': 'https://new-dock.duckdns.org:47831',
        'localUrl': 'https://192.168.1.5:47831',
        'pin': 'untrusted-replacement',
      });
      final saved = jsonDecode(
        (await DockClient.storage.read(key: 'devices.v1'))!,
      )['pcs'].first;
      expect(saved['pin'], 'original-pin');
      expect(saved['token'], 'private-token');
      expect(saved['id'], 'phone');
      expect(saved['localUrl'], 'https://192.168.1.5:47831');
      expect(saved['manualUrl'], isNull);
      for (final bad in [
        'http://new-dock.duckdns.org:47831',
        'https://user:pass@example.com:47831',
        'https://example.com:47831/path',
        'https://example.com:443',
        'https://example.com:47831?key=secret',
      ]) {
        await expectLater(phone.updateAddress(bad), throwsFormatException);
        await phone.rememberRoutes({'url': bad});
        expect(phone.pairing!['url'], saved['url']);
      }
      await phone.rememberRoutes({
        'url': 'https://example.com:47831',
        'localUrl': 'https://other.example:47831',
      });
      expect(phone.pairing!['url'], saved['url']);
    },
  );

  test(
    'manual recovery survives an older PC route until the PC is updated',
    () async {
      final phone = OfflinePhone();
      addTearDown(phone.dispose);
      phone.pairing = {
        'url': 'https://8.8.8.8:47831',
        'pin': 'pin',
        'token': 'token',
      };
      await phone.devices.put(phone.pairing!, activate: true);
      await phone.updateAddress('https://1.1.1.1:47831');
      await phone.rememberRoutes({
        'url': 'https://8.8.8.8:47831',
        'localUrl': 'https://192.168.1.4:47831',
      });
      expect(
        DockClient.endpoints(phone.pairing!).first,
        'https://1.1.1.1:47831',
      );
    },
  );

  test('connection failures identify private-only, changed IP, identity and revocation', () {
    expect(
      DockClient.connectionError(const SocketException('private detail'), {
        'url': 'https://192.168.1.4:47831',
      }),
      contains('private address'),
    );
    expect(
      DockClient.connectionError(const SocketException('private detail'), {
        'url': 'https://8.8.8.8:47831',
      }),
      contains('Home IP addresses can change'),
    );
    expect(
      DockClient.connectionError(const HandshakeException('secret'), {}),
      contains('identity'),
    );
    expect(
      DockClient.connectionError(const WebSocketException('secret', 401), {}),
      contains('access may have been removed'),
    );
    expect(
      DockClient.connectionError(const HandshakeException('secret'), {}),
      isNot(contains('secret')),
    );
  });

  test(
    'pinned TLS falls back to the working route and rejects a different PC',
    () async {
      final overrides = HttpOverrides.current;
      HttpOverrides.global = null;
      addTearDown(() => HttpOverrides.global = overrides);
      // Ephemeral local certificates only. No model or external network calls.
      final generated = await Process.run('node', [
        '-e',
        "require('selfsigned').generate([{name:'commonName',value:'Dock test'}],{keyType:'ec',curve:'P-256',notBeforeDate:new Date(Date.now()-60000)}).then(p=>{const c=require('node:crypto');process.stdout.write(JSON.stringify({cert:p.cert,key:p.private,pin:c.createHash('sha256').update(new c.X509Certificate(p.cert).raw).digest('hex')}))})",
      ], workingDirectory: '..');
      expect(generated.exitCode, 0, reason: '${generated.stderr}');
      final identity = jsonDecode(generated.stdout as String);
      final security = SecurityContext()
        ..useCertificateChainBytes(utf8.encode(identity['cert']))
        ..usePrivateKeyBytes(utf8.encode(identity['key']));
      final server = await HttpServer.bindSecure(
        InternetAddress.loopbackIPv4,
        0,
        security,
      );
      final sockets = <WebSocket>[];
      final authorizations = <String?>[];
      server.listen((req) async {
        authorizations.add(req.headers.value(HttpHeaders.authorizationHeader));
        sockets.add(await WebSocketTransformer.upgrade(req));
      });
      addTearDown(() async {
        for (final socket in sockets) {
          await socket.close();
        }
        await server.close(force: true);
      });
      final phone = DockClient();
      addTearDown(phone.dispose);
      final config = {
        'localUrl': 'https://127.0.0.1:1',
        'url': 'https://127.0.0.1:${server.port}',
        'pin': identity['pin'],
        'token': 'fixture-token',
      };
      final socket = await phone.openSocket(config, phone.generation);
      expect(socket.pingInterval, const Duration(seconds: 15));
      expect(authorizations, ['Bearer fixture-token']);
      await socket.close();
      phone.transport?.close(force: true);
      await expectLater(
        phone.openSocket({...config, 'pin': '0' * 64}, phone.generation),
        throwsA(isA<HandshakeException>()),
      );
      expect(
        authorizations.length,
        1,
        reason: 'No credential reaches an untrusted certificate',
      );
    },
  );
}
