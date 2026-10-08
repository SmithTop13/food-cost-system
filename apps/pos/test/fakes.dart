import 'package:fcs_pos/src/api.dart';

import 'node_pin_hashes.dart';

/// A full-service Thai restaurant: 10% service charge on dine-in, VAT added on top.
Map<String, dynamic> sampleMenuJson({int version = 3}) => {
  'version': version,
  'branchId': 'branch-1',
  'branchName': 'บ้านกะเพรา อารีย์',
  'pricing': {
    'priceMode': 'VAT_EXCLUDED',
    'vatRate': 700,
    'serviceChargeRate': 1000,
    'serviceChargeOrderTypes': ['DINE_IN'],
    'rounding': {'increment': 25, 'mode': 'NEAREST'},
  },
  'categories': [
    {'id': 'cat-mains', 'nameTh': 'อาหารจานเดียว', 'nameEn': 'Single dishes', 'sort': 0},
    {'id': 'cat-drinks', 'nameTh': 'เครื่องดื่ม', 'nameEn': 'Drinks', 'sort': 1},
  ],
  'items': [
    {
      'id': 'kaphrao',
      'categoryId': 'cat-mains',
      'nameTh': 'ผัดกะเพราหมูสับ',
      'nameEn': 'Minced pork kaphrao',
      'price': 6000,
      'available': true,
      'stationId': null,
      'serviceChargeExempt': false,
      'modifierGroupIds': ['spice', 'extras'],
    },
    {
      'id': 'friedrice',
      'categoryId': 'cat-mains',
      'nameTh': 'ข้าวผัดกุ้ง',
      'nameEn': 'Shrimp fried rice',
      'price': 8500,
      'available': true,
      'stationId': null,
      'serviceChargeExempt': false,
      'modifierGroupIds': [],
    },
    {
      'id': 'padseeew',
      'categoryId': 'cat-mains',
      'nameTh': 'ผัดซีอิ๊วไก่',
      'nameEn': 'Chicken pad see ew',
      'price': 6500,
      'available': false,
      'stationId': null,
      'serviceChargeExempt': false,
      'modifierGroupIds': [],
    },
    {
      'id': 'thaitea',
      'categoryId': 'cat-drinks',
      'nameTh': 'ชาไทยเย็น',
      'nameEn': 'Thai iced tea',
      'price': 4500,
      'available': true,
      'stationId': null,
      'serviceChargeExempt': false,
      'modifierGroupIds': [],
    },
    {
      'id': 'water',
      'categoryId': 'cat-drinks',
      'nameTh': 'น้ำเปล่า',
      'nameEn': 'Water',
      'price': 1500,
      'available': true,
      'stationId': null,
      'serviceChargeExempt': true,
      'modifierGroupIds': [],
    },
  ],
  'modifierGroups': [
    {
      'id': 'spice',
      'nameTh': 'ระดับความเผ็ด',
      'nameEn': 'Spice level',
      'minChoices': 1,
      'maxChoices': 1,
      'options': [
        {'id': 'mild', 'nameTh': 'ไม่เผ็ด', 'nameEn': 'Mild', 'price': 0},
        {'id': 'hot', 'nameTh': 'เผ็ดมาก', 'nameEn': 'Thai hot', 'price': 0},
      ],
    },
    {
      'id': 'extras',
      'nameTh': 'เพิ่ม',
      'nameEn': 'Extras',
      'minChoices': 0,
      'maxChoices': 2,
      'options': [
        {'id': 'egg', 'nameTh': 'ไข่ดาว', 'nameEn': 'Fried egg', 'price': 1000},
        {'id': 'omelette', 'nameTh': 'ไข่เจียว', 'nameEn': 'Omelette', 'price': 1500},
        {'id': 'rice', 'nameTh': 'ข้าวเพิ่ม', 'nameEn': 'Extra rice', 'price': 1000},
      ],
    },
  ],
};

Map<String, dynamic> sampleRosterJson() => {
  'branchId': 'branch-1',
  'deviceId': 'device-1',
  'staff': [
    {'id': 'staff-nok', 'name': 'น้อย', 'role': 'WAITER', 'pinHash': nodePinHashes[0].hash}, // PIN 4821
    {'id': 'staff-dang', 'name': 'แดง', 'role': 'CASHIER', 'pinHash': nodePinHashes[1].hash}, // PIN 000000
  ],
  'permissions': {
    'WAITER': {'TAKE_ORDERS': 'ALLOW', 'TAKE_PAYMENT': 'DENY'},
    'CASHIER': {'TAKE_ORDERS': 'ALLOW', 'TAKE_PAYMENT': 'ALLOW'},
  },
};

class FakePosApi implements PosApi {
  FakePosApi({this.validCode = 'K7QM-3XRP'});

  final String validCode;
  bool online = true;
  bool revoked = false;
  int menuDownloads = 0;
  Map<String, dynamic> menu = sampleMenuJson();
  String get etag => '"menu-${menu['version']}"';

  void _check() {
    if (!online) throw Exception('network unreachable');
    if (revoked) throw ApiException(401, 'paired device required');
  }

  @override
  Future<PairResult> pair({required String code, required String name, required String kind}) async {
    if (!online) throw Exception('network unreachable');
    if (code.replaceAll('-', '').toUpperCase() != validCode.replaceAll('-', '')) {
      throw ApiException(400, 'pairing code is wrong, used or expired');
    }
    return PairResult(deviceId: 'device-1', branchId: 'branch-1', hubPriority: 0, token: 'token-1');
  }

  @override
  Future<MenuDownload> fetchMenu(String token, {String? etag}) async {
    _check();
    if (etag == this.etag) return MenuDownload(etag: etag);
    menuDownloads++;
    return MenuDownload(json: menu, etag: this.etag);
  }

  @override
  Future<Map<String, dynamic>> fetchRoster(String token) async {
    _check();
    return sampleRosterJson();
  }
}
