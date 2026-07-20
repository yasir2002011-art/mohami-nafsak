import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // لوحة الإدارة ومسارات الواجهة البرمجية لا تُفهرس
      disallow: ["/admin", "/admin/", "/api/"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
