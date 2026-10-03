/**
 * قياس السلوك من المتصفح — دالة واحدة: track(event, props).
 *
 * لا كوكي، ولا معرّف زائر أو جلسة، ولا أي نص يكتبه المستخدم. الخصائص فئات
 * مغلقة يتحقق منها الخادم (lib/metrics-schema.ts) ويرفض ما عداها.
 *
 * ما يُحفظ في sessionStorage هنا محلي بالتبويب ويُمحى بإغلاقه، ولا يُرسل
 * إلى الخادم كمعرّف: مصدر الزيارة (فئة مغلقة) وعلامة «استُخدمت هذه الأداة
 * في هذا التبويب» التي تمنع تضخيم العدّاد بتحديث الصفحة.
 */

type Props = Record<string, string | undefined>;

export function track(event: string, props: Props = {}): void {
  try {
    const body = JSON.stringify({ event, props });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      // sendBeacon يكتمل حتى لو غادر المستخدم الصفحة (ضروري لروابط الأدوات الخارجية)
      if (navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }))) return;
    }
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // القياس لا يعطّل الواجهة أبدًا
  }
}

/* ------------------------------ تخزين التبويب ------------------------------ */

function sessionGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // التخزين محجوب — نكمل بلا علامة
  }
}

/** أول استخدام لهذه الأداة في هذا التبويب؟ يضع العلامة ويعيد true مرة واحدة فقط */
function firstUseInTab(tool: string): boolean {
  const key = `mn_used:${tool}`;
  if (sessionGet(key)) return false;
  sessionSet(key, "1");
  return true;
}

/* ------------------------------- مصدر الزيارة ------------------------------- */

const SOURCE_KEY = "mn_src";

export interface VisitSource {
  source: "tiktok" | "google" | "direct" | "channel" | "other";
  episode?: string;
}

function detectSource(): VisitSource {
  const params = new URLSearchParams(window.location.search);
  const utm = (params.get("utm_source") ?? "").toLowerCase();
  const code = (params.get("utm_campaign") ?? params.get("utm_content") ?? "").toLowerCase();
  const episode = /^ep[0-9]{1,4}$/.test(code) ? code : undefined;

  let referrer = "";
  try {
    referrer = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : "";
  } catch {
    referrer = "";
  }
  if (referrer === window.location.hostname) referrer = "";

  let source: VisitSource["source"];
  if (utm === "tiktok" || referrer.endsWith("tiktok.com")) source = "tiktok";
  else if (utm === "channel") source = "channel";
  else if (utm === "google" || /(^|\.)google\./.test(referrer)) source = "google";
  else if (!utm && !referrer) source = "direct";
  else source = "other";

  return { source, episode };
}

/** يسجّل مصدر الزيارة مرة واحدة لكل تبويب */
export function trackSourceVisit(): void {
  if (sessionGet(SOURCE_KEY)) return;
  const visit = detectSource();
  sessionSet(SOURCE_KEY, JSON.stringify(visit));
  track("source_visit", { source: visit.source, episode: visit.episode });
}

function currentSource(): Partial<VisitSource> {
  try {
    return JSON.parse(sessionGet(SOURCE_KEY) ?? "{}") as Partial<VisitSource>;
  } catch {
    return {};
  }
}

/* --------------------------------- مسار الأداة --------------------------------- */

/** حالة التشغيل الحالي لكل أداة — في الذاكرة فقط */
const runs = new Map<string, { startedAt: number; steps: Set<number>; completed: boolean }>();

export function trackToolStart(tool: string): void {
  runs.set(tool, { startedAt: Date.now(), steps: new Set(), completed: false });
  track("tool_start", { tool, fresh: firstUseInTab(tool) ? "1" : "0" });
}

/** الخطوة برقم ترتيبها فقط — لا يُرسل أي سؤال أو إجابة */
export function trackToolStep(tool: string, step: number): void {
  const run = runs.get(tool);
  if (!run || run.steps.has(step) || step < 1 || step > 40) return;
  run.steps.add(step);
  track("tool_step", { tool, step: String(step) });
}

export function trackToolComplete(tool: string): void {
  const run = runs.get(tool);
  if (!run || run.completed) return;
  run.completed = true;

  const minutes = (Date.now() - run.startedAt) / 60_000;
  const duration_bucket = minutes < 1 ? "<1m" : minutes < 3 ? "1-3m" : minutes < 5 ? "3-5m" : ">5m";
  const { source, episode } = currentSource();
  track("tool_complete", { tool, duration_bucket, source, episode });
}

/** نقرة على أداة خارجية — تُحتسب مرة واحدة لكل تبويب */
export function trackExternalClick(tool: string): void {
  if (firstUseInTab(tool)) track("ext_tool_click", { tool });
}

/** قالب الصفحة من مسارها — فئة مغلقة لا المسار نفسه */
export function pageTemplate(pathname: string): string {
  if (pathname === "/") return "/";
  if (pathname.startsWith("/tools/")) return "/tools/[slug]";
  if (pathname.startsWith("/sections/")) return "/sections/[slug]";
  if (pathname === "/articles") return "/articles";
  if (pathname.startsWith("/articles/")) return "/articles/[slug]";
  if (["/about", "/contact", "/privacy", "/terms", "/disclaimer"].includes(pathname)) return pathname;
  return "other";
}
