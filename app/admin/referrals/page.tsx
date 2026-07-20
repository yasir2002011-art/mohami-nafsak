import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getAll } from "@/lib/store";
import { updateReferralStatusAction } from "@/app/admin/actions";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/admin/Ui";

const STATUS_OPTIONS = [
  { value: "new", label: "جديدة" },
  { value: "contacted", label: "تم التواصل" },
  { value: "not-suitable", label: "غير مناسبة" },
  { value: "converted", label: "تحوّلت إلى عميل" },
];

export default async function AdminReferralsPage() {
  if (!(await isAuthenticated())) redirect("/admin");

  const [referrals, lawyers, tools] = await Promise.all([
    getAll("referrals"),
    getAll("lawyers"),
    getAll("tools"),
  ]);

  const sorted = [...referrals].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // عدد الإحالات لكل محامٍ
  const perLawyer = lawyers
    .map((lawyer) => ({
      lawyer,
      count: referrals.filter((referral) => referral.lawyerId === lawyer.id).length,
      converted: referrals.filter(
        (referral) => referral.lawyerId === lawyer.id && referral.status === "converted",
      ).length,
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-7">
      <PageHeader
        title="الإحالات"
        description="سجل التحويلات إلى المحامين: من أي أداة ونتيجة ومتى. لا تُحفظ هنا أي تفاصيل عن القضية — فقط موضوعها العام."
      />

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm leading-relaxed text-teal-900">
        <span className="font-extrabold">ملاحظة خصوصية:</span> «موافقة المستخدم» هنا تعني أنه
        وافق على أن يشارك المحامي ملخص حالته بنفسه داخل المحادثة. المنصة لا ترسل أي وقائع ولا
        أسماء ولا مستندات في أي حال.
      </div>

      {perLawyer.length > 0 && (
        <Card>
          <h2 className="font-extrabold text-slate-900">الإحالات لكل محامٍ</h2>
          <ul className="mt-3 space-y-2">
            {perLawyer.map((entry) => (
              <li
                key={entry.lawyer.id}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-sm"
              >
                <span className="font-bold text-slate-800">{entry.lawyer.name}</span>
                <span className="text-xs text-slate-600">
                  {entry.count} إحالة · {entry.converted} تحوّلت إلى عميل
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {sorted.length === 0 ? (
        <EmptyState message="لا توجد إحالات بعد." />
      ) : (
        <div className="space-y-3">
          {sorted.map((referral) => {
            const lawyer = lawyers.find((item) => item.id === referral.lawyerId);
            const tool = tools.find((item) => item.id === referral.toolId);

            return (
              <Card key={referral.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-slate-900">
                        {lawyer?.name ?? "محامٍ محذوف"}
                      </span>
                      <StatusBadge status={referral.status} />
                      {referral.consentGiven && (
                        <span className="badge bg-emerald-100 text-emerald-800">وافق على المشاركة</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {tool?.name ?? "أداة غير محددة"} · {referral.topicLabel}
                      {referral.resultId ? ` · نتيجة: ${referral.resultId}` : ""}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {new Date(referral.createdAt).toLocaleString("ar-SA")}
                    </p>
                  </div>

                  <form action={updateReferralStatusAction} className="flex items-end gap-2">
                    <input type="hidden" name="id" value={referral.id} />
                    <select
                      name="status"
                      defaultValue={referral.status}
                      className="field !w-auto !py-1.5 text-xs"
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      name="notes"
                      defaultValue={referral.notes}
                      placeholder="ملاحظة"
                      className="field !w-40 !py-1.5 text-xs"
                    />
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
