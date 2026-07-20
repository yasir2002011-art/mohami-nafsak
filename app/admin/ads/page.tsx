import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getAll } from "@/lib/store";
import { deleteAdAction, saveAdAction } from "@/app/admin/actions";
import { Card, Field, PageHeader, Select, TextArea, Toggle } from "@/components/admin/Ui";

const PLACEMENTS = [
  { value: "home-top", label: "الرئيسية — أعلى" },
  { value: "home-mid", label: "الرئيسية — الوسط" },
  { value: "section-top", label: "صفحة القسم — أعلى" },
  { value: "tool-intro", label: "صفحة الأداة — المقدّمة" },
  { value: "article-inline", label: "داخل المقال" },
  { value: "article-sidebar", label: "قائمة المقالات" },
  { value: "footer", label: "التذييل" },
];

const TYPES = [
  { value: "lawyer", label: "إعلان محامٍ" },
  { value: "sponsor", label: "إعلان معلن" },
  { value: "google", label: "إعلان Google" },
];

export default async function AdminAdsPage() {
  if (!(await isAuthenticated())) redirect("/admin");

  const [ads, tools, sections] = await Promise.all([
    getAll("ads"),
    getAll("tools"),
    getAll("sections"),
  ]);

  const toolOptions = [
    { value: "", label: "كل الأدوات" },
    ...tools.map((tool) => ({ value: tool.id, label: tool.name })),
  ];
  const sectionOptions = [
    { value: "", label: "كل الأقسام" },
    ...sections.map((section) => ({ value: section.id, label: section.name })),
  ];

  return (
    <div className="space-y-7">
      <PageHeader
        title="الإعلانات"
        description="ثلاثة أنواع منفصلة: إعلان Google، إعلان محامٍ، ترشيح غير مدفوع. كل إعلان يظهر بعلامة «إعلان» أو «محتوى مدفوع»، ولا تظهر إعلانات Google داخل صفحات النتائج الحساسة."
      />

      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/70 p-4 text-sm leading-relaxed text-amber-900">
        <span className="font-extrabold">قاعدة ثابتة في النظام:</span> إعلانات Google محجوبة
        تلقائيًا في أي أداة خيار «السماح بإعلانات Google» فيها مغلق (مثل الحضانة وفسخ النكاح)،
        حتى لو أضفت الإعلان هنا. صفحة النتيجة تبقى نظيفة.
      </div>

      <Card>
        <h2 className="font-extrabold text-slate-900">إعلان جديد</h2>
        <form action={saveAdAction} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم المعلن" name="advertiserName" required />
            <Select label="نوع الإعلان" name="type" options={TYPES} />
            <Field label="رابط الصورة" name="imageUrl" type="url" />
            <Field label="الرابط المستهدف" name="targetUrl" type="url" placeholder="https://..." />
            <Select label="مكان الظهور" name="placement" options={PLACEMENTS} />
            <Select label="الأداة المرتبطة" name="toolId" options={toolOptions} />
            <Select label="القسم المرتبط" name="sectionId" options={sectionOptions} />
            <Field label="تاريخ البداية" name="startDate" type="date" />
            <Field label="تاريخ النهاية" name="endDate" type="date" />
            <Field label="الميزانية أو قيمة الاتفاق" name="budget" type="number" />
          </div>

          <TextArea label="ملاحظات" name="notes" rows={2} />
          <Toggle label="الإعلان فعّال" name="active" defaultChecked />

          <button type="submit" className="btn-brand !py-2 text-sm">
            إضافة الإعلان
          </button>
        </form>
      </Card>

      {ads.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-extrabold text-slate-900">الإعلانات ({ads.length})</h2>

          {ads.map((ad) => {
            const ctr = ad.impressions > 0 ? Math.round((ad.clicks / ad.impressions) * 100) : 0;

            return (
              <Card key={ad.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-extrabold text-slate-900">{ad.advertiserName}</h3>
                      <span className="badge bg-brand-50 text-brand-700">
                        {TYPES.find((type) => type.value === ad.type)?.label}
                      </span>
                      <span
                        className={`badge ${
                          ad.active ? "bg-emerald-100 text-emerald-800" : "bg-brand-50 text-slate-600"
                        }`}
                      >
                        {ad.active ? "فعّال" : "موقوف"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {PLACEMENTS.find((placement) => placement.value === ad.placement)?.label}
                      {ad.endDate ? ` · حتى ${ad.endDate}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-center">
                    <div>
                      <p className="text-lg font-black text-slate-800">{ad.impressions}</p>
                      <p className="text-[10px] font-bold text-slate-400">ظهور</p>
                    </div>
                    <div>
                      <p className="text-lg font-black text-brand-700">{ad.clicks}</p>
                      <p className="text-[10px] font-bold text-slate-400">نقرة</p>
                    </div>
                    <div>
                      <p className="text-lg font-black text-emerald-600">{ctr}%</p>
                      <p className="text-[10px] font-bold text-slate-400">نسبة النقر</p>
                    </div>
                  </div>
                </div>

                <details className="mt-4">
                  <summary className="cursor-pointer text-xs font-bold text-brand-700">
                    تعديل
                  </summary>

                  <form action={saveAdAction} className="mt-3 space-y-3">
                    <input type="hidden" name="id" value={ad.id} />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="اسم المعلن" name="advertiserName" defaultValue={ad.advertiserName} />
                      <Select label="نوع الإعلان" name="type" defaultValue={ad.type} options={TYPES} />
                      <Field label="رابط الصورة" name="imageUrl" type="url" defaultValue={ad.imageUrl} />
                      <Field label="الرابط المستهدف" name="targetUrl" type="url" defaultValue={ad.targetUrl} />
                      <Select label="مكان الظهور" name="placement" defaultValue={ad.placement} options={PLACEMENTS} />
                      <Select label="الأداة المرتبطة" name="toolId" defaultValue={ad.toolId} options={toolOptions} />
                      <Select label="القسم المرتبط" name="sectionId" defaultValue={ad.sectionId} options={sectionOptions} />
                      <Field label="تاريخ البداية" name="startDate" type="date" defaultValue={ad.startDate} />
                      <Field label="تاريخ النهاية" name="endDate" type="date" defaultValue={ad.endDate} />
                      <Field label="الميزانية" name="budget" type="number" defaultValue={ad.budget} />
                    </div>

                    <TextArea label="ملاحظات" name="notes" defaultValue={ad.notes} rows={2} />
                    <Toggle label="الإعلان فعّال" name="active" defaultChecked={ad.active} />

                    <button type="submit" className="btn-brand !py-2 text-sm">
                      حفظ
                    </button>
                  </form>

                  <form action={deleteAdAction} className="mt-2">
                    <input type="hidden" name="id" value={ad.id} />
                    <button type="submit" className="text-xs font-bold text-rose-600 hover:underline">
                      حذف الإعلان
                    </button>
                  </form>
                </details>
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
