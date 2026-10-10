import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { navItemsFor } from "@/config/navigation";
import { auth, makeWorld, ROLES } from "./helpers/world";

const SRC = path.resolve(__dirname, "../src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Routes from src/app: page.tsx and route.ts files, with (groups) removed and [param] kept. */
const routes = walk(path.join(SRC, "app"))
  .filter((f) => /[\\/](page\.tsx|route\.ts)$/.test(f))
  .map((f) => "/" + path.relative(path.join(SRC, "app"), path.dirname(f)).split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).join("/"))
  .map((r) => (r === "/" ? r : r.replace(/\/$/, "")));

const matcher = (route: string) => new RegExp("^" + route.replace(/\[[^\]]+\]/g, "[^/]+") + "/?$");
const exists = (href: string) => routes.some((r) => matcher(r).test(href.split(/[?#]/)[0]));

describe("internal navigation never leads to a missing page", () => {
  it("every sidebar link for every kind of user resolves to a real route", async () => {
    const w = await makeWorld();
    const users = [w.admin, w.nobody, ...ROLES.map((r) => w.a[r])];
    for (const u of users) {
      for (const item of navItemsFor(await auth(u.id))) expect(exists(item.href), `${item.label} -> ${item.href}`).toBe(true);
    }
  });

  it("every literal internal href/redirect in the source resolves to a real route", () => {
    const missing: string[] = [];
    for (const file of walk(SRC).filter((f) => /\.(tsx?|ts)$/.test(f) && !f.includes("generated"))) {
      const text = readFileSync(file, "utf8");
      // href="/x", href={`/x/${id}`}, redirect("/x"), redirect(`/x/${id}`)
      for (const m of text.matchAll(/(?:href=|redirect\()\s*\{?\s*[`"'](\/[^`"']*)[`"']/g)) {
        const href = m[1].replace(/\$\{[^}]*\}/g, "x").split(/[?#]/)[0]; // template expressions stand for dynamic ids
        if (href.startsWith("/api/") || href.startsWith("/_next")) continue;
        if (!exists(href)) missing.push(`${path.relative(SRC, file)}: ${href}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
