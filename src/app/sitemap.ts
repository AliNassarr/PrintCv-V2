import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://printcv.me/", changeFrequency: "monthly", priority: 1 }];
}
