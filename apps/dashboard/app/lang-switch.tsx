"use client";

import { useI18n } from "@/lib/i18n";

export function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <button type="button" className="secondary" onClick={() => setLang(lang === "th" ? "en" : "th")} aria-label="Language">
      {lang === "th" ? "EN" : "ไทย"}
    </button>
  );
}
