"use client";

import { useEffect } from "react";
import { pageTemplate, track, trackSourceVisit } from "@/lib/track";

/**
 * قياس عام بلا واجهة: مصدر الزيارة (مرة لكل تبويب) والأخطاء التقنية.
 *
 * من الخطأ لا يُرسل إلا قالب الصفحة ونوع الخطأ (فئتان مغلقتان) — لا رسالة
 * الخطأ ولا مساره. لوحة الإدارة مستثناة من القياس.
 */
export default function Telemetry() {
  useEffect(() => {
    if (window.location.pathname.startsWith("/admin")) return;

    trackSourceVisit();

    // سقف صغير لكل تحميل صفحة حتى لا يُغرق خطأ متكرر العدّاد
    let sent = 0;
    const report = (type: "error" | "rejection") => {
      if (sent >= 2) return;
      sent += 1;
      track("client_error", { page: pageTemplate(window.location.pathname), type });
    };
    const onError = () => report("error");
    const onRejection = () => report("rejection");

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
