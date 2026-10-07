"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import type { Device } from "@/lib/types";

export default function DevicesPage() {
  const { t, lang } = useI18n();
  const { branchId } = useSession();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    try {
      setDevices((await api<{ devices: Device[] }>("GET", `/v1/branches/${branchId}/devices`)).devices);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }, [branchId]);

  useEffect(() => {
    setCode(null);
    void load();
  }, [load]);

  async function newCode() {
    setError(null);
    try {
      setCode(await api("POST", `/v1/branches/${branchId}/pairing-codes`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }

  async function retire(device: Device) {
    if (!window.confirm(t.retireConfirm)) return;
    await api("DELETE", `/v1/branches/${branchId}/devices/${device.id}`);
    await load();
  }

  const time = (iso: string) => new Date(iso).toLocaleString(lang === "th" ? "th-TH" : "en-GB");

  return (
    <>
      <h1>{t.devices}</h1>
      <section className="card">
        <button type="button" onClick={newCode}>{t.pairDevice}</button>
        {code && (
          <div aria-live="polite">
            <p className="code" data-testid="pairing-code">{code.code}</p>
            <p className="hint">{t.pairHelp}</p>
            <p className="hint">{t.expires}: {time(code.expiresAt)}</p>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      <section className="card table-wrap">
        {devices === null ? (
          <p className="empty">{t.loading}</p>
        ) : devices.length === 0 ? (
          <p className="empty">{t.noDevices}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t.deviceName}</th>
                <th>{t.kind}</th>
                <th className="num">{t.hubOrder}</th>
                <th>{t.lastSeen}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.kind}</td>
                  <td className="num">{d.hubPriority + 1}</td>
                  <td>{d.lastSeenAt ? time(d.lastSeenAt) : t.never}</td>
                  <td className="num">
                    <button type="button" className="danger" onClick={() => retire(d)}>{t.retire}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
