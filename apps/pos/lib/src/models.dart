import 'package:fcs_pricing/fcs_pricing.dart';

import 'i18n.dart';

/// Thai name always; English optional. Shown in the app's current language.
mixin Named {
  String get nameTh;
  String? get nameEn;
  String name(Lang lang) => lang == Lang.en && (nameEn?.isNotEmpty ?? false) ? nameEn! : nameTh;
}

class MenuCategory with Named {
  MenuCategory({required this.id, required this.nameTh, this.nameEn, required this.sort});

  factory MenuCategory.fromJson(Map<String, dynamic> j) =>
      MenuCategory(id: j['id'] as String, nameTh: j['nameTh'] as String, nameEn: j['nameEn'] as String?, sort: (j['sort'] as int?) ?? 0);

  final String id;
  @override
  final String nameTh;
  @override
  final String? nameEn;
  final int sort;
}

class ModifierOption with Named {
  ModifierOption({required this.id, required this.nameTh, this.nameEn, required this.price});

  factory ModifierOption.fromJson(Map<String, dynamic> j) =>
      ModifierOption(id: j['id'] as String, nameTh: j['nameTh'] as String, nameEn: j['nameEn'] as String?, price: j['price'] as int);

  final String id;
  @override
  final String nameTh;
  @override
  final String? nameEn;

  /// Satang added per unit.
  final int price;
}

class ModifierGroup with Named {
  ModifierGroup({
    required this.id,
    required this.nameTh,
    this.nameEn,
    required this.minChoices,
    required this.maxChoices,
    required this.options,
  });

  factory ModifierGroup.fromJson(Map<String, dynamic> j) => ModifierGroup(
    id: j['id'] as String,
    nameTh: j['nameTh'] as String,
    nameEn: j['nameEn'] as String?,
    minChoices: j['minChoices'] as int,
    maxChoices: j['maxChoices'] as int,
    options: [for (final o in (j['options'] as List<dynamic>)) ModifierOption.fromJson(o as Map<String, dynamic>)],
  );

  final String id;
  @override
  final String nameTh;
  @override
  final String? nameEn;
  final int minChoices;
  final int maxChoices;
  final List<ModifierOption> options;

  bool get required => minChoices > 0;
}

class MenuItem with Named {
  MenuItem({
    required this.id,
    this.categoryId,
    required this.nameTh,
    this.nameEn,
    required this.price,
    required this.available,
    this.stationId,
    required this.serviceChargeExempt,
    required this.modifierGroupIds,
  });

  factory MenuItem.fromJson(Map<String, dynamic> j) => MenuItem(
    id: j['id'] as String,
    categoryId: j['categoryId'] as String?,
    nameTh: j['nameTh'] as String,
    nameEn: j['nameEn'] as String?,
    price: j['price'] as int,
    available: (j['available'] as bool?) ?? true,
    stationId: j['stationId'] as String?,
    serviceChargeExempt: (j['serviceChargeExempt'] as bool?) ?? false,
    modifierGroupIds: (j['modifierGroupIds'] as List<dynamic>? ?? const []).cast<String>(),
  );

  final String id;
  final String? categoryId;
  @override
  final String nameTh;
  @override
  final String? nameEn;

  /// This branch's price in satang.
  final int price;

  /// False when sold out (86) at this branch.
  final bool available;
  final String? stationId;
  final bool serviceChargeExempt;
  final List<String> modifierGroupIds;
}

/// The branch menu as downloaded from GET /v1/devices/me/menu.
class BranchMenu {
  BranchMenu({
    required this.version,
    required this.branchId,
    required this.branchName,
    required this.pricing,
    required this.categories,
    required this.items,
    required this.modifierGroups,
  });

  factory BranchMenu.fromJson(Map<String, dynamic> j) {
    final categories = [for (final c in j['categories'] as List<dynamic>) MenuCategory.fromJson(c as Map<String, dynamic>)]
      ..sort((a, b) => a.sort.compareTo(b.sort));
    return BranchMenu(
      version: j['version'] as int,
      branchId: j['branchId'] as String,
      branchName: (j['branchName'] as String?) ?? '',
      pricing: parsePricing(j['pricing'] as Map<String, dynamic>),
      categories: categories,
      items: [for (final i in j['items'] as List<dynamic>) MenuItem.fromJson(i as Map<String, dynamic>)],
      modifierGroups: {
        for (final g in j['modifierGroups'] as List<dynamic>) (g as Map<String, dynamic>)['id'] as String: ModifierGroup.fromJson(g),
      },
    );
  }

  final int version;
  final String branchId;
  final String branchName;
  final PricingSettings pricing;
  final List<MenuCategory> categories;
  final List<MenuItem> items;
  final Map<String, ModifierGroup> modifierGroups;

  /// The item's modifier groups, in the order the menu lists them. Unknown ids are skipped.
  List<ModifierGroup> groupsFor(MenuItem item) => [for (final id in item.modifierGroupIds) ?modifierGroups[id]];

  List<MenuItem> itemsIn(String? categoryId) => [
    for (final i in items)
      if (categoryId == null || i.categoryId == categoryId) i,
  ];
}

PricingSettings parsePricing(Map<String, dynamic> j) {
  final rounding = j['rounding'] as Map<String, dynamic>;
  return PricingSettings(
    priceMode: PriceMode.parse(j['priceMode'] as String),
    vatRate: j['vatRate'] as int,
    serviceChargeRate: j['serviceChargeRate'] as int,
    serviceChargeOrderTypes: {for (final t in j['serviceChargeOrderTypes'] as List<dynamic>) OrderType.parse(t as String)},
    rounding: Rounding(increment: rounding['increment'] as int, mode: RoundingMode.parse(rounding['mode'] as String)),
  );
}

enum StaffRole { owner, manager, cashier, waiter, kitchen }

class StaffMember {
  StaffMember({required this.id, required this.name, required this.role, required this.pinHash});

  factory StaffMember.fromJson(Map<String, dynamic> j) => StaffMember(
    id: j['id'] as String,
    name: j['name'] as String,
    role: StaffRole.values.byName((j['role'] as String).toLowerCase()),
    pinHash: j['pinHash'] as String,
  );

  final String id;
  final String name;
  final StaffRole role;
  final String pinHash;
}

/// Who can sign in on this device (GET /v1/devices/me/roster). PIN hashes only, never PINs.
class Roster {
  Roster({required this.staff, required this.permissions});

  factory Roster.fromJson(Map<String, dynamic> j) => Roster(
    staff: [for (final s in j['staff'] as List<dynamic>) StaffMember.fromJson(s as Map<String, dynamic>)],
    permissions: {
      for (final MapEntry(:key, :value) in (j['permissions'] as Map<String, dynamic>).entries)
        key: (value as Map<String, dynamic>).cast<String, String>(),
    },
  );

  final List<StaffMember> staff;

  /// role (e.g. "CASHIER") → permission → "ALLOW" | "APPROVAL" | "DENY".
  final Map<String, Map<String, String>> permissions;

  bool can(StaffMember who, String permission) => permissions[who.role.name.toUpperCase()]?[permission] == 'ALLOW';
}
