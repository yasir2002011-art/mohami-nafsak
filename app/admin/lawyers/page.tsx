import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getAll, listEngines } from "@/lib/store";
import {
  deleteAssignmentAction,
  saveAssignmentAction,
  saveLawyerAction,
  toggleLawyerAction,
} from "@/app/admin/actions";
import { Card, Field, PageHeader, Select, TextArea, Toggle } from "@/components/admin/Ui";

export default async function AdminLawyersPage() {
  if (!(await isAuthenticated())) redirect("/admin");

  const [lawyers, assignments, tools, engines] = await Promise.all([
    getAll("lawyers"),
    getAll("lawyer-assignments"),
    getAll("tools"),
    listEngines(),
  ]);

  // كل النتائج في كل المحركات — لربط محامٍ بنتيجة بعينها
  const resultOptions = [
    { value: "", label: "كل النتائج" },
    ...engines.flatMap((engine) =>
      engine.results.map((result) => ({
        value: result.id,
        label: `${engine.name} — ${result.title}`,
      })),
    ),
  ];

  const toolOptions = [
    { value: "", label: "كل الأدوات" },
    ...tools.map((tool) => ({ value: tool.id, label: tool.name })),
  ];

  return (
    <div className="space-y-7">
      <PageHeader
        title="المحامون"
        description="بيانات المحامين وحالات التحقق، وربطهم بالأدوات والنتائج والمناطق. المحامي الواحد يرتبط بعدة أدوات، والأداة الواحدة بعدة محامين."
      />

      {/* إضافة محامٍ */}
      <Card>
        <h2 className="font-extrabold text-slate-900">إضافة محامٍ جديد</h2>
        <form action={saveLawyerAction} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الاسم" name="name" required />
            <Field label="رقم الترخيص" name="licenseNumber" required />
            <Field label="تاريخ انتهاء الترخيص" name="licenseExpiryDate" type="date" />
            <Field label="المدينة" name="city" />
            <Field label="المنطقة" name="region" placeholder="مثال: عسير" />
            <Field
              label="التخصصات"
              name="specialties"
              placeholder="أحوال شخصية، عمالي"
              hint="افصل بينها بفاصلة عربية «،»"
            />
            <Field label="رقم واتساب" name="whatsapp" placeholder="9665xxxxxxxx" />
            <Field label="رقم الاتصال" name="phone" />
            <Field label="البريد الإلكتروني" name="email" type="email" />
            <Field label="الموقع الإلكتروني" name="website" type="url" />
            <Field label="رابط الصورة" name="photoUrl" type="url" />
            <Field label="رابط الشعار" name="logoUrl" type="url" />
            <Select
              label="حالة التحقق"
              name="verificationStatus"
              options={[
                { value: "pending", label: "قيد التحقق" },
                { value: "verified", label: "تم التحقق" },
                { value: "unverified", label: "غير متحقق" },
              ]}
            />
            <Field label="تاريخ آخر تحقق" name="lastVerifiedAt" type="date" />
          </div>

          <TextArea label="نبذة مختصرة" name="bio" rows={2} />
          <Toggle label="الحساب فعّال" name="active" defaultChecked />

          <button type="submit" className="btn-brand !py-2 text-sm">
            إضافة المحامي
          </button>
        </form>
      </Card>

      {/* قائمة المحامين */}
      {lawyers.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-extrabold text-slate-900">
            المحامون المسجّلون ({lawyers.length})
          </h2>

          {lawyers.map((lawyer) => {
            const lawyerAssignments = assignments.filter(
              (assignment) => assignment.lawyerId === lawyer.id,
            );

            return (
              <Card key={lawyer.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-extrabold text-slate-900">{lawyer.name}</h3>
                      <span
                        className={`badge ${
                          lawyer.active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-brand-50 text-slate-600"
                        }`}
                      >
                        {lawyer.active ? "فعّال" : "موقوف"}
                      </span>
                      <span
                        className={`badge ${
                          lawyer.verificationStatus === "verified"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {lawyer.verificationStatus === "verified"
                          ? "متحقق"
                          : lawyer.verificationStatus === "pending"
                            ? "قيد التحقق"
                            : "غير متحقق"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      ترخيص {lawyer.licenseNumber} · {lawyer.city}
                      {lawyer.region ? ` · ${lawyer.region}` : ""}
                      {lawyer.licenseExpiryDate ? ` · ينتهي ${lawyer.licenseExpiryDate}` : ""}
                    </p>
                  </div>

                  <form action={toggleLawyerAction}>
                    <input type="hidden" name="id" value={lawyer.id} />
                    <button type="submit" className="btn-ghost !py-1.5 text-xs">
                      {lawyer.active ? "إيقاف (دون حذف)" : "تفعيل"}
                    </button>
                  </form>
                </div>

                {/* روابط المحامي بالأدوات */}
                <div className="mt-4 rounded-xl bg-slate-50 p-4">
                  <h4 className="text-sm font-extrabold text-slate-800">
                    الربط بالأدوات والنتائج ({lawyerAssignments.length})
                  </h4>

                  {lawyerAssignments.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {lawyerAssignments.map((assignment) => {
                        const tool = tools.find((item) => item.id === assignment.toolId);
                        return (
                          <li
                            key={assignment.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/80 px-3 py-2 text-xs"
                          >
                            <span className="text-slate-700">
                              {tool?.name ?? "كل الأدوات"}
                              {assignment.resultId ? ` · نتيجة: ${assignment.resultId}` : ""}
                              {assignment.region ? ` · ${assignment.region}` : ""}
                              {assignment.city ? ` · ${assignment.city}` : ""}
                              {assignment.endDate ? ` · حتى ${assignment.endDate}` : ""}
                            </span>
                            <span className="flex items-center gap-2">
                              <span
                                className={`badge ${
                                  assignment.placement === "sponsored"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {assignment.placement === "sponsored"
                                  ? "معلن"
                                  : "ترشيح غير مدفوع"}
                              </span>
                              <form action={deleteAssignmentAction}>
                                <input type="hidden" name="id" value={assignment.id} />
                                <button
                                  type="submit"
                                  className="font-bold text-rose-600 hover:underline"
                                >
                                  حذف
                                </button>
                              </form>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-bold text-brand-700">
                      إضافة ربط جديد
                    </summary>

                    <form action={saveAssignmentAction} className="mt-3 space-y-3">
                      <input type="hidden" name="lawyerId" value={lawyer.id} />

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Select label="الأداة" name="toolId" options={toolOptions} />
                        <Select label="النتيجة" name="resultId" options={resultOptions} />
                        <Field label="المنطقة" name="region" placeholder="اتركه فارغًا = كل المناطق" />
                        <Field label="المدينة" name="city" />
                        <Field label="نوع القضية" name="caseType" />
                        <Select
                          label="نوع الظهور"
                          name="placement"
                          options={[
                            { value: "recommended", label: "ترشيح غير مدفوع" },
                            { value: "sponsored", label: "محامٍ معلن (مدفوع)" },
                          ]}
                        />
                        <Field label="بداية الظهور" name="startDate" type="date" />
                        <Field label="نهاية الظهور" name="endDate" type="date" />
                        <Field
                          label="الأولوية"
                          name="priority"
                          type="number"
                          defaultValue={100}
                          hint="الرقم الأصغر يظهر أولًا."
                        />
                      </div>

                      <Toggle label="الربط فعّال" name="active" defaultChecked />

                      <button type="submit" className="btn-brand !py-2 text-sm">
                        حفظ الربط
                      </button>
                    </form>
                  </details>
                </div>
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
