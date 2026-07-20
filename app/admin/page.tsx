import Link from "next/link";
import Icon from "@/components/Icon";
import LoginForm from "@/components/admin/LoginForm";
import { isAuthenticated } from "@/lib/auth";
import { getAll, getModuleConfig, listEngines, getSettings } from "@/lib/store";
import { validateEngine } from "@/lib/engine";

export default async function AdminHome() {
  if (!(await isAuthenticated())) {
    return <LoginForm />;
  }

  const [tools, engines, lawyers, referrals, reports, articles, ads, settings] =
    await Promise.all([
      getAll("tools"),
      listEngines(),
      getAll("lawyers"),
      getAll("referrals"),
      getAll("error-reports"),
      getAll("articles"),
      getAll("ads"),
      getSettings(),
    ]);

  const publishedTools = tools.filter((tool) => tool.published).length;
  const newReferrals = referrals.filter((referral) => referral.status === "new").length;
  const newReports = reports.filter((report) => report.status === "new").length;
  const draftEngines = engines.filter((engine) => engine.status !== "published");

  // تنبيهات تحتاج تدخّلًا
  const alerts: { text: string; href: string }[] = [];

  for (const engine of engines) {
    const issues = validateEngine(engine).filter((issue) => issue.severity === "error");
    if (issues.length > 0) {
      alerts.push({
        text: `محرك «${engine.name}»: ${issues.length} خطأ يمنع النشر الآمن.`,
        href: `/admin/engines/${engine.id}`,
      });
    }
    if (!engine.lastReviewedAt) {
      alerts.push({
        text: `محرك «${engine.name}» لم تُسجَّل له مراجعة قانونية بعد.`,
        href: `/admin/engines/${engine.id}`,
      });
    }
  }

  // الوحدات البرمجية تخضع لنفس حوكمة المراجعة القانونية
  for (const key of new Set(
    tools
      .filter((tool) => tool.kind === "module" && tool.moduleKey)
      .map((tool) => tool.moduleKey as string),
  )) {
    const config = await getModuleConfig<{ name: string; lastReviewedAt?: string }>(key);
    if (config && !config.lastReviewedAt) {
      alerts.push({
        text: `وحدة «${config.name}» لم تُسجَّل لها مراجعة قانونية بعد.`,
        href: "/admin/engines",
      });
    }
  }

  const unlinkedTools = tools.filter(
    (tool) => tool.kind === "external" && !tool.externalUrl,
  );
  if (unlinkedTools.length > 0) {
    alerts.push({
      text: `${unlinkedTools.length} أداة بانتظار رابط الجهة الرسمية.`,
      href: "/admin/tools",
    });
  }

  if (!settings.contactEmail) {
    alerts.push({ text: "لم يُضَف بريد التواصل بعد.", href: "/admin/settings" });
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-black text-slate-900">نظرة عامة</h1>
        <p className="mt-1 text-sm text-slate-600">
          حالة المنصة الآن، وما يحتاج إلى تدخّلك.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="أدوات منشورة" value={publishedTools} total={tools.length} icon="briefcase" accent="rose" />
        <Stat label="محركات قرار" value={engines.length} sub={`${draftEngines.length} قيد الإعداد`} icon="gavel" accent="violet" />
        <Stat label="محامون" value={lawyers.filter((l) => l.active).length} total={lawyers.length} icon="users" accent="mint" />
        <Stat label="إحالات جديدة" value={newReferrals} total={referrals.length} icon="arrow" accent="amber" />
        <Stat label="مقالات منشورة" value={articles.filter((a) => a.status === "published").length} total={articles.length} icon="scroll" accent="sky" />
        <Stat label="إعلانات فعّالة" value={ads.filter((ad) => ad.active).length} total={ads.length} icon="sparkle" accent="coral" />
        <Stat label="بلاغات جديدة" value={newReports} total={reports.length} icon="alert" accent="rose" />
      </div>

      {alerts.length > 0 && (
        <section className="rounded-2xl border-2 border-amber-200 bg-amber-50/70 p-5">
          <h2 className="flex items-center gap-2 font-extrabold text-amber-900">
            <Icon name="alert" className="h-5 w-5" />
            يحتاج انتباهك ({alerts.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {alerts.map((alert) => (
              <li key={alert.text}>
                <Link
                  href={alert.href}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white/80 px-4 py-2.5 text-sm text-amber-900 transition hover:bg-white"
                >
                  {alert.text}
                  <Icon name="arrow" className="h-4 w-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-extrabold text-slate-900">اختصارات</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { href: "/admin/engines", label: "مراجعة محركات القرار", icon: "gavel" },
            { href: "/admin/lawyers", label: "إضافة محامٍ", icon: "users" },
            { href: "/admin/articles", label: "كتابة مقال", icon: "scroll" },
            { href: "/admin/ads", label: "إضافة إعلان", icon: "sparkle" },
            { href: "/admin/tools", label: "ربط أداة برابط رسمي", icon: "briefcase" },
            { href: "/admin/analytics", label: "عرض الإحصاءات", icon: "chart" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="card-soft card-hover flex items-center gap-3 p-4 text-sm font-bold text-slate-800"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <Icon name={item.icon} className="h-4 w-4" />
              </span>
              {item.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

const STAT_ACCENTS = {
  rose: "bg-brand-50 text-brand-700",
  violet: "bg-brand-50 text-slate-600",
  mint: "bg-emerald-100 text-emerald-600",
  amber: "bg-amber-100 text-amber-600",
  sky: "bg-sky-100 text-sky-600",
  coral: "bg-orange-100 text-orange-600",
} as const;

function Stat({
  label,
  value,
  total,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: number;
  total?: number;
  sub?: string;
  icon: string;
  accent: keyof typeof STAT_ACCENTS;
}) {
  return (
    <div className="card-soft p-5">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${STAT_ACCENTS[accent]}`}>
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="mt-3 text-2xl font-black text-slate-900">
        {value}
        {total !== undefined && (
          <span className="text-base font-bold text-slate-400"> / {total}</span>
        )}
      </p>
      <p className="text-xs font-bold text-slate-500">{label}</p>
      {sub && <p className="mt-1 text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}
