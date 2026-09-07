import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Icon, { ACCENT_CLASSES } from "@/components/Icon";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import AdSlot from "@/components/AdSlot";
import EngineRunner from "@/components/EngineRunner";
import CustodyChecker from "@/components/CustodyChecker";
import { getAll, getEngine, getModuleConfig } from "@/lib/store";
import type { Lawyer, LawyerAssignment } from "@/types";
import type { CustodyRuleConfig } from "@/types/custody";

export async function generateStaticParams() {
  const tools = await getAll("tools");
  return tools.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tools = await getAll("tools");
  const tool = tools.find((item) => item.slug === slug);
  return { title: tool?.name ?? "أداة", description: tool?.shortDescription };
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [tools, sections, lawyers, assignments] = await Promise.all([
    getAll("tools"),
    getAll("sections"),
    getAll("lawyers"),
    getAll("lawyer-assignments"),
  ]);

  const tool = tools.find((item) => item.slug === slug && item.published);
  if (!tool) notFound();

  const section = sections.find((item) => item.id === tool.sectionId);
  const accent = ACCENT_CLASSES[section?.accent ?? "rose"];
  const engine = tool.engineId ? await getEngine(tool.engineId) : undefined;
  const moduleConfig = tool.moduleKey
    ? await getModuleConfig<CustodyRuleConfig>(tool.moduleKey)
    : null;
  const matchedLawyers = matchLawyers(lawyers, assignments, tool.id);
  const underReview =
    (tool.kind === "engine" && engine && engine.status !== "published") ||
    (tool.kind === "module" && moduleConfig && moduleConfig.status !== "published");

  return (
    <>
      <SiteHeader />

      <header className="relative overflow-hidden border-b border-slate-200">
        <div className="absolute inset-0 -z-10" style={{ background: "var(--gradient-hero)" }} />
        <div className="mx-auto max-w-3xl px-4 py-12">
          <nav className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-slate-500">
            <Link href="/" className="hover:text-brand-700">
              الرئيسية
            </Link>
            <span>←</span>
            {section && (
              <>
                <Link href={`/sections/${section.slug}`} className="hover:text-brand-700">
                  {section.name}
                </Link>
                <span>←</span>
              </>
            )}
            <span className="text-slate-800">{tool.name}</span>
          </nav>

          <div className="mt-6 flex items-start gap-4">
            <span
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${accent.grad} text-white shadow-lg`}
            >
              <Icon name={tool.icon} className="h-7 w-7" />
            </span>
            <div>
              <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">{tool.name}</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{tool.description}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        {/* إعلانات Google ممنوعة في صفحات الأدوات ذات النتائج الحساسة */}
        <AdSlot
          placement="tool-intro"
          toolId={tool.id}
          sectionId={tool.sectionId}
          allowGoogleAds={tool.allowGoogleAds}
        />

        {underReview && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border-2 border-amber-200 bg-amber-50/80 p-4">
            <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-sm leading-relaxed text-amber-900">
              <span className="font-extrabold">هذه الأداة قيد المراجعة القانونية.</span>{" "}
              المسارات والنتائج معروضة للتجربة، ولم تُعتمد أرقام المواد وروابط المصادر الرسمية
              بعد. لا تعتمد عليها في اتخاذ قرار قبل اعتمادها.
            </p>
          </div>
        )}

        {tool.kind === "engine" && engine && (
          <EngineRunner engine={engine} toolId={tool.id} lawyers={matchedLawyers} />
        )}

        {tool.kind === "module" && moduleConfig && (
          <CustodyChecker config={moduleConfig} toolId={tool.id} lawyers={matchedLawyers} />
        )}

        {tool.kind === "module" && !moduleConfig && (
          <Placeholder
            title="الوحدة غير متوفرة"
            message="لم يُعثر على ملف قواعد هذه الوحدة في مجلد data/modules."
          />
        )}

        {tool.kind === "engine" && !engine && (
          <Placeholder
            title="محرك القرار غير متوفر"
            message="لم يُربط هذا التعريف بمحرك قرار بعد. أضِف المحرك من لوحة الإدارة."
          />
        )}

        {tool.kind === "external" && (
          <ExternalTool
            name={tool.name}
            url={tool.externalUrl}
            provider={tool.externalProvider}
          />
        )}

        {tool.kind === "faq" && (
          <FaqTool items={tool.faq ?? []} />
        )}
      </main>

      <SiteFooter />
    </>
  );
}

/**
 * اختيار المحامين المناسبين للأداة.
 * العلاقة متعدد-إلى-متعدد، والترتيب: المطابقة الأدق أولًا ثم الأولوية.
 * المحامي المعلن والمحامي المقترح يبقيان مميّزين بوضوح في الواجهة.
 */
function matchLawyers(
  lawyers: Lawyer[],
  assignments: LawyerAssignment[],
  toolId: string,
): (Lawyer & { placement: "sponsored" | "recommended" })[] {
  const now = Date.now();

  const live = assignments.filter((assignment) => {
    if (!assignment.active) return false;
    if (assignment.toolId && assignment.toolId !== toolId) return false;
    if (assignment.startDate && new Date(assignment.startDate).getTime() > now) return false;
    if (assignment.endDate && new Date(assignment.endDate).getTime() < now) return false;
    return true;
  });

  return live
    .sort((a, b) => a.priority - b.priority)
    .map((assignment) => {
      const lawyer = lawyers.find(
        (candidate) => candidate.id === assignment.lawyerId && candidate.active,
      );
      return lawyer ? { ...lawyer, placement: assignment.placement } : null;
    })
    .filter((lawyer): lawyer is Lawyer & { placement: "sponsored" | "recommended" } =>
      lawyer !== null,
    )
    .slice(0, 4);
}

function ExternalTool({
  name,
  url,
  provider,
}: {
  name: string;
  url?: string;
  provider?: string;
}) {
  if (!url) {
    return (
      <Placeholder
        title="بانتظار ربط الجهة الرسمية"
        message={`أداة «${name}» جاهزة، وينقصها فقط رابط الجهة الرسمية. أضِف الرابط من لوحة الإدارة لتُنشر مباشرة.`}
      />
    );
  }

  return (
    <div className="card-soft p-8 text-center">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-700">
        <Icon name="calculator" className="h-8 w-8" />
      </span>
      <h2 className="mt-5 text-xl font-extrabold text-slate-900">{name}</h2>
      {provider && (
        <p className="mt-1.5 text-sm text-slate-600">الجهة المقدّمة: {provider}</p>
      )}
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">
        هذه الخدمة تُقدَّم عبر موقع خارجي. سيفتح الرابط في نافذة جديدة، والمنصة ليست مسؤولة عن
        محتوى الموقع الخارجي أو نتائجه.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-brand mt-6"
      >
        فتح الخدمة الرسمية
        <Icon name="arrow" className="h-4 w-4 rotate-180" />
      </a>
    </div>
  );
}

function FaqTool({
  items,
}: {
  items: { id: string; question: string; answer: string; sourceUrl?: string; sourceName?: string }[];
}) {
  if (items.length === 0) {
    return (
      <Placeholder
        title="بانتظار إضافة الأسئلة"
        message="هذه الصفحة جاهزة لاستقبال الأسئلة والأجوبة وروابط مصادرها الرسمية من لوحة الإدارة."
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <details key={item.id} className="card-soft group p-5">
          <summary className="cursor-pointer list-none font-extrabold text-slate-900">
            <span className="flex items-center justify-between gap-3">
              {item.question}
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition group-open:rotate-90">
                <Icon name="arrow" className="h-4 w-4 -rotate-90" />
              </span>
            </span>
          </summary>
          <p className="mt-3 text-sm leading-loose text-slate-600">{item.answer}</p>
          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm font-bold text-brand-700 hover:underline"
            >
              المصدر: {item.sourceName ?? "الجهة الرسمية"}
            </a>
          )}
        </details>
      ))}
    </div>
  );
}

function Placeholder({ title, message }: { title: string; message: string }) {
  return (
    <div className="card-soft flex flex-col items-center gap-3 p-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-slate-500">
        <Icon name="clock" className="h-7 w-7" />
      </span>
      <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
      <p className="max-w-md text-sm leading-relaxed text-slate-600">{message}</p>
    </div>
  );
}
