import type { MetadataRoute } from "next";
import { BASE_URL } from "@/lib/constants";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      lastModified: "2025-11-14",
      changeFrequency: "monthly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: "2025-11-14",
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/accessibility`,
      lastModified: "2025-11-14",
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/pearls`,
      lastModified: "2026-02-17",
      changeFrequency: "daily",
      priority: 0.7,
    },
  ];
}
