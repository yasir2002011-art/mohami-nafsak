import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getAll } from "@/lib/store";
import { updateReportStatusAction } from "@/app/admin/actions";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/admin/Ui";

const KIND_LABELS: Record<string, string> = {
  "legal-update": "تحديث نظامي",
  "wrong-result": "نتيجة غير مناسبة",
  "broken-link": "رابط لا يعمل",
  other: "أخرى",
};

export default async function AdminReportsPage() {
  if (!(await isAuthenticated())) redirect("/admin");

  const [reports, tools] = await Promise.all([getAll("error-reports"), getAll("tools")]);
  const sorted = [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-7">
      <PageHeader
        title="بلاغات الأخطاء والتحديثات النظامية"
        description="ما يرسله المستخدمون من زر «الإبلاغ عن خطأ أو تحديث نظامي» أسفل كل نتيجة. بلاغ «تحديث نظامي» يعني غالبًا أن محرك القرار يحتاج مراجعة عاجلة."
      />

      {sorted.length === 0 ? (
        <EmptyState message="لا توجد بلاغات." />
      ) : (
        <div className="space-y-3">
          {sorted.map((report) => {
            const tool = tools.find((item) => item.id === report.toolId);

            return (
              <Card key={report.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`badge ${
                          report.kind === "legal-update"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-brand-50 text-brand-700"
                        }`}
                      >
                        {KIND_LABELS[report.kind]}
                      </span>
                      <StatusBadge status={report.status} />
                      {tool && <span className="text-xs text-slate-500">{tool.name}</span>}
                    </div>

                    <p className="mt-2 text-sm leading-relaxed text-slate-800">{report.message}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {new Date(report.createdAt).toLocaleString("ar-SA")}
                      {report.contactEmail ? ` · ${report.contactEmail}` : ""}
                    </p>
                  </div>

                  <form action={updateReportStatusAction} className="flex items-end gap-2">
                    <input type="hidden" name="id" value={report.id} />
                    <select
                      name="status"
                      defaultValue={report.status}
                      className="field !w-auto !py-1.5 text-xs"
                    >
                      <option value="new">جديد</option>
                      <option value="reviewing">قيد المراجعة</option>
                      <option value="resolved">تمت المعالجة</option>
                      <option value="rejected">مرفوض</option>
                    </select>
                    <button type="submit" className="btn-brand !px-4 !py-1.5 text-xs">
                      تحديث
                    </button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
