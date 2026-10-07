"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Me } from "./types";

interface Session {
  me: Me | null;
  loading: boolean;
  branchId: string | null;
  setBranchId: (id: string) => void;
  /** Call after the cookie was set by a successful sign-in or sign-up. */
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchId, setBranchId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await api<Me>("GET", "/v1/me");
      setMe(next);
      setBranchId((current) => (current && next.branches.some((b) => b.id === current) ? current : (next.branches[0]?.id ?? null)));
    } catch {
      setMe(null); // 401: no session (the /api route has already dropped a stale cookie)
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signIn = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  const signOut = useCallback(async () => {
    await api("POST", "/v1/auth/logout").catch(() => {});
    setMe(null);
  }, []);

  return (
    <SessionContext.Provider value={{ me, loading, branchId, setBranchId, signIn, signOut }}>{children}</SessionContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside SessionProvider");
  return session;
}

/** For signed-in pages: sends visitors without a session to /login. */
export function useRequireSession(): Session {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!session.loading && !session.me) router.replace("/login");
  }, [session.loading, session.me, router]);
  return session;
}
