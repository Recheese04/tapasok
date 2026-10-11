import { useCallback, useEffect, useRef, useState } from "react";

/** Loads data once, and again on retry / pull-to-refresh. Keeps old data visible while refreshing. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const run = useCallback(async (kind: "initial" | "refresh") => {
    if (kind === "refresh") setRefreshing(true);
    else setLoading(true);
    try {
      const d = await fnRef.current();
      if (alive.current) { setData(d); setError(null); }
    } catch (e) {
      if (alive.current) setError(e);
    } finally {
      if (alive.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void run("initial"); }, [run, ...deps]);
  return { data, error, loading, refreshing, reload: () => run("initial"), refresh: () => run("refresh") };
}
