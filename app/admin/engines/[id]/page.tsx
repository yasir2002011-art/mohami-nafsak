import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Icon from "@/components/Icon";
import { isAuthenticated } from "@/lib/auth";
import { getEngine, listEngineVersions } from "@/lib/store";
import { validateEngine } from "@/lib/engine";
import { updateEngineMetaAction, updateSourceAction } from "@/app/admin/actions";
import {
  Card,
  Field,
  PageHeader,
  Select,
  StatusBadge,
  TextArea,
  Toggle,
} from "@/components/admin/Ui";

export default async function EngineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/admin");

  const { id } = await params;
  const engine = await getEngine(id);
  if (!engine) notFound();

  const issues = validateEngine(engine);
  const versions = await listEngineVersions(engine.id);

  return (
    <div className="space-y-7">
      <div>
        <Link href="/admin/engines" className="text-sm font-bold text-slate-500 hover:text-brand-700">
          محركات القرار ←
        </Link>
        <PageHeader
          title={engine.name}
          description={`${engine.legalDomain} · ${engine.jurisdiction}`}
        />
      </div>

      {/* فحص السلامة قبل النشر */}
      <Card>
        <h2 className="flex items-center gap-2 font-extrabold text-slate-900">
          <Icon name="shield" className="h-5 w-5 text-slate-500" />
          فحص سلامة الشجرة
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          تعديل الشجرة دون فحص قد يجعل تغييرًا صغيرًا يعطي نتائج خاطئة للناس. راجع هذه القائمة
          قبل تغيير الحالة إلى «منشور».
        </p>

        {issues.length === 0 ? (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
            لا توجد مشكلات. الشجرة مترابطة وكل نتيجة قابلة للوصول ولها مصدر.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {issues.map((issue, index) => (
              <li
                key={index}
                className={`rounded-xl px-4 py-2.5 text-sm ${
                  issue.severity === "error"
                    ? "bg-rose-50 text-rose-800"
                    : "bg-amber-50 text-amber-900"
                }`}
              >
                <span className="font-extrabold">
                  {issue.severity === "error" ? "خطأ: " : "تنبيه: "}
                </span>
                {issue.message}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* بيانات الإصدار والحوكمة */}
      <Card>
        <h2 className="font-extrabold text-slate-900">الإصدار والمراجعة القانونية</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          تغيير رقم الإصدار يؤرشف الإصدار الحالي تلقائيًا ويضيف قيدًا في سجل التعديلات، فيبقى
          الرجوع إلى إصدار سابق ممكنًا.
        </p>

        <form action={updateEngineMetaAction} className="mt-5 space-y-4">
          <input type="hidden" name="id" value={engine.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="رقم الإصدار"
              name="version"
              defaultValue={engine.version}
              hint="غيّره عند أي تعديل جوهري على الشجرة."
            />
            <Select
              label="الحالة"
              name="status"
              defaultValue={engine.status}
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
              defaultValue={engine.legalReviewer}
            />
            <Field
              label="تاريخ آخر مراجعة قانونية"
              name="lastReviewedAt"
              type="date"
              defaultValue={engine.lastReviewedAt}
            />
            <Field
              label="بدء العمل بالإصدار"
              name="effectiveFrom"
              type="date"
              defaultValue={engine.effectiveFrom}
            />
            <Field
              label="انتهاء العمل بالإصدار"
              name="effectiveTo"
              type="date"
              defaultValue={engine.effectiveTo}
              hint="اتركه فارغًا إذا كان الإصدار ساريًا."
            />
          </div>

          <TextArea
            label="مقدّمة تظهر للمستخدم"
            name="intro"
            defaultValue={engine.intro}
            rows={3}
          />
          <Field
            label="ملخص التعديل (يُسجَّل عند تغيير رقم الإصدار)"
            name="changeSummary"
            placeholder="مثال: تعديل فرع الحضانة بعد تحديث المادة ..."
          />

          <button type="submit" className="btn-brand !py-2 text-sm">
            حفظ بيانات الإصدار
          </button>
        </form>
      </Card>

      {/* المصادر النظامية */}
      <Card>
        <h2 className="font-extrabold text-slate-900">المصادر النظامية</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          أكمل رقم المادة ورابط المصدر الرسمي، ثم علّم «تم التحقق». المصادر غير المتحقق منها
          تظهر للمستخدم بعلامة «بانتظار المراجعة القانونية».
        </p>

        <div className="mt-5 space-y-5">
          {engine.sources.map((source) => (
            <form
              key={source.id}
              action={updateSourceAction}
              className="rounded-2xl border border-slate-200 bg-white/70 p-4"
            >
              <input type="hidden" name="engineId" value={engine.id} />
              <input type="hidden" name="sourceId" value={source.id} />

              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-sm font-extrabold text-slate-800">{source.regulation}</span>
                <span
                  className={`badge ${
                    source.verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {source.verified ? "تم التحقق" : "بانتظار التحقق"}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="النظام أو اللائحة" name="regulation" defaultValue={source.regulation} />
                <Field
                  label="رقم المادة"
                  name="article"
                  defaultValue={source.article}
                  placeholder="مثال: 55"
                />
                <Field
                  label="رابط المصدر الرسمي"
                  name="url"
                  type="url"
                  defaultValue={source.url}
                  placeholder="https://..."
                />
                <Field
                  label="تاريخ إصدار أو تحديث القاعدة"
                  name="issuedAt"
                  type="date"
                  defaultValue={source.issuedAt}
                />
                <Field
                  label="تاريخ آخر مراجعة"
                  name="lastReviewedAt"
                  type="date"
                  defaultValue={source.lastReviewedAt}
                />
              </div>

              <div className="mt-3">
                <TextArea label="نص المادة أو ملخصها" name="text" defaultValue={source.text} rows={2} />
              </div>

              <div className="mt-3">
                <Toggle
                  label="تم التحقق من رقم المادة ونصها ورابطها"
                  name="verified"
                  defaultChecked={source.verified}
                />
              </div>

              <button type="submit" className="btn-brand mt-3 !py-2 text-sm">
                حفظ المصدر
              </button>
            </form>
          ))}
        </div>
      </Card>

      {/* الأسئلة والنتائج — عرض */}
      <Card>
        <h2 className="font-extrabold text-slate-900">الأسئلة والفروع</h2>
        <p className="mt-1 text-xs text-slate-500">
          لتعديل الشجرة نفسها استخدم الاستيراد من صفحة المحركات (ملف JSON).
        </p>

        <ol className="mt-4 space-y-3">
          {engine.questions.map((question, index) => (
            <li key={question.id} className="rounded-xl bg-slate-50 p-4">
              <div className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-xs font-black text-slate-700">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-900">{question.text}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {question.id} · {question.type}
                    {question.showIf?.length ? " · مشروط الظهور" : ""}
                  </p>

                  {question.options && (
                    <ul className="mt-2 space-y-1">
                      {question.options.map((option) => (
                        <li key={option.id} className="text-xs text-brand-700">
                          ← {option.label}
                          <span className="text-slate-400">
                            {option.next
                              ? ` ⟵ ${option.next.type === "result" ? "نتيجة" : "سؤال"}: ${option.next.id}`
                              : " ⟵ المسار الافتراضي"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>

        <h3 className="mt-7 font-extrabold text-slate-900">النتائج</h3>
        <ul className="mt-3 space-y-2">
          {engine.results.map((result) => (
            <li key={result.id} className="rounded-xl bg-brand-50/50 p-3">
              <p className="text-sm font-bold text-slate-900">{result.title}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {result.id} · {result.sourceIds.length} مصدر
                {result.urgentNotice ? " · يحتوي تنبيه مهلة عاجل" : ""}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      {/* سجل التعديلات والإصدارات المؤرشفة */}
      <Card>
        <h2 className="font-extrabold text-slate-900">سجل التعديلات</h2>
        <ul className="mt-4 space-y-2">
          {engine.changelog.map((entry) => (
            <li key={entry.id} className="rounded-xl bg-white/70 p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="badge bg-brand-50 text-brand-700">{entry.version}</span>
                <span className="text-xs text-slate-400">
                  {entry.date} · {entry.author}
                </span>
              </div>
              <p className="mt-1.5 text-slate-700">{entry.summary}</p>
            </li>
          ))}
        </ul>

        {versions.length > 0 && (
          <>
            <h3 className="mt-6 text-sm font-extrabold text-slate-900">
              الإصدارات المؤرشفة ({versions.length})
            </h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {versions.map((version) => (
                <li key={version.version} className="badge bg-brand-50 text-brand-700">
                  <StatusBadge status={version.status} />
                  إصدار {version.version}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-400">
              للرجوع إلى إصدار سابق: افتح ملفه من مجلد data/engine-versions واستورده من صفحة
              المحركات.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
