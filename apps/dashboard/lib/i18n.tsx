"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "th" | "en";

const en = {
  appName: "Restaurant dashboard",
  signIn: "Sign in",
  signOut: "Sign out",
  signUp: "Create a restaurant",
  email: "Email",
  password: "Password",
  passwordHint: "At least 10 characters",
  restaurantName: "Restaurant name",
  branchName: "First branch name",
  yourName: "Your name",
  noAccount: "New here?",
  haveAccount: "Already have an account?",
  branch: "Branch",
  menu: "Menu",
  devices: "Devices",
  staff: "Staff",
  categories: "Categories",
  addCategory: "Add category",
  items: "Items",
  addItem: "Add item",
  nameTh: "Name (Thai)",
  nameEn: "Name (English)",
  price: "Price (THB)",
  basePrice: "Base price",
  branchPrice: "Price at this branch",
  branchPriceHint: "Empty = base price",
  available: "On sale",
  soldOut: "Sold out",
  category: "Category",
  noCategory: "No category",
  modifiers: "Modifiers",
  modifierGroups: "Modifier groups",
  addModifierGroup: "Add modifier group",
  minChoices: "Min choices",
  maxChoices: "Max choices",
  optionsHint: "One option per line: name, price. Example: Fried egg, 10",
  remove: "Remove",
  save: "Save",
  saved: "Saved",
  invalidPrice: "Enter a price like 60 or 60.50",
  emptyMenu: "No items yet. Add a category, then your first dish.",
  pairDevice: "Pair a new device",
  pairHelp: "Open the POS app on the new tablet and enter this code. It works once, for 15 minutes.",
  expires: "Expires",
  deviceName: "Device",
  kind: "Type",
  hubOrder: "Hub order",
  lastSeen: "Last seen",
  never: "Never",
  retire: "Retire",
  retireConfirm: "Retire this device? It will stop working immediately.",
  noDevices: "No devices paired yet.",
  addStaff: "Add staff",
  staffName: "Name",
  role: "Role",
  pin: "PIN (4–6 digits)",
  noStaff: "No staff yet.",
  roles: { OWNER: "Owner", MANAGER: "Manager", CASHIER: "Cashier", WAITER: "Waiter", KITCHEN: "Kitchen" },
  loading: "Loading…",
};

type Dict = typeof en;

const th: Dict = {
  appName: "แดชบอร์ดร้านอาหาร",
  signIn: "เข้าสู่ระบบ",
  signOut: "ออกจากระบบ",
  signUp: "สร้างร้านใหม่",
  email: "อีเมล",
  password: "รหัสผ่าน",
  passwordHint: "อย่างน้อย 10 ตัวอักษร",
  restaurantName: "ชื่อร้าน",
  branchName: "ชื่อสาขาแรก",
  yourName: "ชื่อของคุณ",
  noAccount: "ยังไม่มีบัญชี?",
  haveAccount: "มีบัญชีแล้ว?",
  branch: "สาขา",
  menu: "เมนู",
  devices: "อุปกรณ์",
  staff: "พนักงาน",
  categories: "หมวดหมู่",
  addCategory: "เพิ่มหมวดหมู่",
  items: "รายการอาหาร",
  addItem: "เพิ่มรายการ",
  nameTh: "ชื่อ (ไทย)",
  nameEn: "ชื่อ (อังกฤษ)",
  price: "ราคา (บาท)",
  basePrice: "ราคาตั้งต้น",
  branchPrice: "ราคาที่สาขานี้",
  branchPriceHint: "เว้นว่าง = ใช้ราคาตั้งต้น",
  available: "พร้อมขาย",
  soldOut: "หมด",
  category: "หมวดหมู่",
  noCategory: "ไม่มีหมวดหมู่",
  modifiers: "ตัวเลือกเพิ่มเติม",
  modifierGroups: "กลุ่มตัวเลือก",
  addModifierGroup: "เพิ่มกลุ่มตัวเลือก",
  minChoices: "เลือกอย่างน้อย",
  maxChoices: "เลือกได้สูงสุด",
  optionsHint: "หนึ่งตัวเลือกต่อบรรทัด: ชื่อ, ราคา เช่น ไข่ดาว, 10",
  remove: "ลบ",
  save: "บันทึก",
  saved: "บันทึกแล้ว",
  invalidPrice: "ใส่ราคา เช่น 60 หรือ 60.50",
  emptyMenu: "ยังไม่มีรายการ เพิ่มหมวดหมู่ แล้วเพิ่มเมนูแรกของคุณ",
  pairDevice: "เชื่อมต่ออุปกรณ์ใหม่",
  pairHelp: "เปิดแอป POS บนแท็บเล็ตเครื่องใหม่ แล้วใส่รหัสนี้ ใช้ได้ครั้งเดียว ภายใน 15 นาที",
  expires: "หมดอายุ",
  deviceName: "อุปกรณ์",
  kind: "ประเภท",
  hubOrder: "ลำดับเครื่องหลัก",
  lastSeen: "ใช้งานล่าสุด",
  never: "ยังไม่เคย",
  retire: "เลิกใช้",
  retireConfirm: "เลิกใช้อุปกรณ์นี้? อุปกรณ์จะใช้งานไม่ได้ทันที",
  noDevices: "ยังไม่มีอุปกรณ์ที่เชื่อมต่อ",
  addStaff: "เพิ่มพนักงาน",
  staffName: "ชื่อ",
  role: "ตำแหน่ง",
  pin: "PIN (4–6 หลัก)",
  noStaff: "ยังไม่มีพนักงาน",
  roles: { OWNER: "เจ้าของ", MANAGER: "ผู้จัดการ", CASHIER: "แคชเชียร์", WAITER: "พนักงานเสิร์ฟ", KITCHEN: "ครัว" },
  loading: "กำลังโหลด…",
};

const dicts: Record<Lang, Dict> = { th, en };
const LANG_KEY = "fcs.lang";

const I18nContext = createContext<{ lang: Lang; t: Dict; setLang: (lang: Lang) => void }>({
  lang: "th",
  t: th,
  setLang: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("th"); // Thai first

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "th" || saved === "en") setLangState(saved);
    } catch {
      // keep the default
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // not remembered, still switched
    }
  }, []);

  return <I18nContext.Provider value={{ lang, t: dicts[lang], setLang }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

/** Thai or English name, falling back to Thai when there is no English name. */
export function localName(lang: Lang, item: { nameTh: string; nameEn: string | null }): string {
  return lang === "en" && item.nameEn ? item.nameEn : item.nameTh;
}
