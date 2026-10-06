"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { useRequireSession } from "@/lib/session";
import { LangSwitch } from "../lang-switch";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const session = useRequireSession();
  const pathname = usePathname();
  const router = useRouter();

  if (session.loading || !session.me) return <p className="shell">{t.loading}</p>;

  const links = [
    { href: "/menu", label: t.menu },
    { href: "/devices", label: t.devices },
    { href: "/staff", label: t.staff },
  ];

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">{t.appName}</span>
        <nav className="nav">
          {links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <label style={{ flexDirection: "row", display: "flex", alignItems: "center", gap: 8 }}>
          {t.branch}
          <select value={session.branchId ?? ""} onChange={(e) => session.setBranchId(e.target.value)}>
            {session.me.branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <LangSwitch />
        <button
          type="button"
          className="secondary"
          onClick={async () => {
            await session.signOut();
            router.replace("/login");
          }}
        >
          {t.signOut}
        </button>
      </header>
      <main>{children}</main>
    </div>
  );
}
