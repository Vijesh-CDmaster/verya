import type { MetadataRoute } from "next";
import { LEGAL_DOCS } from "@/lib/legal";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/workspace`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/dashboard`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    ...Object.values(LEGAL_DOCS).map((doc) => ({
      url: `${base}/legal/${doc.slug}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
