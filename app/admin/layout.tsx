import type { Metadata } from "next";
import Link from "next/link";
import Icon from "@/components/Icon";
import { isAuthenticated } from "@/lib/auth";
import { isReadOnlyStore } from "@/lib/store";

export const metadata: Metadata = {
  title: "لوحة الإدارة",
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/admin", label: "نظرة عامة", icon: "chart" },
  { href: "/admin/tools", label: "الأدوات", icon: "briefcase" },
  { href: "/admin/engines", label: "محركات القرار", icon: "gavel" },
  { href: "/admin/lawyers", label: "المحامون", icon: "users" },
  { href: "/admin/articles", label: "المقالات", icon: "scroll" },
  { href: "/admin/ads", label: "الإعلانات", icon: "sparkle" },
  { href: "/admin/referrals", label: "الإحالات", icon: "arrow" },
  { href: "/admin/reports", label: "البلاغات", icon: "alert" },
  { href: "/admin/analytics", label: "الإحصاءات", icon: "chart" },
  { href: "/admin/settings", label: "الإعدادات", icon: "lock" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = await isAuthenticated();

  // صفحة الدخول تُعرض بلا قائمة جانبية
  if (!authed) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-l border-slate-200 bg-white/80 backdrop-blur lg:w-64 lg:shrink-0">
        <div className="flex items-center gap-2.5 border-b border-slate-200 p-5">
          <span className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl text-white">
            <Icon name="scale" className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-extrabold text-gradient">محامي نفسك</p>
            <p className="text-[10px] font-bold text-slate-400">لوحة الإدارة</p>
          </div>
        </div>

        <nav className="flex flex-wrap gap-1 p-3 lg:flex-col">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-brand-50 hover:text-brand-800"
            >
              <Icon name={item.icon} className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <Link
            href="/"
            target="_blank"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:text-brand-700"
          >
            <Icon name="arrow" className="h-3.5 w-3.5 rotate-180" />
            عرض الموقع العام
          </Link>
          <form action="/api/admin/logout" method="post">
            <button
              type="submit"
              className="mt-1 w-full rounded-xl px-3 py-2 text-right text-xs font-bold text-rose-600 hover:bg-rose-50"
            >
              تسجيل الخروج
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 p-5 sm:p-8">
        {isReadOnlyStore && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
            <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm leading-relaxed text-amber-900">
              <p className="font-extrabold">وضع العرض — التعديلات لا تُحفظ</p>
              <p className="mt-1">
                هذه النسخة منشورة على استضافة نظام ملفاتها للقراءة فقط، فيمكنك تصفّح كل
                شيء لكن أي حفظ لن يبقى. لتشغيل الحفظ فعليًا انقل الاستضافة إلى خادم بقرص
                دائم، أو انقل التخزين إلى قاعدة بيانات (التغيير محصور في{" "}
                <code className="rounded bg-amber-100 px-1">lib/store.ts</code>).
              </p>
            </div>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
