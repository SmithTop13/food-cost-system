"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { LangSwitch } from "../lang-switch";

export default function SignupPage() {
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
      await api("POST", "/v1/signup", {
        accountName: String(form.get("accountName")),
        branchName: String(form.get("branchName")),
        ownerName: String(form.get("ownerName")),
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
        <h1 style={{ margin: 0 }}>{t.signUp}</h1>
        <LangSwitch />
      </div>
      <form className="card form" onSubmit={submit}>
        <label>
          {t.restaurantName}
          <input name="accountName" required maxLength={120} />
        </label>
        <label>
          {t.branchName}
          <input name="branchName" required maxLength={120} />
        </label>
        <label>
          {t.yourName}
          <input name="ownerName" autoComplete="name" required maxLength={120} />
        </label>
        <label>
          {t.email}
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          {t.password}
          <input name="password" type="password" autoComplete="new-password" required minLength={10} />
          <span className="hint">{t.passwordHint}</span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{t.signUp}</button>
      </form>
      <p>
        {t.haveAccount} <Link href="/login">{t.signIn}</Link>
      </p>
    </main>
  );
}
