import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, getAll, getSql, hasDatabase, isReadOnlyStore, type SqlClient } from "@/lib/store";
import {
  canonicalProps,
  inspectRow,
  sanitizeMetric,
  type MetricContext,
  type MetricEvent,
  type MetricProps,
  type MetricRow,
} from "@/lib/metrics-schema";

/**
 * قياس السلوك — عدّ مجمّع فقط.
 *
 * جدول واحد: (date, event, props_json, count). الخادم يزيد عدّاد اليوم ولا
 * يحفظ صفًّا لكل حدث، فلا يوجد توقيت دقيق ولا تسلسل أحداث ولا أي معرّف زائر.
 * ما يُقبل تخزينه محدّد في lib/metrics-schema.ts (قوائم مغلقة).
 *
 * التخزين: جدول metrics_daily في القاعدة السحابية، وملف data/metrics.json
 * بديلًا في التطوير المحلي (غير مرفوع إلى المستودع).
 * الاحتفاظ: 12 شهرًا ثم حذف تلقائي مع أول كتابة كل يوم.
 */

const FILE = path.join(DATA_DIR, "metrics.json");
const RETENTION_MONTHS = 12;

/* --------------------------------- التواريخ --------------------------------- */

/** تاريخ اليوم بتوقيت الرياض بصيغة YYYY-MM-DD */
export function riyadhDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function retentionCutoff(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - RETENTION_MONTHS);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------ طبقة القاعدة ------------------------------ */

let schemaReady: Promise<void> | null = null;

