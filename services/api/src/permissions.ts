/**
 * Role permissions. Defaults follow the spec's permission table; the owner can override any
 * cell per account (table `role_permissions`). APPROVAL = needs a manager PIN on the device.
 */
export const ROLES = ["OWNER", "MANAGER", "CASHIER", "WAITER", "KITCHEN"] as const;
export type Role = (typeof ROLES)[number];
export type Grant = "ALLOW" | "APPROVAL" | "DENY";

export const PERMISSIONS = [
  "TAKE_ORDERS",
  "TAKE_PAYMENT",
  "DISCOUNT_OR_VOID",
  "REFUND",
  "EDIT_MENU",
  "SEE_REPORTS_ALL",
  "SEE_REPORTS_BRANCH",
  "SEE_REPORTS_SHIFT",
  "MANAGE_STAFF",
  "MANAGE_DEVICES",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const A: Grant = "ALLOW";
const P: Grant = "APPROVAL";
const D: Grant = "DENY";

// Spec "Optional" cells default to DENY; the owner can switch them on.
export const DEFAULT_GRANTS: Record<Role, Record<Permission, Grant>> = {
  OWNER: {
    TAKE_ORDERS: A, TAKE_PAYMENT: A, DISCOUNT_OR_VOID: A, REFUND: A, EDIT_MENU: A,
    SEE_REPORTS_ALL: A, SEE_REPORTS_BRANCH: A, SEE_REPORTS_SHIFT: A, MANAGE_STAFF: A, MANAGE_DEVICES: A,
  },
  MANAGER: {
    TAKE_ORDERS: A, TAKE_PAYMENT: A, DISCOUNT_OR_VOID: A, REFUND: A, EDIT_MENU: D,
    SEE_REPORTS_ALL: D, SEE_REPORTS_BRANCH: A, SEE_REPORTS_SHIFT: A, MANAGE_STAFF: A, MANAGE_DEVICES: A,
  },
  CASHIER: {
    TAKE_ORDERS: A, TAKE_PAYMENT: A, DISCOUNT_OR_VOID: P, REFUND: D, EDIT_MENU: D,
    SEE_REPORTS_ALL: D, SEE_REPORTS_BRANCH: D, SEE_REPORTS_SHIFT: A, MANAGE_STAFF: D, MANAGE_DEVICES: D,
  },
  WAITER: {
    TAKE_ORDERS: A, TAKE_PAYMENT: D, DISCOUNT_OR_VOID: P, REFUND: D, EDIT_MENU: D,
    SEE_REPORTS_ALL: D, SEE_REPORTS_BRANCH: D, SEE_REPORTS_SHIFT: D, MANAGE_STAFF: D, MANAGE_DEVICES: D,
  },
  KITCHEN: {
    TAKE_ORDERS: D, TAKE_PAYMENT: D, DISCOUNT_OR_VOID: D, REFUND: D, EDIT_MENU: D,
    SEE_REPORTS_ALL: D, SEE_REPORTS_BRANCH: D, SEE_REPORTS_SHIFT: D, MANAGE_STAFF: D, MANAGE_DEVICES: D,
  },
};

export type GrantTable = Record<Role, Record<Permission, Grant>>;

/** Defaults with the account's overrides applied. The owner always keeps every permission. */
export function effectiveGrants(overrides: { role: Role; permission: Permission; grant: Grant }[]): GrantTable {
  const table = structuredClone(DEFAULT_GRANTS);
  for (const o of overrides) if (o.role !== "OWNER") table[o.role][o.permission] = o.grant;
  return table;
}
