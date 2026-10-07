enum Lang { th, en }

/// UI text. Thai first; the POS defaults to Thai.
class Strings {
  const Strings._(this._map);

  final Map<String, String> _map;
  String operator [](String key) => _map[key] ?? key;

  static Strings of(Lang lang) => lang == Lang.th ? th : en;

  static const en = Strings._({
    'pairTitle': 'Pair this device',
    'pairHelp': 'On the owner dashboard, open Devices and create a pairing code. Enter it here.',
    'pairingCode': 'Pairing code',
    'deviceName': 'Device name',
    'deviceKind': 'Device type',
    'pair': 'Pair',
    'whoIsWorking': 'Who is working?',
    'enterPin': 'Enter your PIN',
    'wrongPin': 'Wrong PIN',
    'checking': 'Checking…',
    'noStaff': 'No staff yet. Add staff on the owner dashboard.',
    'all': 'All',
    'soldOut': 'Sold out',
    'order': 'Order',
    'dineIn': 'Dine-in',
    'takeaway': 'Takeaway',
    'delivery': 'Delivery',
    'table': 'Table',
    'emptyOrder': 'Tap a dish to add it',
    'subtotal': 'Subtotal',
    'serviceCharge': 'Service charge',
    'vat': 'VAT 7%',
    'vatIncluded': 'incl. VAT',
    'rounding': 'Rounding',
    'total': 'Total',
    'send': 'Send to kitchen',
    'sent': 'Order sent',
    'note': 'Note',
    'add': 'Add',
    'cancel': 'Cancel',
    'required': 'Required',
    'chooseUpTo': 'Choose up to',
    'chooseExactly': 'Choose',
    'chooseAtLeast': 'Choose at least',
    'signOut': 'Sign out',
    'offline': 'Offline: using the saved menu',
    'viewOrder': 'View order',
    'waitingToSync': 'waiting to sync',
    'role.owner': 'Owner',
    'role.manager': 'Manager',
    'role.cashier': 'Cashier',
    'role.waiter': 'Waiter',
    'role.kitchen': 'Kitchen',
  });

  static const th = Strings._({
    'pairTitle': 'เชื่อมต่ออุปกรณ์นี้',
    'pairHelp': 'ในแดชบอร์ดเจ้าของร้าน เปิดหน้าอุปกรณ์ แล้วสร้างรหัสเชื่อมต่อ จากนั้นใส่รหัสที่นี่',
    'pairingCode': 'รหัสเชื่อมต่อ',
    'deviceName': 'ชื่ออุปกรณ์',
    'deviceKind': 'ประเภทอุปกรณ์',
    'pair': 'เชื่อมต่อ',
    'whoIsWorking': 'ใครเข้ากะ?',
    'enterPin': 'ใส่ PIN ของคุณ',
    'wrongPin': 'PIN ไม่ถูกต้อง',
    'checking': 'กำลังตรวจสอบ…',
    'noStaff': 'ยังไม่มีพนักงาน เพิ่มพนักงานในแดชบอร์ดเจ้าของร้าน',
    'all': 'ทั้งหมด',
    'soldOut': 'หมด',
    'order': 'ออเดอร์',
    'dineIn': 'ทานที่ร้าน',
    'takeaway': 'กลับบ้าน',
    'delivery': 'เดลิเวอรี',
    'table': 'โต๊ะ',
    'emptyOrder': 'แตะเมนูเพื่อเพิ่ม',
    'subtotal': 'รวม',
    'serviceCharge': 'ค่าบริการ',
    'vat': 'VAT 7%',
    'vatIncluded': 'รวม VAT',
    'rounding': 'ปัดเศษ',
    'total': 'ยอดสุทธิ',
    'send': 'ส่งเข้าครัว',
    'sent': 'ส่งออเดอร์แล้ว',
    'note': 'หมายเหตุ',
    'add': 'เพิ่ม',
    'cancel': 'ยกเลิก',
    'required': 'ต้องเลือก',
    'chooseUpTo': 'เลือกได้สูงสุด',
    'chooseExactly': 'เลือก',
    'chooseAtLeast': 'เลือกอย่างน้อย',
    'signOut': 'ออกจากระบบ',
    'offline': 'ออฟไลน์: ใช้เมนูที่บันทึกไว้',
    'viewOrder': 'ดูออเดอร์',
    'waitingToSync': 'รอซิงก์',
    'role.owner': 'เจ้าของ',
    'role.manager': 'ผู้จัดการ',
    'role.cashier': 'แคชเชียร์',
    'role.waiter': 'พนักงานเสิร์ฟ',
    'role.kitchen': 'ครัว',
  });
}

/// Satang → "1,234.50".
String formatBaht(int satang) {
  final negative = satang < 0;
  final abs = satang.abs();
  final baht = (abs ~/ 100).toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  final s = '$baht.${(abs % 100).toString().padLeft(2, '0')}';
  return negative ? '-$s' : s;
}
