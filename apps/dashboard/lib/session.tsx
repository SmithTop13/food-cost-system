"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, tokenStore } from "./api";
import type { Me } from "./types";

interface Session {
  me: Me | null;
  loading: boolean;
  branchId: string | null;
  setBranchId: (id: string) => void;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchId, setBranchId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tokenStore.get()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      const next = await api<Me>("GET", "/v1/me");
      setMe(next);
      setBranchId((current) => (current && next.branches.some((b) => b.id === current) ? current : (next.branches[0]?.id ?? null)));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) tokenStore.set(null);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signIn = useCallback(
    async (token: string) => {
      tokenStore.set(token);
      setLoading(true);
      await load();
    },
    [load],
  );

  const signOut = useCallback(async () => {
    await api("POST", "/v1/auth/logout").catch(() => {});
    tokenStore.set(null);
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
