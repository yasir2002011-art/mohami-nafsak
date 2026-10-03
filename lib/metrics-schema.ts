/**
 * مخطط قياس السلوك — القوائم المغلقة والتحقق.
 *
 * هذا الملف بلا أي اعتماد خارجي عمدًا: هو المرجع الوحيد لما يُسمح بتخزينه،
 * ويُستورد في الخادم وفي اختبار الخصوصية معًا.
 *
 * القاعدة: لا يدخل جدول العدّ إلا حدث من القائمة، بخصائص من القائمة، وبقيم من
 * قوائم مغلقة أو معرّفات يملكها الموقع (أداة، قسم، مقال، محامٍ). لا نص حر،
 * ولا معرّف زائر أو جلسة، ولا عنوان IP، ولا أي إجابة من إجابات الكواشف
 * (ولذلك تُسجَّل الخطوة برقم ترتيبها لا بمعرّف السؤال، ولا تُسجَّل النتيجة).
 */

export const SOURCES = ["tiktok", "google", "direct", "channel", "other"] as const;
export const DURATION_BUCKETS = ["<1m", "1-3m", "3-5m", ">5m", "na"] as const;
export const REPORT_CATEGORIES = [
  "legal-update",
  "wrong-result",
  "broken-link",
  "unsatisfied-result",
  "other",
] as const;
export const ERROR_TYPES = ["error", "rejection"] as const;
export const PAGE_TEMPLATES = [
  "/",
  "/tools/[slug]",
  "/sections/[slug]",
  "/articles",
  "/articles/[slug]",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/disclaimer",
  "other",
] as const;

/** أقصى رقم خطوة مقبول */
export const MAX_STEP = 40;
const EPISODE = /^ep[0-9]{1,4}$/;

/** المعرّفات التي يملكها الموقع — تُبنى من بياناته وقت التحقق */
export interface MetricContext {
  tools: ReadonlySet<string>;
  sections: ReadonlySet<string>;
  articles: ReadonlySet<string>;
  lawyers: ReadonlySet<string>;
  ads: ReadonlySet<string>;
}

type Rule =
  | { kind: "enum"; values: readonly string[] }
  | { kind: "ctx"; set: keyof MetricContext }
  | { kind: "step" }
  | { kind: "episode" };

interface EventSpec {
  /** هل يُقبل من المتصفح؟ الأحداث الخادمية تُسجَّل من مسارات الخادم فقط */
  client: boolean;
  required: Record<string, Rule>;
  optional?: Record<string, Rule>;
}

const tool: Rule = { kind: "ctx", set: "tools" };
const en = (values: readonly string[]): Rule => ({ kind: "enum", values });

export const EVENT_SPECS = {
  source_visit: {
    client: true,
    required: { source: en(SOURCES) },
    optional: { episode: { kind: "episode" } },
  },
  tool_start: { client: true, required: { tool, fresh: en(["1", "0"]) } },
  tool_step: { client: true, required: { tool, step: { kind: "step" } } },
  tool_complete: {
    client: true,
    required: { tool, duration_bucket: en(DURATION_BUCKETS) },
    optional: { source: en(SOURCES), episode: { kind: "episode" } },
  },
  tool_download: { client: true, required: { tool } },
  tool_helpful: { client: true, required: { tool, value: en(["yes", "no"]) } },
  tool_error_report: { client: false, required: { tool, category: en(REPORT_CATEGORIES) } },
  ext_tool_click: { client: true, required: { tool } },
  coming_soon_click: { client: true, required: { section: { kind: "ctx", set: "sections" } } },
  article_view: { client: true, required: { article: { kind: "ctx", set: "articles" } } },
  article_to_tool: {
    client: true,
    required: { article: { kind: "ctx", set: "articles" }, tool },
  },
  lawyer_view: { client: true, required: { lawyer_id: { kind: "ctx", set: "lawyers" } } },
  lawyer_contact_click: {
    client: false,
    required: { lawyer_id: { kind: "ctx", set: "lawyers" } },
  },
  client_error: {
    client: true,
    required: { page: en(PAGE_TEMPLATES), type: en(ERROR_TYPES) },
  },
  ad_click: { client: false, required: { ad: { kind: "ctx", set: "ads" } } },
} as const satisfies Record<string, EventSpec>;

export type MetricEvent = keyof typeof EVENT_SPECS;
export type MetricProps = Record<string, string>;
export const METRIC_EVENTS = Object.keys(EVENT_SPECS) as MetricEvent[];

function passes(rule: Rule, value: string, ctx: MetricContext): boolean {
  switch (rule.kind) {
    case "enum":
      return rule.values.includes(value);
    case "ctx":
      return ctx[rule.set].has(value);
    case "step": {
      if (!/^[0-9]{1,2}$/.test(value)) return false;
      const n = Number(value);
      return n >= 1 && n <= MAX_STEP;
    }
    case "episode":
      return EPISODE.test(value);
  }
}

