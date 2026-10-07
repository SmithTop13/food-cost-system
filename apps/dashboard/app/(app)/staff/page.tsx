"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { Role, Staff } from "@/lib/types";

const ROLES: Role[] = ["CASHIER", "WAITER", "KITCHEN", "MANAGER"];

export default function StaffPage() {
  const { t } = useI18n();
  const { branchId, me } = useSession();
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    try {
      setStaff((await api<{ staff: Staff[] }>("GET", `/v1/branches/${branchId}/staff`)).staff);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }, [branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setError(null);
    try {
      await api("POST", `/v1/branches/${branchId}/staff`, {
        name: String(form.get("name")),
        role: String(form.get("role")),
        pin: String(form.get("pin")),
      });
      formEl.reset();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }

  // Only the owner can add managers (enforced by the API too).
  const roles = me?.role === "OWNER" ? ROLES : ROLES.filter((r) => r !== "MANAGER");

  return (
    <>
      <h1>{t.staff}</h1>
      <form className="card form" onSubmit={add}>
        <h2 style={{ marginTop: 0 }}>{t.addStaff}</h2>
        <div className="row">
          <label>
            {t.staffName}
            <input name="name" required maxLength={120} />
          </label>
          <label>
            {t.role}
            <select name="role" defaultValue="CASHIER">
              {roles.map((r) => (
                <option key={r} value={r}>{t.roles[r]}</option>
              ))}
            </select>
          </label>
          <label>
            {t.pin}
            <input name="pin" inputMode="numeric" pattern="[0-9]{4,6}" required autoComplete="off" />
          </label>
          <button type="submit">{t.addStaff}</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
      <section className="card table-wrap">
        {staff === null ? (
          <p className="empty">{t.loading}</p>
        ) : staff.length === 0 ? (
          <p className="empty">{t.noStaff}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t.staff}</th>
                <th>{t.role}</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{t.roles[s.role]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
