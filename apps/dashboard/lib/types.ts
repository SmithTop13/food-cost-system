export type Role = "OWNER" | "MANAGER" | "CASHIER" | "WAITER" | "KITCHEN";

export interface Me {
  id: string;
  accountId: string;
  role: Role;
  name: string;
  email: string;
  branches: { id: string; name: string }[];
}

export interface Category {
  id: string;
  nameTh: string;
  nameEn: string | null;
  sort: number;
}

export interface BranchOverride {
  branchId: string;
  price: number | null;
  available: boolean;
  stationId: string | null;
}

export interface MenuItem {
  id: string;
  categoryId: string | null;
  nameTh: string;
  nameEn: string | null;
  basePrice: number;
  photoUrl: string | null;
  serviceChargeExempt: boolean;
  modifierGroupIds: string[];
  branches: BranchOverride[];
}

export interface ModifierGroup {
  id: string;
  nameTh: string;
  nameEn: string | null;
  minChoices: number;
  maxChoices: number;
  options: { id: string; nameTh: string; nameEn: string | null; price: number }[];
}

export interface Menu {
  version: number;
  categories: Category[];
  items: MenuItem[];
  modifierGroups: ModifierGroup[];
}

export interface Device {
  id: string;
  name: string;
  kind: "POS" | "WAITER" | "KDS" | "KIOSK";
  hubPriority: number;
  lastSeenAt: string | null;
}

export interface Staff {
  id: string;
  name: string;
  role: Role;
  active: boolean;
}
