import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, secureGet, secureSet } from "../api/client";
import type { OrgOverview } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { organizationsOf, type OrgRef } from "../roles";

const KEY = "tapasok_active_org";

type Ctx = {
  orgs: OrgRef[];
  org: OrgRef | null;                 // the active organization
  setActiveOrgId: (id: string) => void;
  overview: OrgOverview | null;       // what the server says this person may see and do in the active organization
  overviewLoading: boolean;
  overviewError: unknown;
  reloadOverview: () => Promise<void>;
};
const OrgCtx = createContext<Ctx | null>(null);

/**
 * Tracks the organization whose tools are shown. Personal member features never depend on it. The choice is a convenience
 * only: the overview is fetched for that organization and the server re-verifies the person's position on every request.
 */
export function OrgProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const orgs = useMemo(() => organizationsOf(me?.memberships ?? []), [me?.memberships]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [overview, setOverview] = useState<OrgOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const seq = useRef(0);

  useEffect(() => { void secureGet(KEY).then(setChosen).catch(() => setChosen(null)); }, []);

  // Fall back to the first organization when nothing (or something no longer valid) was chosen.
  const org = orgs.find((o) => o.id === chosen) ?? orgs[0] ?? null;
  const orgId = org?.id ?? null;

  const load = useCallback(async () => {
    if (!orgId) { setOverview(null); return; }
    const mine = ++seq.current;
    setLoading(true);
    try {
      const o = await api.orgOverview(orgId);
      if (mine === seq.current) { setOverview(o); setError(null); }
    } catch (e) {
      if (mine === seq.current) setError(e);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [orgId]);

  // Clear first so another organization's numbers are never shown under the new name while loading.
  useEffect(() => { setOverview(null); void load(); }, [load]);

  const value = useMemo<Ctx>(() => ({
    orgs, org, overview, overviewLoading: loading, overviewError: error, reloadOverview: load,
    setActiveOrgId: (id) => { setChosen(id); void secureSet(KEY, id).catch(() => undefined); },
  }), [orgs, org, overview, loading, error, load]);

  return <OrgCtx.Provider value={value}>{children}</OrgCtx.Provider>;
}

export function useOrg() {
  const c = useContext(OrgCtx);
  if (!c) throw new Error("useOrg must be used inside OrgProvider");
  return c;
}
