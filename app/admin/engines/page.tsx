import Link from "next/link";
import { redirect } from "next/navigation";
import Icon from "@/components/Icon";
import { isAuthenticated } from "@/lib/auth";
import { getAll, getModuleConfig, listEngines } from "@/lib/store";
import { validateEngine } from "@/lib/engine";
import { importEngineAction, updateModuleMetaAction } from "@/app/admin/actions";
import {
  Card,
  EmptyState,
  Field,
  PageHeader,
  Select,
  StatusBadge,
  TextArea,
} from "@/components/admin/Ui";
import type { CustodyRuleConfig } from "@/types/custody";

export default async function AdminEnginesPage() {
  if (!(await isAuthenticated())) redirect("/admin");

  const [engines, tools] = await Promise.all([listEngines(), getAll("tools")]);

  // الوحدات البرمجية المرتبطة بأدوات منشورة أو غير منشورة
  const moduleKeys = [
    ...new Set(
      tools
        .filter((tool) => tool.kind === "module" && tool.moduleKey)
        .map((tool) => tool.moduleKey as string),
    ),
  ];

  const modules = (
    await Promise.all(
      moduleKeys.map(async (key) => ({
        key,
        config: await getModuleConfig<CustodyRuleConfig>(key),
      })),
    )
  ).filter((entry): entry is { key: string; config: CustodyRuleConfig } =>
    entry.config !== null,
  );

  return (
    <div>
      <PageHeader
        title="محركات القرار"
        description="الأسئلة والفروع والنتائج والمصادر مخزّنة في ملفات مستقلة عن كود الموقع، ولكل محرك إصدار وحالة وسجل تعديلات وإمكانية رجوع."
      />

      {engines.length === 0 ? (
        <EmptyState message="لا توجد محركات بعد. استورد محركًا عبر ملف JSON من الأسفل." />
      ) : (
        <div className="space-y-4">
          {engines.map((engine) => {
            const issues = validateEngine(engine);
            const errors = issues.filter((issue) => issue.severity === "error").length;
            const warnings = issues.filter((issue) => issue.severity === "warning").length;

            return (
              <Card key={engine.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-extrabold text-slate-900">{engine.name}</h2>
                      <StatusBadge status={engine.status} />
                      <span className="badge bg-brand-50 text-brand-700">
                        إصدار {engine.version}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {engine.legalDomain} · {engine.questions.length} سؤال ·{" "}
                      {engine.results.length} نتيجة · {engine.sources.length} مصدر
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {engine.lastReviewedAt
                        ? `آخر مراجعة قانونية: ${engine.lastReviewedAt}${
                            engine.legalReviewer ? ` — ${engine.legalReviewer}` : ""
                          }`
                        : "لم تُسجَّل مراجعة قانونية بعد"}
                    </p>
                  </div>

                  <Link href={`/admin/engines/${engine.id}`} className="btn-brand !py-2 text-sm">
                    فتح المحرك
                  </Link>
                </div>

                {(errors > 0 || warnings > 0) && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {errors > 0 && (
                      <span className="badge bg-rose-100 text-rose-800">
                        <Icon name="alert" className="h-3.5 w-3.5" />
                        {errors} خطأ يمنع النشر الآمن
                      </span>
                    )}
                    {warnings > 0 && (
                      <span className="badge bg-amber-100 text-amber-800">
                        {warnings} تنبيه
                      </span>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* الوحدات البرمجية */}
      {modules.length > 0 && (
        <section className="mt-10">
          <h2 className="font-extrabold text-slate-900">الوحدات البرمجية</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            أدوات لا تكفيها شجرة الأسئلة الخطية، فلها كود مخصّص. قواعدها ونصوصها وحدود
            الأعمار فيها تبقى بيانات في <code>data/modules</code> قابلة للتعديل خارج الكود.
          </p>

          <div className="mt-4 space-y-4">
            {modules.map(({ key, config }) => (
              <Card key={key}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-extrabold text-slate-900">{config.name}</h3>
                  <StatusBadge status={config.status} />
                  <span className="badge bg-brand-50 text-brand-700">
                    إصدار {config.version}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {config.jurisdiction} · {config.order.length} مرشّح للحضانة · حدود الأعمار:{" "}
                  {config.ageThresholds.noClaimSplit} /{" "}
                  {config.ageThresholds.motherStrangerExemption} /{" "}
                  {config.ageThresholds.childChoice} / {config.ageThresholds.end}
                </p>

                <form action={updateModuleMetaAction} className="mt-4 space-y-4">
                  <input type="hidden" name="moduleKey" value={key} />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="رقم الإصدار" name="version" defaultValue={config.version} />
                    <Select
                      label="الحالة"
                      name="status"
                      defaultValue={config.status}
                      options={[
                        { value: "draft", label: "مسودة" },
                        { value: "review", label: "تحت المراجعة" },
                        { value: "published", label: "منشور" },
                        { value: "suspended", label: "موقوف" },
                      ]}
                    />
                    <Field
                      label="اسم المراجع القانوني"
                      name="legalReviewer"
                      defaultValue={config.legalReviewer}
                    />
                    <Field
                      label="تاريخ آخر مراجعة قانونية"
                      name="lastReviewedAt"
                      type="date"
                      defaultValue={config.lastReviewedAt}
                    />
                  </div>

                  <TextArea
                    label="مقدّمة تظهر للمستخدم"
                    name="intro"
                    defaultValue={config.intro}
                    rows={3}
                  />
                  <Field label="ملخص التعديل (يُسجَّل عند تغيير رقم الإصدار)" name="changeSummary" />

                  <button type="submit" className="btn-brand !py-2 text-sm">
                    حفظ
                  </button>
                </form>

                <details className="mt-4">
                  <summary className="cursor-pointer text-xs font-bold text-brand-700">
                    ترتيب الحاضنين وأسباب النتائج
                  </summary>
                  <ol className="mt-3 space-y-1 text-sm text-slate-700">
                    {config.order.map((entry, index) => (
                      <li key={entry.key}>
                        {index + 1}. {entry.label}{" "}
                        <span className="text-xs text-slate-400">({entry.key})</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 text-xs text-slate-500">
                    لتعديل نصوص الأسباب أو حدود الأعمار أو أرقام المواد، عدّل الملف{" "}
                    <code>data/modules/{key}.json</code>.
                  </p>
                </details>
              </Card>
            ))}
          </div>
        </section>
      )}

      <Card className="mt-8">
        <h2 className="font-extrabold text-slate-900">استيراد محرك من ملف JSON</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          الصق محتوى ملف المحرك كاملًا. إذا كان هناك محرك بنفس المعرّف فسيُؤرشف إصداره الحالي
          تلقائيًا قبل الاستبدال، فلا يضيع شيء.
        </p>

        <form action={importEngineAction} className="mt-4 space-y-3">
          <TextArea
            label="محتوى الملف"
            name="json"
            rows={8}
            placeholder='{ "id": "engine-...", "name": "...", "questions": [], "results": [], "sources": [] }'
          />
          <button type="submit" className="btn-brand !py-2 text-sm">
            استيراد
          </button>
        </form>
      </Card>
    </div>
  );
}
