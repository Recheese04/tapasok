import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, clearToken, loadToken, saveToken, setUnauthorizedHandler } from "../api/client";
import type { Me } from "../api/types";

type State = { status: "loading" | "signedOut" | "signedIn"; me: Me | null; offline: boolean };
type Ctx = State & {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
  setMe: (me: Me) => void;
};
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading", me: null, offline: false });

  const dropSession = useCallback(async () => { await clearToken(); setState({ status: "signedOut", me: null, offline: false }); }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { void dropSession(); });
    return () => setUnauthorizedHandler(null);
  }, [dropSession]);

  // On launch: use the saved token if there is one. A rejected token signs out; a network failure keeps the token and shows an offline state.
  const restore = useCallback(async () => {
    const token = await loadToken();
    if (!token) return setState({ status: "signedOut", me: null, offline: false });
    try {
      setState({ status: "signedIn", me: await api.me(), offline: false });
    } catch (e) {
      if (e instanceof ApiError && e.offline) setState({ status: "signedIn", me: null, offline: true });
      else await dropSession();
    }
  }, [dropSession]);
  useEffect(() => { void restore(); }, [restore]);

  const value = useMemo<Ctx>(() => ({
    ...state,
    signIn: async (email, password) => {
      const { token } = await api.login(email, password);
      await saveToken(token);
      setState({ status: "signedIn", me: await api.me(), offline: false });
    },
    signOut: async () => {
      try { await api.logout(); } catch { /* the server may be unreachable; the device is signed out either way */ }
      await dropSession();
    },
    refreshMe: async () => { try { const me = await api.me(); setState({ status: "signedIn", me, offline: false }); } catch { /* keep the old profile */ } },
    setMe: (me) => setState((s) => ({ ...s, me })),
  }), [state, dropSession, restore]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
