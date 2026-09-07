import type { MetadataRoute } from "next";
import { getAll } from "@/lib/store";
import { siteUrl } from "@/lib/site";

/** تحديث دوري كالصفحات العامة — خريطة الموقع مسار مستقل لا يرثه من التخطيط الجذري */
export const revalidate = 300;

/** خريطة الموقع — تُبنى من البيانات فلا تحتاج تحديثًا يدويًا عند إضافة أداة أو مقال */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  const [sections, tools, articles] = await Promise.all([
    getAll("sections"),
    getAll("tools"),
    getAll("articles"),
  ]);

  const staticPages = [
    { path: "", priority: 1 },
    { path: "/articles", priority: 0.7 },
    { path: "/about", priority: 0.5 },
    { path: "/contact", priority: 0.4 },
    { path: "/privacy", priority: 0.3 },
    { path: "/terms", priority: 0.3 },
    { path: "/disclaimer", priority: 0.3 },
  ].map((page) => ({
    url: `${base}${page.path}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: page.priority,
  }));

  const sectionPages = sections
    .filter((section) => section.published)
    .map((section) => ({
      url: `${base}/sections/${section.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    }));

  const toolPages = tools
    .filter((tool) => tool.published)
    .map((tool) => ({
      url: `${base}/tools/${tool.slug}`,
      lastModified: new Date(tool.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.9,
    }));

  const articlePages = articles
    .filter((article) => article.status === "published")
    .map((article) => ({
      url: `${base}/articles/${article.slug}`,
      lastModified: new Date(article.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));

  return [...staticPages, ...sectionPages, ...toolPages, ...articlePages];
}
