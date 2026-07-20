import type { Metadata } from "next";
import Icon from "@/components/Icon";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getSettings } from "@/lib/store";

export const metadata: Metadata = {
  title: "تواصل معنا",
  description: "طرق التواصل مع فريق منصة محامي نفسك.",
};

export default async function ContactPage() {
  const settings = await getSettings();

  return (
    <>
      <SiteHeader />

      <header className="relative overflow-hidden border-b border-slate-200">
        <div className="absolute inset-0 -z-10" style={{ background: "var(--gradient-hero)" }} />
        <div className="mx-auto max-w-3xl px-4 py-14 text-center">
          <h1 className="text-3xl font-black text-slate-900 sm:text-4xl">تواصل معنا</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-600">
            لملاحظاتك على المحتوى، أو للإبلاغ عن تحديث نظامي، أو لطلبات الإدراج والإعلان.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="card-soft p-6">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <Icon name="alert" className="h-6 w-6" />
            </span>
            <h2 className="mt-4 font-extrabold text-slate-900">بلاغ عن خطأ أو تحديث نظامي</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              في أسفل كل نتيجة زر مخصص للإبلاغ. هذا أسرع طريق لوصول الملاحظة إلى الفريق القانوني.
            </p>
          </div>

          <div className="card-soft p-6">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-slate-600">
              <Icon name="users" className="h-6 w-6" />
            </span>
            <h2 className="mt-4 font-extrabold text-slate-900">إدراج محامٍ أو إعلان</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              للمحامين المرخّصين الراغبين في الإدراج، وللمعلنين — راسلنا مع بيانات الترخيص.
            </p>
          </div>
        </div>

        <div className="card-soft mt-6 p-8 text-center">
          <h2 className="font-extrabold text-slate-900">البريد الإلكتروني</h2>
          {settings.contactEmail ? (
            <a
              href={`mailto:${settings.contactEmail}`}
              className="mt-3 inline-block text-lg font-extrabold text-brand-700 hover:underline"
              dir="ltr"
            >
              {settings.contactEmail}
            </a>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              لم يُضَف بريد التواصل بعد. أضِفه من لوحة الإدارة ← الإعدادات.
            </p>
          )}
        </div>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-sm leading-relaxed text-amber-900">
          <span className="font-extrabold">تنبيه مهم:</span> لا ترسل لنا تفاصيل قضيتك ولا
          مستنداتك ولا أسماء أطفالك عبر البريد. نحن لا نقدّم استشارات فردية، وإرسال هذه البيانات
          لا يفيدك ويعرّض خصوصيتك للخطر.
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
