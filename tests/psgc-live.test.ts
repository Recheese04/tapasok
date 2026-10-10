import { describe, expect, it } from "vitest";
import { clearPsgcCache, getBarangays, getCities, getProvinces, getRegions, validateAddress } from "@/lib/psgc";

// Hits the real https://psgc.gitlab.io/api/. Skipped by default so the suite stays offline and deterministic.
// Run with: LIVE_PSGC=1 npx vitest run tests/psgc-live.test.ts
describe.skipIf(!process.env.LIVE_PSGC)("PSGC live API", () => {
  it("walks region > province > city > barangay for a province-based region and validates it", async () => {
    clearPsgcCache();
    const regions = await getRegions();
    expect(regions.length).toBeGreaterThanOrEqual(17);
    const region = regions.find((r) => r.name === "Central Luzon")!;
    const provinces = await getProvinces(region.code);
    const pampanga = provinces.find((p) => p.name === "Pampanga")!;
    const cities = await getCities(region.code, pampanga.code);
    expect(cities.length).toBeGreaterThan(10);
    const barangays = await getBarangays(cities[0].code);
    expect(barangays.length).toBeGreaterThan(0);

    const ok = await validateAddress({ regionCode: region.code, provinceCode: pampanga.code, cityCode: cities[0].code, barangayCode: barangays[0].code });
    expect(ok).toMatchObject({ ok: true, address: { regionName: "Central Luzon", provinceName: "Pampanga", cityName: cities[0].name, barangayName: barangays[0].name } });
  });

  it("handles NCR, which has no provinces", async () => {
    clearPsgcCache();
    const ncr = (await getRegions()).find((r) => r.name === "NCR")!;
    expect(await getProvinces(ncr.code)).toEqual([]);
    const cities = await getCities(ncr.code);
    expect(cities.map((c) => c.name)).toContain("City of Manila");
    const manila = cities.find((c) => c.name === "City of Manila")!;
    const barangays = await getBarangays(manila.code);
    expect(barangays.length).toBeGreaterThan(100);
    expect(await validateAddress({ regionCode: ncr.code, cityCode: manila.code, barangayCode: barangays[0].code })).toMatchObject({ ok: true });
  });

  it("rejects a barangay that belongs to a different city", async () => {
    const ncr = (await getRegions()).find((r) => r.name === "NCR")!;
    const [a, b] = await getCities(ncr.code);
    const ofB = (await getBarangays(b.code))[0];
    expect(await validateAddress({ regionCode: ncr.code, cityCode: a.code, barangayCode: ofB.code })).toMatchObject({ ok: false, field: "barangayCode" });
  });
});
