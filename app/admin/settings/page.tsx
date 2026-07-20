import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getAll, getSettings } from "@/lib/store";
import { saveSettingsAction } from "@/app/admin/actions";
import { Card, Field, PageHeader, Toggle } from "@/components/admin/Ui";

export default async function AdminSettingsPage() {
  if (!(await isAuthenticated())) redirect("/admin");

  const [settings, auditLog] = await Promise.all([getSettings(), getAll("audit-log")]);
  const recent = [...auditLog].reverse().slice(0, 30);

  return (
    <div className="space-y-7">
      <PageHeader
        title="الإعدادات"
        description="إعدادات عامة للمنصة وسجل العمليات."
      />

      <Card>
        <form action={saveSettingsAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم المنصة" name="siteName" defaultValue={settings.siteName} />
            <Field label="بريد التواصل" name="contactEmail" type="email" defaultValue={settings.contactEmail} />
          </div>

          <Field label="الوصف المختصر" name="tagline" defaultValue={settings.tagline} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle
              label="تفعيل طبقة الذكاء الاصطناعي"
              name="aiLayerEnabled"
              defaultChecked={settings.aiLayerEnabled}
              hint="دورها إعادة شرح النتيجة الثابتة بلغة مبسّطة فقط. إيقافها لا يعطّل محركات القرار."
            />
            <Toggle
              label="إظهار قسم الفيديوهات"
              name="videosEnabled"
              defaultChecked={settings.videosEnabled}
              hint="البنية جاهزة، والقسم مخفي حتى تفعّله."
            />
            <Toggle
              label="تفعيل إعلانات Google"
              name="googleAdsEnabled"
              defaultChecked={settings.googleAdsEnabled}
              hint="تظهر فقط في الصفحات المسموح بها — لا تظهر في صفحات النتائج الحساسة."
            />
            <Toggle
              label="حفظ إجابات المستخدمين"
              name="storeUserAnswers"
              defaultChecked={settings.storeUserAnswers}
              hint="اتركه مغلقًا. تفعيله يغيّر التزامات الخصوصية ويستلزم تحديث السياسة."
            />
          </div>

          <button type="submit" className="btn-brand !py-2 text-sm">
            حفظ الإعدادات
          </button>
        </form>
      </Card>

      <Card>
        <h2 className="font-extrabold text-slate-900">سجل العمليات</h2>
        <p className="mt-1 text-xs text-slate-500">
          من أضاف أو عدّل أو نشر أو حذف — آخر 30 عملية.
        </p>

        <ul className="mt-4 space-y-2">
          {recent.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs"
            >
              <span className="text-slate-800">{entry.summary}</span>
              <span className="text-slate-400">
                {entry.actor} · {new Date(entry.createdAt).toLocaleString("ar-SA")}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="font-extrabold text-slate-900">قبل النشر الحقيقي</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
          {[
            "غيّر ADMIN_PASSWORD وADMIN_SESSION_SECRET في ملف .env.local إلى قيم قوية.",
            "فعّل المصادقة الثنائية لمديري الموقع (البنية جاهزة في حقول AdminUser).",
            "أكمل مراجعة كل محرك قرار وسجّل اسم المراجع وتاريخ المراجعة قبل تغيير الحالة إلى «منشور».",
            "أكمل أرقام المواد وروابط المصادر الرسمية وعلّم «تم التحقق».",
            "فعّل HTTPS، وشغّل نسخًا احتياطيًا دوريًا لمجلد data، وجرّب الاستعادة فعليًا.",
            "أنشئ بيئة تجريبية منفصلة عن الموقع الحقيقي.",
            "عند التوسع: انقل البيانات من ملفات JSON إلى قاعدة بيانات — التغيير محصور في lib/store.ts.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
