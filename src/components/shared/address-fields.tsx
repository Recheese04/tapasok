"use client";

import { useCallback, useEffect, useState } from "react";

type Place = { code: string; name: string };
type Defaults = { regionCode?: string | null; provinceCode?: string | null; cityCode?: string | null; barangayCode?: string | null };

const control = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm";

/** Loads one PSGC list through the server proxy. `url === null` means "parent not chosen yet". */
function useList(url: string | null) {
  const [state, setState] = useState<{ url: string | null; items: Place[]; error: boolean; loading: boolean }>({
    url: null, items: [], error: false, loading: false,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then((items: Place[]) => setState({ url, items, error: false, loading: false }))
      .catch((e) => {
        if (e?.name !== "AbortError") setState({ url, items: [], error: true, loading: false });
      });
    return () => ctrl.abort();
  }, [url, attempt]);

  const current = url !== null && state.url === url;
  return {
    items: current ? state.items : [],
    error: current && state.error,
    loading: url !== null && !current,
    retry: useCallback(() => setAttempt((n) => n + 1), []),
  };
}

function PlaceSelect(props: {
  id: string; name: string; label: string; value: string; onChange: (v: string) => void;
  list: ReturnType<typeof useList>; enabled: boolean; required?: boolean; error?: string; placeholder: string;
}) {
  const { id, name, label, value, onChange, list, enabled, required, error } = props;
  const [filter, setFilter] = useState("");
  const shown = filter ? list.items.filter((i) => i.name.toLowerCase().includes(filter.toLowerCase()) || i.code === value) : list.items;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      {enabled && list.items.length > 12 && (
        <input
          type="search"
          aria-label={`Filter ${label.toLowerCase()} list`}
          placeholder="Type to filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={`${control} mb-1`}
        />
      )}
      <select
        id={id} name={name} value={value} required={required && enabled} disabled={!enabled || list.loading}
        onChange={(e) => onChange(e.target.value)} className={control} aria-invalid={error ? "true" : "false"}
      >
        <option value="">{list.loading ? "Loading…" : enabled ? props.placeholder : "—"}</option>
        {shown.map((i) => (
          <option key={i.code} value={i.code}>{i.name}</option>
        ))}
      </select>
      {enabled && !list.loading && !list.error && list.items.length === 0 && (
        <p className="mt-1 text-xs text-muted">No results.</p>
      )}
      {list.error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          Couldn&apos;t load locations.{" "}
          <button type="button" onClick={list.retry} className="underline">Retry</button>
        </p>
      )}
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

/**
 * Region > Province > City/Municipality > Barangay. Each list depends on the parent choice.
 * Only codes are submitted; the server re-validates the chain and derives the names.
 */
export function AddressFields({ defaults = {}, errors = {} }: { defaults?: Defaults; errors?: Record<string, string | undefined> }) {
  const [region, setRegion] = useState(defaults.regionCode ?? "");
  const [province, setProvince] = useState(defaults.provinceCode ?? "");
  const [city, setCity] = useState(defaults.cityCode ?? "");
  const [barangay, setBarangay] = useState(defaults.barangayCode ?? "");

  const regions = useList("/api/psgc/regions");
  const provinces = useList(region ? `/api/psgc/provinces?region=${region}` : null);
  const noProvinces = !!region && !provinces.loading && !provinces.error && provinces.items.length === 0;
  const cityUrl = region && (province || noProvinces) ? `/api/psgc/cities?region=${region}${province ? `&province=${province}` : ""}` : null;
  const cities = useList(cityUrl);
  const barangays = useList(city ? `/api/psgc/barangays?city=${city}` : null);

  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-medium">Address (Philippine Standard Geographic Code)</legend>
      <PlaceSelect id="regionCode" name="regionCode" label="Region" placeholder="Select region" value={region}
        onChange={(v) => { setRegion(v); setProvince(""); setCity(""); setBarangay(""); }}
        list={regions} enabled required error={errors.regionCode} />
      <PlaceSelect id="provinceCode" name="provinceCode" label="Province" placeholder="Select province" value={province}
        onChange={(v) => { setProvince(v); setCity(""); setBarangay(""); }}
        list={provinces} enabled={!!region && !noProvinces} required error={errors.provinceCode} />
      <PlaceSelect id="cityCode" name="cityCode" label="City / municipality" placeholder="Select city or municipality" value={city}
        onChange={(v) => { setCity(v); setBarangay(""); }}
        list={cities} enabled={cityUrl !== null} required error={errors.cityCode} />
      <PlaceSelect id="barangayCode" name="barangayCode" label="Barangay" placeholder="Select barangay" value={barangay}
        onChange={setBarangay} list={barangays} enabled={!!city} required error={errors.barangayCode} />
      {noProvinces && <p className="text-xs text-muted sm:col-span-2">This region has no provinces; choose a city directly.</p>}
    </fieldset>
  );
}
