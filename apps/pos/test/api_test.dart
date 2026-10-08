import 'dart:convert';

import 'package:fcs_pos/src/api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fakes.dart';

void main() {
  final base = Uri.parse('https://api.example.com');

  test('pairs and returns the device token', () async {
    late http.Request sent;
    final api = HttpPosApi(
      base,
      client: MockClient((req) async {
        sent = req;
        return http.Response(
          jsonEncode({
            'device': {'id': 'd1', 'branchId': 'b1', 'hubPriority': 2},
            'token': 'tok',
          }),
          201,
        );
      }),
    );
    final r = await api.pair(code: 'K7QM-3XRP', name: 'POS 1', kind: 'POS');
    expect(sent.url.toString(), 'https://api.example.com/v1/devices/pair');
    expect(jsonDecode(sent.body), {'code': 'K7QM-3XRP', 'name': 'POS 1', 'kind': 'POS'});
    expect([r.deviceId, r.branchId, r.hubPriority, r.token], ['d1', 'b1', 2, 'tok']);
  });

  test('reports the server\'s message on failure', () async {
    final api = HttpPosApi(base, client: MockClient((_) async => http.Response('{"error":"pairing code is wrong, used or expired"}', 400)));
    expect(
      () => api.pair(code: 'x', name: 'y', kind: 'POS'),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'pairing code is wrong, used or expired')),
    );
  });

  test('downloads the menu with the token, and skips it when unchanged (304)', () async {
    final seen = <Map<String, String>>[];
    final api = HttpPosApi(
      base,
      client: MockClient((req) async {
        seen.add(req.headers);
        if (req.headers['if-none-match'] == '"menu-3"') return http.Response('', 304);
        return http.Response.bytes(utf8.encode(jsonEncode(sampleMenuJson())), 200, headers: {'etag': '"menu-3"'});
      }),
    );
    final first = await api.fetchMenu('tok');
    expect(first.etag, '"menu-3"');
    expect((first.json!['items'] as List).first['nameTh'], 'ผัดกะเพราหมูสับ'); // Thai survives decoding
    final second = await api.fetchMenu('tok', etag: first.etag);
    expect(second.json, isNull);
    expect(seen.first['authorization'], 'Bearer tok');
    expect(seen.first.containsKey('if-none-match'), isFalse);
  });
}
