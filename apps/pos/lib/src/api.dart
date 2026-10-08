import 'dart:convert';

import 'package:http/http.dart' as http;

class ApiException implements Exception {
  ApiException(this.status, this.message);

  final int status;
  final String message;

  @override
  String toString() => 'ApiException($status): $message';
}

class PairResult {
  PairResult({required this.deviceId, required this.branchId, required this.hubPriority, required this.token});

  final String deviceId;
  final String branchId;
  final int hubPriority;
  final String token;
}

/// A menu download: `json` is null when the server says the cached copy is current (304).
class MenuDownload {
  MenuDownload({this.json, this.etag});

  final Map<String, dynamic>? json;
  final String? etag;
}

/// What the POS needs from the cloud API (services/api). Faked in tests.
abstract class PosApi {
  Future<PairResult> pair({required String code, required String name, required String kind});
  Future<MenuDownload> fetchMenu(String token, {String? etag});
  Future<Map<String, dynamic>> fetchRoster(String token);
}

class HttpPosApi implements PosApi {
  HttpPosApi(this.baseUrl, {http.Client? client}) : _client = client ?? http.Client();

  final Uri baseUrl;
  final http.Client _client;

  Uri _url(String path) => baseUrl.resolve(path);

  Map<String, String> _auth(String token) => {'authorization': 'Bearer $token'};

  Never _fail(http.Response res) {
    var message = res.reasonPhrase ?? 'HTTP ${res.statusCode}';
    try {
      message = (jsonDecode(res.body) as Map<String, dynamic>)['error'] as String? ?? message;
    } catch (_) {}
    throw ApiException(res.statusCode, message);
  }

  @override
  Future<PairResult> pair({required String code, required String name, required String kind}) async {
    final res = await _client.post(
      _url('/v1/devices/pair'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'code': code, 'name': name, 'kind': kind}),
    );
    if (res.statusCode != 201) _fail(res);
    final j = jsonDecode(res.body) as Map<String, dynamic>;
    final device = j['device'] as Map<String, dynamic>;
    return PairResult(
      deviceId: device['id'] as String,
      branchId: device['branchId'] as String,
      hubPriority: device['hubPriority'] as int,
      token: j['token'] as String,
    );
  }

  @override
  Future<MenuDownload> fetchMenu(String token, {String? etag}) async {
    final res = await _client.get(_url('/v1/devices/me/menu'), headers: {..._auth(token), 'if-none-match': ?etag});
    if (res.statusCode == 304) return MenuDownload(etag: etag);
    if (res.statusCode != 200) _fail(res);
    return MenuDownload(json: jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>, etag: res.headers['etag']);
  }

  @override
  Future<Map<String, dynamic>> fetchRoster(String token) async {
    final res = await _client.get(_url('/v1/devices/me/roster'), headers: _auth(token));
    if (res.statusCode != 200) _fail(res);
    return jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
  }
}
