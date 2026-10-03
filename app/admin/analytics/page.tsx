import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getAll, getSettings } from "@/lib/store";
import {
  addDays,
  auditMetricsPrivacy,
  DEFAULT_MIN_DISPLAY,
  getUsageTotals,
  groupOf,
  isUse,
  queryMetrics,
  riyadhDate,
  sumOf,
  type Metric,
} from "@/lib/metrics";
import { DURATION_BUCKETS, REPORT_CATEGORIES, SOURCES } from "@/lib/metrics-schema";
import { Card, Field, PageHeader } from "@/components/admin/Ui";
import { saveUsageDisplayAction } from "@/app/admin/actions";

/**
 * قسم «السلوك» — قياس مجمّع فقط.
 *
 * كل رقم هنا مجموع عدّادات يومية (lib/metrics.ts). لا توجد صفوف أحداث ولا
 * معرّفات زوار ولا إجابات؛ ولذلك لا يعرض القسم توزيع إجابات ولا نتائج الكواشف.
 */

const TABS = [
  { id: "sources", label: "المصادر" },
  { id: "funnel", label: "القمع" },
  { id: "needs", label: "الاحتياجات" },
  { id: "content", label: "المحتوى" },
  { id: "lawyers", label: "المحامون" },
  { id: "quality", label: "الجودة" },
  { id: "usage", label: "الاستخدام" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const RANGES = [
  { id: "today", label: "اليوم" },
  { id: "7", label: "7 أيام" },
  { id: "30", label: "30 يومًا" },
  { id: "custom", label: "مخصص" },
] as const;

const SOURCE_LABELS: Record<string, string> = {
  tiktok: "تيك توك",
  google: "قوقل",
  direct: "مباشر",
  channel: "القناة",
  other: "أخرى",
};
const DURATION_LABELS: Record<string, string> = {
  "<1m": "أقل من دقيقة",
  "1-3m": "1 إلى 3 دقائق",
  "3-5m": "3 إلى 5 دقائق",
  ">5m": "أكثر من 5 دقائق",
  na: "غير مسجّل (قبل التحديث)",
};
const CATEGORY_LABELS: Record<string, string> = {
  "legal-update": "تحديث نظامي",
  "wrong-result": "النتيجة لا تناسب الحالة",
  "broken-link": "رابط لا يعمل",
  "unsatisfied-result": "عدم رضا عن النتيجة",
  other: "أخرى",
};
const CUSTODY_STEPS = ["المحضونون", "حالة الوالدين", "شروط الحاضن", "أسباب السقوط", "المطالبة بالحضانة"];
const DAY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

export default async function AdminBehaviorPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; range?: string; from?: string; to?: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/admin");

  const query = await searchParams;
  const tab: TabId = TABS.some((item) => item.id === query.tab) ? (query.tab as TabId) : "sources";
  const today = riyadhDate();

  // الفترة المختارة
  let range = RANGES.some((item) => item.id === query.range) ? (query.range as string) : "7";
  let from = addDays(today, -6);
  let to = today;
  if (range === "today") from = today;
  else if (range === "30") from = addDays(today, -29);
  else if (range === "custom") {
    if (query.from && query.to && DAY.test(query.from) && DAY.test(query.to) && query.from <= query.to) {
      from = query.from;
      to = query.to;
    } else {
      range = "7";
    }
  }

  // استعلام واحد يغطي الفترة المختارة وآخر 30 يومًا، ثم نقسّمه في الذاكرة
  const last7 = addDays(today, -6);
  const last30 = addDays(today, -29);
  const widestFrom = from < last30 ? from : last30;
  const widestTo = to > today ? to : today;

  const [all, tools, sections, lawyers, articles, ads, settings] = await Promise.all([
    queryMetrics(widestFrom, widestTo),
    getAll("tools"),
    getAll("sections"),
    getAll("lawyers"),
    getAll("articles"),
    getAll("ads"),
    getSettings(),
  ]);

  const rows = all.filter((metric) => metric.date >= from && metric.date <= to);
  const toolName = (id: string) => tools.find((tool) => tool.id === id)?.name ?? id;
  const liveTools = tools.filter((tool) => tool.published);
  const internalTools = liveTools.filter((tool) => tool.kind === "engine" || tool.kind === "module");

  // الرقمان الكبيران: إتمامات الكاشف الأسري، ونقرات التواصل مع المحامين
  const familySection = sections.find((section) => section.slug === "family");
  const familyTools = new Set(
    internalTools.filter((tool) => tool.sectionId === familySection?.id).map((tool) => tool.id),
  );
  const familyCompletions = (since: string) =>
    sumOf(all, "tool_complete", (props, date) => date >= since && date <= today && familyTools.has(props.tool));
  const contactClicks = (since: string) =>
    sumOf(all, "lawyer_contact_click", (_props, date) => date >= since && date <= today);

  const link = (next: { tab?: string; range?: string }) => {
    const params = new URLSearchParams({ tab: next.tab ?? tab, range: next.range ?? range });
    if ((next.range ?? range) === "custom") {
      params.set("from", from);
      params.set("to", to);
    }
    return `/admin/analytics?${params.toString()}`;
  };

  return (
    <div className="space-y-7">
      <PageHeader
        title="السلوك"
        description="عدّ مجمّع باليوم يظهر لك وحدك: لا كوكي تتبّع، ولا معرّف زائر أو جلسة، ولا عنوان IP، ولا أي إجابة من إجابات الكواشف."
      />

      {/* الرقمان الكبيران */}
      <div className="grid gap-4 sm:grid-cols-2">
        <BigStat
          title="إتمامات الكاشف الأسري"
          today={familyCompletions(today)}
          week={familyCompletions(last7)}
        />
        <BigStat title="نقرات التواصل مع المحامين" today={contactClicks(today)} week={contactClicks(last7)} />
      </div>

      {/* الفلتر الزمني */}
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500">الفترة:</span>
          {RANGES.filter((item) => item.id !== "custom").map((item) => (
            <Link
              key={item.id}
              href={link({ range: item.id })}
              className={`badge ${range === item.id ? "bg-brand-900 text-white" : "bg-brand-50 text-brand-800"}`}
            >
              {item.label}
            </Link>
          ))}
          <span className={`badge ${range === "custom" ? "bg-brand-900 text-white" : "bg-slate-50 text-slate-600"}`}>
            {range === "custom" ? `مخصص: ${from} إلى ${to}` : `من ${from} إلى ${to}`}
          </span>
        </div>

        <form method="get" action="/admin/analytics" className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input type="hidden" name="tab" value={tab} />
          <input type="hidden" name="range" value="custom" />
          <Field label="من تاريخ" name="from" type="date" defaultValue={range === "custom" ? from : undefined} />
          <Field label="إلى تاريخ" name="to" type="date" defaultValue={range === "custom" ? to : undefined} />
          <button type="submit" className="btn-ghost !py-2 text-sm">
            عرض فترة مخصصة
          </button>
        </form>
      </Card>

      {/* التبويبات */}
      <nav className="flex flex-wrap gap-1.5" aria-label="تبويبات السلوك">
        {TABS.map((item) => (
          <Link
            key={item.id}
            href={link({ tab: item.id })}
            aria-current={tab === item.id ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-colors duration-200 ${
              tab === item.id
                ? "bg-brand-900 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-brand-50"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === "sources" && <SourcesTab rows={rows} />}
      {tab === "funnel" && <FunnelTab rows={rows} tools={internalTools} />}
      {tab === "needs" && (
        <NeedsTab
          rows={rows}
          sectionName={(id) => sections.find((section) => section.id === id)?.name ?? id}
          toolName={toolName}
        />
      )}
      {tab === "content" && (
        <ContentTab
          rows={rows}
          articleTitle={(slug) => articles.find((article) => article.slug === slug)?.title ?? slug}
          toolName={toolName}
          ads={ads.map((ad) => ({ id: ad.id, name: ad.advertiserName, impressions: ad.impressions, clicks: ad.clicks }))}
        />
      )}
      {tab === "lawyers" && <LawyersTab rows={rows} lawyers={lawyers} month={today.slice(0, 7)} />}
      {tab === "quality" && <QualityTab rows={rows} tools={liveTools} audit={await auditMetricsPrivacy()} />}
      {tab === "usage" && (
        <UsageTab
          all={all}
          since7={last7}
          since30={last30}
          today={today}
          totals={await getUsageTotals({ fresh: true })}
          tools={liveTools}
          minDisplay={settings.usageMinDisplay ?? DEFAULT_MIN_DISPLAY}
        />
      )}
    </div>
  );
}

/* --------------------------------- مكوّنات العرض --------------------------------- */

function BigStat({ title, today, week }: { title: string; today: number; week: number }) {
  return (
    <Card>
      <p className="text-sm font-bold text-slate-600">{title}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 p-4 text-center">
          <p className="text-4xl font-black text-slate-900">{today}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">اليوم</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4 text-center">
          <p className="text-4xl font-black text-slate-900">{week}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">آخر 7 أيام</p>
        </div>
      </div>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm text-slate-500">{children}</p>;
}

function Table({
  head,
  rows,
  narrow,
}: {
  head: string[];
  rows: (string | number | React.ReactNode)[][];
  /** جدول قليل الأعمدة داخل بطاقة نصف العرض — بلا حد أدنى للعرض */
  narrow?: boolean;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className={`w-full text-sm ${narrow ? "" : "min-w-[28rem]"}`}>
        <thead>
          <tr className="border-b border-slate-200 text-right text-xs font-bold text-slate-500">
            {head.map((cell) => (
              <th key={cell} className="px-3 py-2 font-bold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, index) => (
            <tr key={index} className="border-b border-slate-200 last:border-0">
              {cells.map((cell, cellIndex) => (
                <td key={cellIndex} className={`px-3 py-2.5 ${cellIndex === 0 ? "font-bold text-slate-900" : "text-slate-700"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** شريط نسبة أفقي بسيط */
function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.min(100, Math.max(Math.round((value / max) * 100), value > 0 ? 3 : 0)) : 0;
  return (
    <span className="block h-2 w-full rounded-full bg-slate-50">
      <span className="block h-2 rounded-full bg-brand-900" style={{ width: `${width}%` }} />
    </span>
  );
}

/* ----------------------------------- المصادر ----------------------------------- */

function SourcesTab({ rows }: { rows: Metric[] }) {
  const sessions = new Map(groupOf(rows, "source_visit", "source").map((item) => [item.key, item.count]));
  const completions = new Map(groupOf(rows, "tool_complete", "source").map((item) => [item.key, item.count]));
  const episodeSessions = groupOf(rows, "source_visit", "episode");
  const episodeCompletions = new Map(groupOf(rows, "tool_complete", "episode").map((item) => [item.key, item.count]));
  const total = [...sessions.values()].reduce((sum, value) => sum + value, 0);

  return (
    <>
      <Card>
        <h2 className="font-extrabold text-slate-900">الجلسات والإتمامات حسب المصدر</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          الجلسة تُعدّ مرة لكل تبويب متصفح. الإتمام يُنسب إلى مصدر الزيارة نفسها.
        </p>
        {total === 0 ? (
          <Empty>لا زيارات مسجّلة في هذه الفترة.</Empty>
        ) : (
          <Table
            head={["المصدر", "الجلسات", "الإتمامات", "نسبة الإتمام"]}
            rows={SOURCES.map((source) => {
              const visits = sessions.get(source) ?? 0;
              const done = completions.get(source) ?? 0;
              return [SOURCE_LABELS[source], visits, done, percent(done, visits)];
            })}
          />
        )}
      </Card>

      <Card>
        <h2 className="font-extrabold text-slate-900">حسب الحلقة</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          من رمز الحلقة في الرابط، مثل <code dir="ltr">?utm_source=tiktok&amp;utm_campaign=ep12</code>.
        </p>
        {episodeSessions.length === 0 ? (
          <Empty>لا زيارات برمز حلقة في هذه الفترة.</Empty>
        ) : (
          <Table
            head={["الحلقة", "الجلسات", "الإتمامات", "نسبة الإتمام"]}
            rows={episodeSessions.map((item) => {
              const done = episodeCompletions.get(item.key) ?? 0;
              return [<span key={item.key} dir="ltr">{item.key}</span>, item.count, done, percent(done, item.count)];
            })}
          />
        )}
      </Card>
    </>
  );
}

/* ------------------------------------ القمع ------------------------------------ */

function FunnelTab({ rows, tools }: { rows: Metric[]; tools: { id: string; name: string; kind: string }[] }) {
  if (tools.length === 0) return <Card><Empty>لا توجد كواشف داخلية منشورة.</Empty></Card>;

  return (
    <>
      {tools.map((tool) => {
        const only = (props: Record<string, string>) => props.tool === tool.id;
        const starts = sumOf(rows, "tool_start", only);
        const completions = sumOf(rows, "tool_complete", only);
        const downloads = sumOf(rows, "tool_download", only);
        const steps = groupOf(rows, "tool_step", "step", only)
          .map((item) => ({ step: Number(item.key), count: item.count }))
          .sort((a, b) => a.step - b.step);
        const durations = new Map(groupOf(rows, "tool_complete", "duration_bucket", only).map((item) => [item.key, item.count]));
        const stepLabel = (step: number) =>
          tool.kind === "module" ? (CUSTODY_STEPS[step - 1] ?? `الخطوة ${step}`) : `السؤال ${step}`;

        const stages = [
          { label: "بدء", count: starts },
          ...steps.map((item) => ({ label: stepLabel(item.step), count: item.count })),
          { label: "إتمام", count: completions },
          { label: "تحميل (نسخ أو طباعة)", count: downloads },
        ];

        return (
          <Card key={tool.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-extrabold text-slate-900">{tool.name}</h2>
              <span className="badge bg-amber-100 text-amber-800">
                نسبة السقوط {starts > 0 ? `${Math.max(0, Math.round((1 - completions / starts) * 100))}%` : "—"}
              </span>
            </div>

            {starts === 0 && completions === 0 ? (
              <Empty>لا استخدام مسجّل في هذه الفترة.</Empty>
            ) : (
              <>
                <div className="mt-4 space-y-2.5">
                  {stages.map((stage, index) => (
                    <div key={`${stage.label}-${index}`} className="grid grid-cols-[9rem_1fr_5.5rem] items-center gap-3 text-sm">
                      <span className="font-bold text-slate-800">{stage.label}</span>
                      <Bar value={stage.count} max={Math.max(starts, 1)} />
                      <span className="text-left text-slate-700" dir="ltr">
                        {stage.count} · {percent(stage.count, starts)}
                      </span>
                    </div>
                  ))}
                </div>

                <h3 className="mt-6 text-sm font-extrabold text-slate-900">زمن الإتمام</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DURATION_BUCKETS.filter((bucket) => (durations.get(bucket) ?? 0) > 0).map((bucket) => (
                    <span key={bucket} className="badge bg-brand-50 text-brand-800">
                      {DURATION_LABELS[bucket]}: {durations.get(bucket)}
                    </span>
                  ))}
                  {completions === 0 && <span className="text-xs text-slate-500">لا إتمامات بعد.</span>}
                </div>
              </>
            )}
          </Card>
        );
      })}
      <p className="text-xs leading-relaxed text-slate-500">
        الخطوات تُسجَّل برقم ترتيبها فقط. لا يُسجَّل أي سؤال أو إجابة أو نتيجة.
      </p>
    </>
  );
}

/* --------------------------------- الاحتياجات --------------------------------- */

function NeedsTab({
  rows,
  sectionName,
  toolName,
}: {
  rows: Metric[];
  sectionName: (id: string) => string;
  toolName: (id: string) => string;
}) {
  const comingSoon = groupOf(rows, "coming_soon_click", "section");
  const external = groupOf(rows, "ext_tool_click", "tool");

  return (
    <>
      <Card>
        <h2 className="font-extrabold text-slate-900">الطلب على ما لم يُضف بعد</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          نقرات الزوار على الأقسام الموسومة «قريبًا».
        </p>
        {comingSoon.length === 0 ? (
          <Empty>لا نقرات في هذه الفترة.</Empty>
        ) : (
          <Table head={["القسم", "النقرات"]} rows={comingSoon.map((item) => [sectionName(item.key), item.count])} />
        )}
      </Card>

      <Card>
        <h2 className="font-extrabold text-slate-900">الخدمات الرسمية الأكثر طلبًا</h2>
        {external.length === 0 ? (
          <Empty>لا نقرات على الأدوات الخارجية في هذه الفترة.</Empty>
        ) : (
          <Table head={["الأداة الخارجية", "النقرات"]} rows={external.map((item) => [toolName(item.key), item.count])} />
        )}
      </Card>

      <Card>
        <h2 className="font-extrabold text-slate-900">ما لا يُقاس هنا</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
          <li>
            <span className="font-bold text-slate-800">توزيع الإجابات وخيار «أخرى»:</span> لا تُسجَّل إجابات أي
            مستخدم بقرار المالك، والتزامًا بما يعد به الموقع زوّاره.
          </li>
          <li>
            <span className="font-bold text-slate-800">البحث:</span> لا يوجد بحث في الموقع حاليًا.
          </li>
        </ul>
      </Card>
    </>
  );
}

/* ----------------------------------- المحتوى ----------------------------------- */

function ContentTab({
  rows,
  articleTitle,
  toolName,
  ads,
}: {
  rows: Metric[];
  articleTitle: (slug: string) => string;
  toolName: (id: string) => string;
  ads: { id: string; name: string; impressions: number; clicks: number }[];
}) {
  const views = groupOf(rows, "article_view", "article");
  const conversions = new Map<string, Map<string, number>>();
  for (const metric of rows) {
    if (metric.event !== "article_to_tool") continue;
    const perTool = conversions.get(metric.props.article) ?? new Map<string, number>();
    perTool.set(metric.props.tool, (perTool.get(metric.props.tool) ?? 0) + metric.count);
    conversions.set(metric.props.article, perTool);
  }

  return (
    <>
      <Card>
        <h2 className="font-extrabold text-slate-900">مشاهدات المقالات وتحويلها إلى الأدوات</h2>
        {views.length === 0 ? (
          <Empty>لا مشاهدات في هذه الفترة.</Empty>
        ) : (
          <Table
            head={["المقال", "المشاهدات", "انتقالات إلى أداة", "نسبة التحويل", "إلى أي أداة"]}
            rows={views.map((item) => {
              const perTool = conversions.get(item.key) ?? new Map<string, number>();
              const moved = [...perTool.values()].reduce((sum, value) => sum + value, 0);
              const detail = [...perTool.entries()].map(([toolId, count]) => `${toolName(toolId)} (${count})`).join("، ");
              return [articleTitle(item.key), item.count, moved, percent(moved, item.count), detail || "—"];
            })}
          />
        )}
      </Card>

      {ads.length > 0 && (
        <Card>
          <h2 className="font-extrabold text-slate-900">أداء الإعلانات</h2>
          <Table
            head={["المعلن", "الظهور", "النقرات"]}
            rows={ads.map((ad) => [ad.name, ad.impressions, ad.clicks])}
          />
        </Card>
      )}
    </>
  );
}

/* ---------------------------------- المحامون ---------------------------------- */

function LawyersTab({
  rows,
  lawyers,
  month,
}: {
  rows: Metric[];
  lawyers: { id: string; name: string; city: string; specialties: string[] }[];
  month: string;
}) {
  if (lawyers.length === 0) return <Card><Empty>لا يوجد محامون مضافون بعد.</Empty></Card>;

  const views = new Map(groupOf(rows, "lawyer_view", "lawyer_id").map((item) => [item.key, item.count]));
  const clicks = new Map(groupOf(rows, "lawyer_contact_click", "lawyer_id").map((item) => [item.key, item.count]));

  const rollup = (keysOf: (lawyer: (typeof lawyers)[number]) => string[]) => {
    const totals = new Map<string, { views: number; clicks: number }>();
    for (const lawyer of lawyers) {
      for (const key of keysOf(lawyer)) {
        const entry = totals.get(key) ?? { views: 0, clicks: 0 };
        entry.views += views.get(lawyer.id) ?? 0;
        entry.clicks += clicks.get(lawyer.id) ?? 0;
        totals.set(key, entry);
      }
    }
    return [...totals.entries()].sort((a, b) => b[1].clicks - a[1].clicks || b[1].views - a[1].views);
  };

  return (
    <>
      <Card>
        <h2 className="font-extrabold text-slate-900">لكل محامٍ</h2>
        <Table
          head={["المحامي", "المدينة", "مشاهدات البطاقة", "نقرات التواصل", "النسبة", "تقرير شهري"]}
          rows={lawyers.map((lawyer) => {
            const seen = views.get(lawyer.id) ?? 0;
            const contacted = clicks.get(lawyer.id) ?? 0;
            return [
              lawyer.name,
              lawyer.city || "—",
              seen,
              contacted,
              percent(contacted, seen),
              <Link
                key={lawyer.id}
                href={`/admin/analytics/lawyer-report?lawyer=${encodeURIComponent(lawyer.id)}&month=${month}`}
                className="font-bold text-brand-700 underline underline-offset-4"
              >
                فتح التقرير (PDF)
              </Link>,
            ];
          })}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-extrabold text-slate-900">حسب التخصص</h2>
          <Table
            narrow
            head={["التخصص", "المشاهدات", "النقرات", "النسبة"]}
            rows={rollup((lawyer) => (lawyer.specialties.length > 0 ? lawyer.specialties : ["غير محدد"])).map(
              ([key, value]) => [key, value.views, value.clicks, percent(value.clicks, value.views)],
            )}
          />
        </Card>
        <Card>
          <h2 className="font-extrabold text-slate-900">حسب المدينة</h2>
          <Table
            narrow
            head={["المدينة", "المشاهدات", "النقرات", "النسبة"]}
            rows={rollup((lawyer) => [lawyer.city || "غير محددة"]).map(([key, value]) => [
              key,
              value.views,
              value.clicks,
              percent(value.clicks, value.views),
            ])}
          />
        </Card>
      </div>
    </>
  );
}

/* ----------------------------------- الجودة ----------------------------------- */

function QualityTab({
  rows,
  tools,
  audit,
}: {
  rows: Metric[];
  tools: { id: string; name: string }[];
  audit: { columns: string[]; distinctRows: number; violations: string[] };
}) {
  const helpful = tools
    .map((tool) => ({
      name: tool.name,
      yes: sumOf(rows, "tool_helpful", (props) => props.tool === tool.id && props.value === "yes"),
      no: sumOf(rows, "tool_helpful", (props) => props.tool === tool.id && props.value === "no"),
    }))
    .filter((item) => item.yes + item.no > 0);

  const reports = tools
    .map((tool) => ({
      name: tool.name,
      byCategory: new Map(
        groupOf(rows, "tool_error_report", "category", (props) => props.tool === tool.id).map((item) => [item.key, item.count]),
      ),
    }))
    .filter((item) => item.byCategory.size > 0);

  const errors = new Map<string, { error: number; rejection: number }>();
  for (const metric of rows) {
    if (metric.event !== "client_error") continue;
    const entry = errors.get(metric.props.page) ?? { error: 0, rejection: 0 };
    if (metric.props.type === "rejection") entry.rejection += metric.count;
    else entry.error += metric.count;
    errors.set(metric.props.page, entry);
  }

  return (
    <>
      <Card>
        <h2 className="font-extrabold text-slate-900">هل كانت النتيجة مفيدة؟</h2>
        {helpful.length === 0 ? (
          <Empty>لا تقييمات في هذه الفترة.</Empty>
        ) : (
          <Table
            head={["الأداة", "نعم", "لا", "نسبة الرضا"]}
            rows={helpful.map((item) => [item.name, item.yes, item.no, percent(item.yes, item.yes + item.no)])}
          />
        )}
      </Card>

      <Card>
        <h2 className="font-extrabold text-slate-900">بلاغات الأخطاء حسب الفئة</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          هنا العدّ فقط. نص كل بلاغ في صفحة «البلاغات».
        </p>
        {reports.length === 0 ? (
          <Empty>لا بلاغات في هذه الفترة.</Empty>
        ) : (
          <Table
            head={["الأداة", ...REPORT_CATEGORIES.map((category) => CATEGORY_LABELS[category])]}
            rows={reports.map((item) => [item.name, ...REPORT_CATEGORIES.map((category) => item.byCategory.get(category) ?? 0)])}
          />
        )}
      </Card>

      <Card>
        <h2 className="font-extrabold text-slate-900">الأخطاء التقنية في المتصفح</h2>
        {errors.size === 0 ? (
          <Empty>لا أخطاء مسجّلة في هذه الفترة.</Empty>
        ) : (
          <Table
            head={["قالب الصفحة", "أخطاء تشغيل", "وعود مرفوضة"]}
            rows={[...errors.entries()].map(([page, value]) => [
              <span key={page} dir="ltr">{page}</span>,
              value.error,
              value.rejection,
            ])}
          />
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-extrabold text-slate-900">فحص خصوصية جدول العدّ</h2>
          <span className={`badge ${audit.violations.length === 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
            {audit.violations.length === 0 ? "سليم" : `${audit.violations.length} مخالفة`}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          يُجرى الفحص الآن على ما في الجدول فعليًا: أعمدته{" "}
          <code dir="ltr">{audit.columns.join(", ")}</code>، و{audit.distinctRows} صنفًا مخزَّنًا من الأحداث.
          يتحقق أن كل قيمة من قائمة مغلقة أو معرّف يملكه الموقع، وأنه لا يوجد ما يشبه عنوان IP أو
          معرّفًا فريدًا أو بريدًا أو نصًا حرًّا.
        </p>
        {audit.violations.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-rose-700">
            {audit.violations.map((violation) => (
              <li key={violation}>· {violation}</li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/* ---------------------------------- الاستخدام ---------------------------------- */

function UsageTab({
  all,
  since7,
  since30,
  today,
  totals,
  tools,
  minDisplay,
}: {
  all: Metric[];
  since7: string;
  since30: string;
  today: string;
  totals: Record<string, number>;
  tools: { id: string; name: string; kind: string; showUsage?: boolean }[];
  minDisplay: number;
}) {
  const usesSince = (toolId: string, since: string) => {
    let total = 0;
    for (const metric of all) {
      if (metric.date < since || metric.date > today) continue;
      if (metric.props.tool === toolId && isUse(metric.event, metric.props)) total += metric.count;
    }
    return total;
  };

  return (
    <Card>
      <h2 className="font-extrabold text-slate-900">عدّاد الاستخدام العام</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        الاستخدام يُحتسب مرة واحدة لكل تبويب متصفح: عند بدء الكاشف الداخلي، أو عند فتح الخدمة الخارجية.
        العدّ يبدأ من صفر فعليًا، ولا يمكن إدخال رقم يدويًا.
      </p>

      <form action={saveUsageDisplayAction}>
        <input type="hidden" name="toolIds" value={tools.map((tool) => tool.id).join(",")} />
        <Table
          head={["الأداة", "النوع", "الإجمالي", "آخر 7 أيام", "آخر 30 يومًا", "إظهار العدّاد"]}
          rows={tools.map((tool) => [
            tool.name,
            tool.kind === "external" ? "خارجية" : "داخلية",
            totals[tool.id] ?? 0,
            usesSince(tool.id, since7),
            usesSince(tool.id, since30),
            <label key={tool.id} className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                name={`show:${tool.id}`}
                defaultChecked={tool.showUsage !== false}
                className="h-4 w-4 accent-brand-600"
              />
              <span className="text-xs text-slate-600">ظاهر</span>
            </label>,
          ])}
        />

        <div className="mt-5 grid items-end gap-3 sm:grid-cols-[minmax(0,16rem)_auto]">
          <Field
            label="الحد الأدنى لإظهار العدّاد"
            name="usageMinDisplay"
            type="number"
            defaultValue={minDisplay}
            hint="لا يظهر سطر «استُخدمت X مرة» على الأداة قبل بلوغ هذا العدد."
          />
          <button type="submit" className="btn-brand justify-self-start !py-2 text-sm">
            حفظ إعدادات العدّاد
          </button>
        </div>
      </form>
    </Card>
  );
}
