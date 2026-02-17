import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://staxed.dev",
      lastModified: "2025-11-14",
      changeFrequency: "monthly",
      priority: 1.0,
    },
    {
      url: "https://staxed.dev/privacy",
      lastModified: "2025-11-14",
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: "https://staxed.dev/accessibility",
      lastModified: "2025-11-14",
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