async function db(): Promise<SqlClient> {
  const sql = await getSql();
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        create table if not exists metrics_daily (
          date date not null,
          event text not null,
          props_json text not null,
          count integer not null default 0,
          primary key (date, event, props_json)
        )
      `;
      await migrateLegacy(sql);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
  return sql;
}

/** زيادة مجموعة عدّادات باستعلام واحد */
async function dbIncrement(sql: SqlClient, rows: MetricRow[]): Promise<void> {
  if (rows.length === 0) return;
  const payload = JSON.stringify(rows);
  await sql`
    insert into metrics_daily (date, event, props_json, count)
    select x.date, x.event, x.props_json, x.count
    from jsonb_to_recordset(${payload}::jsonb)
      as x(date date, event text, props_json text, count integer)
    on conflict (date, event, props_json)
    do update set count = metrics_daily.count + excluded.count
  `;
}

/* ------------------------------ طبقة الملف (محلي) ------------------------------ */

async function fileRead(): Promise<MetricRow[]> {
  try {
    const raw = (await fs.readFile(FILE, "utf-8")).replace(/^﻿/, "");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MetricRow[]) : [];
  } catch {
    return [];
  }
}

async function fileWrite(rows: MetricRow[]): Promise<void> {
  if (isReadOnlyStore) return;
  try {
    // كتابة ذرّية: ملف مؤقت ثم إعادة تسمية، فلا يُقرأ الملف نصف مكتوب
    const temp = `${FILE}.tmp`;
    await fs.writeFile(temp, JSON.stringify(rows, null, 1), "utf-8");
    await fs.rename(temp, FILE);
  } catch {
    // نظام ملفات للقراءة فقط — العدّ ليس حرجًا فلا نُسقط الطلب
  }
}

/**
 * طابور الكتابة في الملف: الأحداث تصل متزامنة (بدء + خطوة في اللحظة نفسها)،
 * و«اقرأ ثم عدّل ثم اكتب» بلا تسلسل يُتلف الملف أو يُضيع زيادة. في القاعدة
 * لا حاجة لهذا لأن الزيادة هناك استعلام ذرّي واحد.
 */
let fileQueue: Promise<void> = Promise.resolve();

function fileIncrement(row: MetricRow, cutoff: string): Promise<void> {
  fileQueue = fileQueue
    .then(async () => {
      const kept = (await fileRead()).filter((item) => item.date >= cutoff);
      const existing = kept.find(
        (item) => item.date === row.date && item.event === row.event && item.props_json === row.props_json,
      );
      if (existing) existing.count += 1;
      else kept.push(row);
      await fileWrite(kept);
    })
    .catch(() => {});
  return fileQueue;
}

/* ------------------------------- سياق التحقق ------------------------------- */

let contextCache: { at: number; value: MetricContext } | null = null;

/** المعرّفات التي يملكها الموقع الآن — تُخزَّن مؤقتًا دقيقة واحدة */
export async function metricContext(): Promise<MetricContext> {
  if (contextCache && Date.now() - contextCache.at < 60_000) return contextCache.value;
  const [tools, sections, articles, lawyers, ads] = await Promise.all([
    getAll("tools"),
    getAll("sections"),
    getAll("articles"),
    getAll("lawyers"),
    getAll("ads"),
  ]);
  const value: MetricContext = {
    tools: new Set(tools.map((item) => item.id)),
    sections: new Set(sections.map((item) => item.id)),
    articles: new Set(articles.map((item) => item.slug)),
    lawyers: new Set(lawyers.map((item) => item.id)),
    ads: new Set(ads.map((item) => item.id)),
  };
  contextCache = { at: Date.now(), value };
  return value;
}

/* --------------------------------- الكتابة --------------------------------- */

let lastPurgeDay = "";

/**
 * يسجّل حدثًا: يتحقق منه مقابل القوائم المغلقة ثم يزيد عدّاد اليوم.
 * يعيد false إن رُفض الحدث. لا يرمي خطأ — القياس لا يعطّل الموقع أبدًا.
 */
export async function recordMetric(
  event: unknown,
  rawProps: unknown,
  from: "client" | "server" = "server",
): Promise<boolean> {
  try {
    const clean = sanitizeMetric(event, rawProps, await metricContext(), from);
    if (!clean) return false;

    const today = riyadhDate();
    const row: MetricRow = {
      date: today,
      event: clean.event,
      props_json: canonicalProps(clean.props),
      count: 1,
    };

    if (hasDatabase) {
      const sql = await db();
      await dbIncrement(sql, [row]);
      if (lastPurgeDay !== today) {
        lastPurgeDay = today;
        await sql`delete from metrics_daily where date < ${retentionCutoff(today)}`;
      }
    } else {
      await fileIncrement(row, retentionCutoff(today));
    }
    return true;
  } catch {
    return false;
  }
}

/* --------------------------------- القراءة --------------------------------- */

export interface Metric {
  date: string;
  event: MetricEvent;
  props: MetricProps;
  count: number;
}

function parse(rows: MetricRow[]): Metric[] {
  const out: Metric[] = [];
  for (const row of rows) {
    try {
      out.push({
        date: row.date,
        event: row.event as MetricEvent,
        props: JSON.parse(row.props_json) as MetricProps,
        count: Number(row.count) || 0,
      });
    } catch {
      // صف تالف يُتجاهل
    }
  }
  return out;
}

async function rawRows(from?: string, to?: string): Promise<MetricRow[]> {
  if (hasDatabase) {
    const sql = await db();
    const rows =
      from && to
        ? await sql`
            select to_char(date, 'YYYY-MM-DD') as date, event, props_json, count
            from metrics_daily where date >= ${from} and date <= ${to}
          `
        : await sql`
            select to_char(date, 'YYYY-MM-DD') as date, event, props_json, count from metrics_daily
          `;
    return rows as unknown as MetricRow[];
  }
  const rows = await fileRead();
  return from && to ? rows.filter((row) => row.date >= from && row.date <= to) : rows;
}

/** العدّادات بين تاريخين (شاملين) */
export async function queryMetrics(from: string, to: string): Promise<Metric[]> {
  try {
    return parse(await rawRows(from, to));
  } catch {
    return [];
  }
}

/** مجموع عدّادات حدث، مع شرط اختياري على الخصائص */
export function sumOf(
  metrics: Metric[],
  event: MetricEvent,
  where?: (props: MetricProps, date: string) => boolean,
): number {
  let total = 0;
  for (const metric of metrics) {
    if (metric.event === event && (!where || where(metric.props, metric.date))) total += metric.count;
  }
  return total;
}

/** تجميع عدّادات حدث حسب خاصية */
export function groupOf(
  metrics: Metric[],
  event: MetricEvent,
  key: string,
  where?: (props: MetricProps) => boolean,
): { key: string; count: number }[] {
  const totals = new Map<string, number>();
  for (const metric of metrics) {
    if (metric.event !== event) continue;
    if (where && !where(metric.props)) continue;
    const value = metric.props[key];
    if (value === undefined) continue;
    totals.set(value, (totals.get(value) ?? 0) + metric.count);
  }
  return [...totals.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count);
}

/* ------------------------------ عدّاد الاستخدام العام ------------------------------ */

/** هل يُحتسب هذا العدّاد «استخدامًا» في العدّاد العام؟ */
export function isUse(event: MetricEvent, props: MetricProps): boolean {
  if (event === "ext_tool_click") return true;
  // الأداة الداخلية: البدء الأول في جلسة التبويب فقط (fresh = 1)، فالتحديث لا يضخّم العدّ
  return event === "tool_start" && props.fresh === "1";
}

const USAGE_TTL_MS = 10 * 60 * 1000;
let usageCache: { at: number; value: Record<string, number> } | null = null;

/**
 * مجموع الاستخدامات منذ البداية لكل أداة (بمعرّف الأداة).
 * مخزّن مؤقتًا 10 دقائق؛ لوحة الإدارة تطلبه طازجًا.
 */
export async function getUsageTotals(options: { fresh?: boolean } = {}): Promise<Record<string, number>> {
  if (!options.fresh && usageCache && Date.now() - usageCache.at < USAGE_TTL_MS) {
    return usageCache.value;
  }
  const totals: Record<string, number> = {};
  try {
    let rows: MetricRow[];
    if (hasDatabase) {
      const sql = await db();
      rows = (await sql`
        select '0000-00-00' as date, event, props_json, sum(count)::int as count
        from metrics_daily
        where event in ('tool_start', 'ext_tool_click')
        group by event, props_json
      `) as unknown as MetricRow[];
    } else {
      rows = (await fileRead()).filter((row) => row.event === "tool_start" || row.event === "ext_tool_click");
    }
    for (const metric of parse(rows)) {
      if (!isUse(metric.event, metric.props)) continue;
      totals[metric.props.tool] = (totals[metric.props.tool] ?? 0) + metric.count;
    }
  } catch {
    return usageCache?.value ?? {};
  }
  usageCache = { at: Date.now(), value: totals };
  return totals;
}

/** صيغة العدّاد العام: «استُخدمت X مرة» بمطابقة العدد */
export function usesLabel(uses: number): string {
  if (uses === 1) return "استُخدمت مرة واحدة";
  if (uses === 2) return "استُخدمت مرتين";
  if (uses >= 3 && uses <= 10) return `استُخدمت ${uses} مرات`;
  return `استُخدمت ${uses.toLocaleString("en-US")} مرة`;
}

export const DEFAULT_MIN_DISPLAY = 20;

/* ------------------------------- فحص الخصوصية ------------------------------- */

export interface PrivacyAudit {
  columns: string[];
  distinctRows: number;
  violations: string[];
}

/**
 * يفحص ما في جدول العدّ فعليًا: الأعمدة، وكل زوج (حدث، خصائص) مخزَّن.
 * يظهر في تبويب «الجودة» دليلًا حيًّا على خلو الجدول من أي معرّف أو IP أو نص حر.
 */
export async function auditMetricsPrivacy(): Promise<PrivacyAudit> {
  let columns: string[];
  let rows: MetricRow[];

  if (hasDatabase) {
    const sql = await db();
    const cols = await sql`
      select column_name from information_schema.columns
      where table_name = 'metrics_daily' order by column_name
    `;
    columns = cols.map((row) => String(row.column_name));
    rows = (await sql`
      select to_char(min(date), 'YYYY-MM-DD') as date, event, props_json, sum(count)::int as count
      from metrics_daily group by event, props_json
    `) as unknown as MetricRow[];
  } else {
    rows = await fileRead();
    columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
    if (columns.length === 0) columns = ["count", "date", "event", "props_json"];
  }

  const violations: string[] = [];
  if (columns.join(",") !== "count,date,event,props_json") {
    violations.push(`أعمدة الجدول غير متوقعة: ${columns.join(", ")}`);
  }
  for (const row of rows) {
    for (const problem of inspectRow({ ...row, count: Number(row.count) })) {
      violations.push(`${row.event}: ${problem}`);
    }
  }
  return { columns, distinctRows: rows.length, violations: violations.slice(0, 20) };
}

/* --------------------- ترحيل الإحصاءات القديمة (صف لكل حدث) --------------------- */

interface LegacyEvent {
  type?: string;
  toolId?: string;
  lawyerId?: string;
  adId?: string;
  articleId?: string;
  createdAt?: string;
}

/**
 * النظام السابق كان يحفظ صفًّا لكل حدث بمعرّف وتوقيت دقيق. نحوّله مرة واحدة
 * إلى عدّ مجمّع باليوم ثم نُفرغ المخزن القديم. الاستبدال ذرّي (قفل الصف) حتى لا
 * تُرحَّل البيانات مرتين لو بدأت نسختان من الخادم معًا.
 *
 * ما يسقط عمدًا في الترحيل: معرّف الحدث، التوقيت الدقيق، معرّف السؤال ومعرّف
 * النتيجة (يكشفان مسار الإجابات)، ومشاهدة الصفحة والانسحاب (لا مقابل لهما).
 * البدء القديم يُرحَّل بـ fresh = 0 فلا يدخل العدّاد العام.
 */
async function migrateLegacy(sql: SqlClient): Promise<void> {
  // القيمة القديمة تُقرأ من الاستعلام الفرعي في FROM (قبل التحديث) وتُقفل، فتعود
  // مرة واحدة فقط. صيغة CTE مع RETURNING تعيد null هنا — اختُبرت على Postgres.
  const claimed = await sql`
    update store_blobs as target set data = '[]'::jsonb
    from (
      select key, data from store_blobs where key = 'analytics.json' for update
    ) as old
    where target.key = old.key and old.data <> '[]'::jsonb
    returning old.data as data
  `;
  const events = claimed[0]?.data;
  if (!Array.isArray(events) || events.length === 0) return;

  const ctx = await metricContext();
  const articles = await getAll("articles");
  const slugOf = new Map(articles.map((article) => [article.id, article.slug]));
  const totals = new Map<string, MetricRow>();

  for (const legacy of events as LegacyEvent[]) {
    const stamp = new Date(legacy.createdAt ?? "");
    if (Number.isNaN(stamp.getTime())) continue;

    let mapped: { event: string; props: Record<string, string | undefined> } | null = null;
    switch (legacy.type) {
      case "tool_start":
        mapped = { event: "tool_start", props: { tool: legacy.toolId, fresh: "0" } };
        break;
      case "tool_complete":
        mapped = { event: "tool_complete", props: { tool: legacy.toolId, duration_bucket: "na" } };
        break;
      case "result_copy":
        mapped = { event: "tool_download", props: { tool: legacy.toolId } };
        break;
      case "result_satisfied":
        mapped = { event: "tool_helpful", props: { tool: legacy.toolId, value: "yes" } };
        break;
      case "result_unsatisfied":
        mapped = { event: "tool_helpful", props: { tool: legacy.toolId, value: "no" } };
        break;
      case "lawyer_click":
        mapped = { event: "lawyer_contact_click", props: { lawyer_id: legacy.lawyerId } };
        break;
      case "ad_click":
        mapped = { event: "ad_click", props: { ad: legacy.adId } };
        break;
      case "article_view":
        mapped = { event: "article_view", props: { article: slugOf.get(legacy.articleId ?? "") } };
        break;
      default:
        mapped = null;
    }
    if (!mapped) continue;

    const clean = sanitizeMetric(mapped.event, mapped.props, ctx, "server");
    if (!clean) continue;

    const row: MetricRow = {
      date: riyadhDate(stamp),
      event: clean.event,
      props_json: canonicalProps(clean.props),
      count: 1,
    };
    const key = `${row.date}|${row.event}|${row.props_json}`;
    const existing = totals.get(key);
    if (existing) existing.count += 1;
    else totals.set(key, row);
  }

  await dbIncrement(sql, [...totals.values()]);
}
