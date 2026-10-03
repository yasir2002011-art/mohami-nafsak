"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";

/**
 * قياس المقال: مشاهدة عند الفتح، وتحويل عند النقر على رابط أداة داخل المقال.
 * يُرسل معرّف المقال ومعرّف الأداة فقط.
 */
export default function ArticleTelemetry({
  article,
  toolIdBySlug,
}: {
  article: string;
  /** خريطة رابط الأداة ← معرّفها، لتحويل الرابط المنقور إلى معرّف من بيانات الموقع */
  toolIdBySlug: Record<string, string>;
}) {
  useEffect(() => {
    track("article_view", { article });

    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement | null)?.closest?.("a[href^='/tools/']");
      if (!link || !link.closest("[data-article-body]")) return;
      const slug = (link.getAttribute("href") ?? "").split("/")[2]?.split(/[?#]/)[0] ?? "";
      const tool = toolIdBySlug[slug];
      if (tool) track("article_to_tool", { article, tool });
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [article, toolIdBySlug]);

  return null;
}
