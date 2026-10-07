"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { LangSwitch } from "../lang-switch";

export default function LoginPage() {
  const { t } = useI18n();
  const { signIn } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/v1/auth/login", {
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      await signIn();
      router.replace("/menu");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>{t.signIn}</h1>
        <LangSwitch />
      </div>
      <form className="card form" onSubmit={submit}>
        <label>
          {t.email}
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          {t.password}
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{t.signIn}</button>
      </form>
      <p>
        {t.noAccount} <Link href="/signup">{t.signUp}</Link>
      </p>
    </main>
  );
}
