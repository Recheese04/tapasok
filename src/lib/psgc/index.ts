import "server-only";

// Philippine Standard Geographic Code data from https://psgc.gitlab.io/api/ (verified endpoints):
//   /regions/                              -> regions
//   /regions/{code}/provinces/             -> provinces ([] for NCR)
//   /provinces/{code}/cities-municipalities/
//   /regions/{code}/cities-municipalities/ -> used when a region has no provinces (NCR)
//   /cities-municipalities/{code}/barangays/
// Only reference codes are ever sent to the API; no personal data leaves the server.

const BASE = "https://psgc.gitlab.io/api";
const TTL_MS = 7 * 24 * 3600 * 1000; // reference data changes rarely; cache a week
const TIMEOUT_MS = 10_000;

export type Place = { code: string; name: string };

export class PsgcError extends Error {
  constructor(message = "Location data is temporarily unavailable.") {
    super(message);
    this.name = "PsgcError";
  }
}

export const isPsgcCode = (v: unknown): v is string => typeof v === "string" && /^\d{9}$/.test(v);

const cache = new Map<string, { at: number; data: Place[] }>();
const inflight = new Map<string, Promise<Place[]>>();

async function load(path: string): Promise<Place[]> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const pending = inflight.get(path);
  if (pending) return pending;

  const request = (async () => {
    try {
      const res = await fetch(`${BASE}${path}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: "application/json" },
        next: { revalidate: TTL_MS / 1000 },
      });
      if (!res.ok) throw new PsgcError();
      const json: unknown = await res.json();
      if (!Array.isArray(json)) throw new PsgcError();
      const data = json
        .filter((r): r is { code: string; name: string } => isPsgcCode(r?.code) && typeof r?.name === "string")
        .map((r) => ({ code: r.code, name: r.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "en"));
      cache.set(path, { at: Date.now(), data });
      return data;
    } catch (e) {
      // Serve stale data rather than failing the form if the API is briefly down.
      if (hit) return hit.data;
      throw e instanceof PsgcError ? e : new PsgcError();
    } finally {
      inflight.delete(path);
    }
  })();
  inflight.set(path, request);
  return request;
}

const need = (code: string) => {
  if (!isPsgcCode(code)) throw new PsgcError("Invalid location code.");
  return code;
};

export const getRegions = () => load("/regions/");
export const getProvinces = (regionCode: string) => load(`/regions/${need(regionCode)}/provinces/`);
export const getCities = (regionCode: string, provinceCode?: string) =>
  provinceCode
    ? load(`/provinces/${need(provinceCode)}/cities-municipalities/`)
    : load(`/regions/${need(regionCode)}/cities-municipalities/`);
export const getBarangays = (cityCode: string) => load(`/cities-municipalities/${need(cityCode)}/barangays/`);

export type AddressInput = { regionCode?: string; provinceCode?: string; cityCode?: string; barangayCode?: string };
export type ValidAddress = {
  regionCode: string; regionName: string;
  provinceCode: string | null; provinceName: string | null;
  cityCode: string; cityName: string;
  barangayCode: string; barangayName: string;
};

/**
 * Verifies the whole region > province > city/municipality > barangay chain against PSGC and returns
 * canonical names. Client-supplied names are never trusted. Returns null when no address was given.
 */
export async function validateAddress(
  input: AddressInput,
): Promise<{ ok: true; address: ValidAddress | null } | { ok: false; error: string; field?: string }> {
  const { regionCode, provinceCode, cityCode, barangayCode } = input;
  if (!regionCode && !provinceCode && !cityCode && !barangayCode) return { ok: true, address: null };

  for (const [field, v] of Object.entries({ regionCode, cityCode, barangayCode })) {
    if (!v) return { ok: false, error: "Complete the address: region, city/municipality and barangay are required.", field };
    if (!isPsgcCode(v)) return { ok: false, error: "Invalid location code.", field };
  }
  if (provinceCode && !isPsgcCode(provinceCode)) return { ok: false, error: "Invalid location code.", field: "provinceCode" };

  try {
    const region = (await getRegions()).find((r) => r.code === regionCode);
    if (!region) return { ok: false, error: "Unknown region.", field: "regionCode" };

    const provinces = await getProvinces(region.code);
    let province: Place | undefined;
    if (provinces.length > 0) {
      province = provinces.find((p) => p.code === provinceCode);
      if (!province) return { ok: false, error: "Select a province in the chosen region.", field: "provinceCode" };
    } else if (provinceCode) {
      return { ok: false, error: "This region has no provinces.", field: "provinceCode" };
    }

    const city = (await getCities(region.code, province?.code)).find((c) => c.code === cityCode);
    if (!city) return { ok: false, error: "Select a city or municipality in the chosen province.", field: "cityCode" };

    const barangay = (await getBarangays(city.code)).find((b) => b.code === barangayCode);
    if (!barangay) return { ok: false, error: "Select a barangay in the chosen city or municipality.", field: "barangayCode" };

    return {
      ok: true,
      address: {
        regionCode: region.code, regionName: region.name,
        provinceCode: province?.code ?? null, provinceName: province?.name ?? null,
        cityCode: city.code, cityName: city.name,
        barangayCode: barangay.code, barangayName: barangay.name,
      },
    };
  } catch (e) {
    if (e instanceof PsgcError) return { ok: false, error: "Location data is unavailable right now. Please try again." };
    throw e;
  }
}

export function clearPsgcCache() {
  cache.clear();
}
