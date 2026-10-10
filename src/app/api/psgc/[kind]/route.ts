import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { getBarangays, getCities, getProvinces, getRegions, isPsgcCode, PsgcError } from "@/lib/psgc";

// Authenticated read-only proxy for PSGC reference data (no personal data is involved).
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kind } = await params;
  const q = new URL(request.url).searchParams;
  const region = q.get("region") ?? "";
  const province = q.get("province") ?? "";
  const city = q.get("city") ?? "";

  try {
    let data;
    if (kind === "regions") data = await getRegions();
    else if (kind === "provinces" && isPsgcCode(region)) data = await getProvinces(region);
    else if (kind === "cities" && isPsgcCode(region) && (province === "" || isPsgcCode(province))) {
      data = await getCities(region, province || undefined);
    } else if (kind === "barangays" && isPsgcCode(city)) data = await getBarangays(city);
    else return NextResponse.json({ error: "Bad request" }, { status: 400 });

    return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    if (e instanceof PsgcError) return NextResponse.json({ error: e.message }, { status: 502 });
    throw e;
  }
}