/**
 * يتحقق من حدث ويعيد خصائصه المسموحة فقط، أو null إن لم يكن صالحًا.
 * أي مفتاح غير معرّف يُسقَط، وأي قيمة خارج القوائم ترفض الحدث كله.
 */
export function sanitizeMetric(
  event: unknown,
  raw: unknown,
  ctx: MetricContext,
  from: "client" | "server",
): { event: MetricEvent; props: MetricProps } | null {
  if (typeof event !== "string" || !Object.hasOwn(EVENT_SPECS, event)) return null;
  const spec: EventSpec = EVENT_SPECS[event as MetricEvent];
  if (from === "client" && !spec.client) return null;

  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const props: MetricProps = {};

  for (const [key, rule] of Object.entries(spec.required)) {
    const value = input[key];
    if (typeof value !== "string" || !passes(rule, value, ctx)) return null;
    props[key] = value;
  }
  for (const [key, rule] of Object.entries(spec.optional ?? {})) {
    const value = input[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" || !passes(rule, value, ctx)) return null;
    props[key] = value;
  }

  return { event: event as MetricEvent, props };
}

/** JSON قانوني بمفاتيح مرتّبة — به يتطابق الصف مع نفسه فيزيد عدّاده */
export function canonicalProps(props: MetricProps): string {
  const sorted: MetricProps = {};
  for (const key of Object.keys(props).sort()) sorted[key] = props[key];
  return JSON.stringify(sorted);
}

export interface MetricRow {
  date: string;
  event: string;
  props_json: string;
  count: number;
}

/* ------------------------------ فحص الخصوصية ------------------------------ */

const IPV4 = /(?:^|[^0-9])(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?:[^0-9]|$)/;
const IPV6 = /(?:[0-9a-f]{1,4}:){2,}[0-9a-f]{0,4}/i;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** القيم المسموحة شكلًا: حروف لاتينية وأرقام وبضع علامات، بلا مسافات ولا @ */
const SAFE_VALUE = /^[A-Za-z0-9_\-\[\]\/<>.]{1,64}$/;

/**
 * يفحص صفًّا واحدًا من جدول العدّ ويعيد قائمة المخالفات (فارغة = سليم).
 * الفحص شكلي ومستقل عن بيانات الموقع، فيصلح دليلًا على خلو الجدول من أي
 * معرّف زائر أو IP أو نص حر مهما كان مصدر الصف.
 */
export function inspectRow(row: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const keys = Object.keys(row).sort().join(",");
  if (keys !== "count,date,event,props_json") problems.push(`أعمدة غير متوقعة: ${keys}`);

  if (typeof row.date !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(row.date)) {
    problems.push("التاريخ ليس يومًا بصيغة YYYY-MM-DD (لا وقت دقيق)");
  }
  if (typeof row.count !== "number" || !Number.isInteger(row.count) || row.count < 0) {
    problems.push("العدّاد ليس عددًا صحيحًا");
  }
  if (typeof row.event !== "string" || !Object.hasOwn(EVENT_SPECS, row.event)) {
    problems.push(`حدث خارج القائمة: ${String(row.event)}`);
    return problems;
  }

  const spec: EventSpec = EVENT_SPECS[row.event as MetricEvent];
  const allowed = new Set([...Object.keys(spec.required), ...Object.keys(spec.optional ?? {})]);
  let props: unknown;
  try {
    props = JSON.parse(String(row.props_json));
  } catch {
    problems.push("props_json ليس JSON");
    return problems;
  }
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    problems.push("props_json ليس كائنًا");
    return problems;
  }

  for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
    if (!allowed.has(key)) problems.push(`خاصية خارج القائمة: ${key}`);
    if (typeof value !== "string") {
      problems.push(`قيمة غير نصية في ${key}`);
      continue;
    }
    if (!SAFE_VALUE.test(value)) problems.push(`قيمة بشكل غير مسموح (نص حر؟) في ${key}`);
    if (IPV4.test(value) || IPV6.test(value)) problems.push(`ما يشبه عنوان IP في ${key}`);
    if (UUID.test(value)) problems.push(`ما يشبه معرّفًا فريدًا (UUID) في ${key}`);
    if (value.includes("@")) problems.push(`ما يشبه بريدًا في ${key}`);
    const rule = spec.required[key] ?? spec.optional?.[key];
    if (rule?.kind === "enum" && !rule.values.includes(value)) {
      problems.push(`قيمة خارج القائمة المغلقة في ${key}`);
    }
  }
  return problems;
}
