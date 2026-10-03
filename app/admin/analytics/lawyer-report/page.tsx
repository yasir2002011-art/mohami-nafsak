import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getAll } from "@/lib/store";
import { queryMetrics, riyadhDate, sumOf } from "@/lib/metrics";
import { GREGORIAN_MONTHS_AR } from "@/lib/hijri";
import { Card } from "@/components/admin/Ui";
import PrintButton from "@/components/admin/PrintButton";

/**
 * التقرير الشهري لمحامٍ — صفحة مهيّأة للطباعة، تُحفظ PDF من نافذة الطباعة.
 *
 * يحتوي عدًّا مجمّعًا فقط: مرات ظهور بطاقة المحامي ونقرات التواصل معه.
 * لا بيانات عن الزوار إطلاقًا، فيصلح للإرسال إلى المحامي كما هو.
 */

const MONTH = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

export default async function LawyerReportPage({
  searchParams,
}: {
  searchParams: Promise<{ lawyer?: string; month?: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/admin");

  const query = await searchParams;
  const today = riyadhDate();
  const month = query.month && MONTH.test(query.month) ? query.month : today.slice(0, 7);

  const lawyers = await getAll("lawyers");
  const lawyer = lawyers.find((item) => item.id === query.lawyer);
  if (!lawyer) redirect("/admin/analytics?tab=lawyers");

  const [year, monthNumber] = month.split("-").map(Number);
  const from = `${month}-01`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;
  const monthLabel = `${GREGORIAN_MONTHS_AR[monthNumber - 1]} ${year}`;

  const rows = await queryMetrics(from, to);
  const mine = (props: Record<string, string>) => props.lawyer_id === lawyer.id;
  const views = sumOf(rows, "lawyer_view", mine);
  const clicks = sumOf(rows, "lawyer_contact_click", mine);

  // تفصيل يومي للأيام التي فيها نشاط فقط
  const days = new Map<string, { views: number; clicks: number }>();
  for (const metric of rows) {
    if (metric.props.lawyer_id !== lawyer.id) continue;
    if (metric.event !== "lawyer_view" && metric.event !== "lawyer_contact_click") continue;
    const entry = days.get(metric.date) ?? { views: 0, clicks: 0 };
    if (metric.event === "lawyer_view") entry.views += metric.count;
    else entry.clicks += metric.count;
    days.set(metric.date, entry);
  }
  const daily = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  // آخر 12 شهرًا للاختيار (مدة الاحتفاظ بالبيانات)
  const months: string[] = [];
  const cursor = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  for (let i = 0; i < 12; i += 1) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <Link href="/admin/analytics?tab=lawyers" className="text-sm font-bold text-slate-600 hover:text-brand-700">
          العودة إلى «السلوك» ←
        </Link>
        <form method="get" className="flex items-center gap-2">
          <input type="hidden" name="lawyer" value={lawyer.id} />
          <select name="month" defaultValue={month} className="field !w-auto !py-2 text-sm" aria-label="الشهر">
            {months.map((value) => {
              const [y, m] = value.split("-").map(Number);
              return (
                <option key={value} value={value}>
                  {GREGORIAN_MONTHS_AR[m - 1]} {y}
                </option>
              );
            })}
          </select>
          <button type="submit" className="btn-ghost !py-2 text-sm">
            عرض
          </button>
          <PrintButton />
        </form>
      </div>

      <Card>
        <p className="text-xs font-bold text-gold-700">محامي نفسك · تقرير شهري</p>
        <h1 className="mt-1 text-2xl font-black text-slate-900">{lawyer.name}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {monthLabel}
          {lawyer.city ? ` · ${lawyer.city}` : ""}
          {lawyer.specialties.length > 0 ? ` · ${lawyer.specialties.join("، ")}` : ""}
        </p>

        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-3xl font-black text-slate-900">{views}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">مرات ظهور بطاقتك</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-3xl font-black text-slate-900">{clicks}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">نقرات التواصل معك</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-3xl font-black text-slate-900">
              {views > 0 ? `${Math.round((clicks / views) * 100)}%` : "—"}
            </p>
            <p className="mt-1 text-xs font-bold text-slate-500">نسبة التواصل</p>
          </div>
        </div>

        <h2 className="mt-8 text-sm font-extrabold text-slate-900">التفصيل اليومي</h2>
        {daily.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">لا نشاط مسجّل في هذا الشهر.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-right text-xs font-bold text-slate-500">
                <th className="px-3 py-2">اليوم</th>
                <th className="px-3 py-2">ظهور البطاقة</th>
                <th className="px-3 py-2">نقرات التواصل</th>
              </tr>
            </thead>
            <tbody>
              {daily.map(([date, value]) => (
                <tr key={date} className="border-b border-slate-200 last:border-0">
                  <td className="px-3 py-2 font-bold text-slate-900" dir="ltr">
                    {date}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{value.views}</td>
                  <td className="px-3 py-2 text-slate-700">{value.clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="disclaimer-note mt-8 border-t border-slate-200 pt-4">
          الأرقام عدّ مجمّع لظهور بطاقتك في نتائج الكواشف ولنقرات زر التواصل. لا يحتوي التقرير أي
          بيانات عن الزوار، ولا يدل على إتمام تعاقد. صدر بتاريخ {today}.
        </p>
      </Card>
    </div>
  );
}
