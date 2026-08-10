import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-08-10");

  return [
    {
      url: "https://chss.chat",
      lastModified,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: "https://chss.chat/p/",
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: "https://chss.chat/research/compression",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://chss.chat/research/og-latency",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
