import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Only the public landing page is listed, so a search for "Tapasok" leads there first.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 }];
}
