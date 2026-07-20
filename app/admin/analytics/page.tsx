import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getAll, listEngines } from "@/lib/store";
import { buildToolFunnels, countBy } from "@/lib/analytics";
import { Card, EmptyState, PageHeader } from "@/components/admin/Ui";

export default async function AdminAnalyticsPage() {
  if (!(await isAuthenticated())) redirect("/admin");

  const [events, tools, lawyers, ads, engines] = await Promise.all([
    getAll("analytics"),
    getAll("tools"),
    getAll("lawyers"),
    getAll("ads"),
    listEngines(),
  ]);

  const funnels = buildToolFunnels(events);
  const topResults = countBy(events, "tool_complete", (event) => event.resultId);
  const lawyerClicks = countBy(events, "lawyer_click", (event) => event.lawyerId);
  const copies = events.filter((event) => event.type === "result_copy").length;

  const nameOfTool = (id?: string) =>
    tools.find((tool) => tool.id === id)?.name ?? id ?? "—";

  const nameOfResult = (id: string) => {
    for (const engine of engines) {
      const result = engine.results.find((item) => item.id === id);
      if (result) return result.title;
    }
    return id;
  };

  const nameOfQuestion = (id?: string) => {
    if (!id) return "—";
    for (const engine of engines) {
      const question = engine.questions.find((item) => item.id === id);
      if (question) return question.text;
    }
    return id;
  };

  return (
    <div className="space-y-7">
      <PageHeader
        title="الإحصاءات"
        description="أرقام مجهولة الهوية تظهر لك وحدك. لا تُربط بأي مستخدم ولا تحتوي أي تفاصيل قضية."
      />

      {events.length === 0 ? (
        <EmptyState message="لا توجد بيانات بعد. ستظهر الأرقام بمجرد بدء الزوار باستخدام الأدوات." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-2xl font-black text-slate-900">{events.length}</p>
              <p className="text-xs font-bold text-slate-500">إجمالي الأحداث المسجّلة</p>
            </Card>
            <Card>
              <p className="text-2xl font-black text-brand-700">{copies}</p>
              <p className="text-xs font-bold text-slate-500">مرات نسخ النتيجة</p>
            </Card>
            <Card>
              <p className="text-2xl font-black text-emerald-600">
                {events.filter((event) => event.type === "referral_created").length}
              </p>
              <p className="text-xs font-bold text-slate-500">إحالات إلى محامين</p>
            </Card>
          </div>

          {/* قمع الأدوات */}
          <Card>
            <h2 className="font-extrabold text-slate-900">مسار المستخدم في كل أداة</h2>
            <div className="mt-4 space-y-4">
              {funnels.map((funnel) => (
                <div key={funnel.toolId} className="rounded-xl bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold text-slate-900">{nameOfTool(funnel.toolId)}</h3>
                    <span className="badge bg-emerald-100 text-emerald-800">
                      نسبة الإكمال {funnel.completionRate}%
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-white/80 py-2">
                      <p className="font-black text-slate-800">{funnel.views}</p>
                      <p className="text-[10px] font-bold text-slate-400">زيارة</p>
                    </div>
                    <div className="rounded-lg bg-white/80 py-2">
                      <p className="font-black text-slate-800">{funnel.starts}</p>
                      <p className="text-[10px] font-bold text-slate-400">بدأوا الأسئلة</p>
                    </div>
                    <div className="rounded-lg bg-white/80 py-2">
                      <p className="font-black text-slate-800">{funnel.completions}</p>
                      <p className="text-[10px] font-bold text-slate-400">أكملوا</p>
                    </div>
                  </div>

                  {funnel.dropOffQuestionId && (
                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <span className="font-extrabold">أكثر سؤال ينسحب عنده المستخدمون:</span>{" "}
                      {nameOfQuestion(funnel.dropOffQuestionId)} ({funnel.dropOffCount} مرة)
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="font-extrabold text-slate-900">أكثر النتائج ظهورًا</h2>
              <ul className="mt-3 space-y-2">
                {topResults.slice(0, 8).map((entry) => (
                  <li
                    key={entry.key}
                    className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-800">{nameOfResult(entry.key)}</span>
                    <span className="font-black text-brand-700">{entry.count}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h2 className="font-extrabold text-slate-900">النقرات على المحامين</h2>
              <ul className="mt-3 space-y-2">
                {lawyerClicks.slice(0, 8).map((entry) => (
                  <li
                    key={entry.key}
                    className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-800">
                      {lawyers.find((lawyer) => lawyer.id === entry.key)?.name ?? entry.key}
                    </span>
                    <span className="font-black text-brand-700">{entry.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {ads.length > 0 && (
            <Card>
              <h2 className="font-extrabold text-slate-900">أداء الإعلانات</h2>
              <ul className="mt-3 space-y-2">
                {ads.map((ad) => (
                  <li
                    key={ad.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-800">{ad.advertiserName}</span>
                    <span className="text-xs text-slate-600">
                      {ad.impressions} ظهور · {ad.clicks} نقرة
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
