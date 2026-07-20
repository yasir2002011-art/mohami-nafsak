import Link from "next/link";
import Logo from "@/components/Logo";

const LEGAL_PAGES = [
  { href: "/about", label: "من نحن" },
  { href: "/contact", label: "تواصل معنا" },
  { href: "/privacy", label: "سياسة الخصوصية" },
  { href: "/terms", label: "الشروط والأحكام" },
  { href: "/disclaimer", label: "إخلاء المسؤولية" },
];

export default function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-slate-200 bg-white/70 no-print">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <Logo subtitle={null} />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500">
              منصة تساعدك على فهم موقفك النظامي وترتيب خطواتك، بلغة واضحة ومصادر معلنة.
              المحتوى هنا معلومات عامة ولا يُعد استشارة قانونية.
            </p>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-extrabold text-slate-800">صفحات المنصة</h3>
            <ul className="space-y-2.5 text-sm text-slate-500">
              {LEGAL_PAGES.map((page) => (
                <li key={page.href}>
                  <Link href={page.href} className="transition hover:text-brand-700">
                    {page.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-extrabold text-slate-800">تنبيه مهم</h3>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm leading-relaxed text-amber-900">
              إذا كان لديك موعد جلسة أو مهلة اعتراض أو استئناف، فلا تؤجّل — راجع محاميًا مرخّصًا
              فورًا. المواعيد النظامية قد تسقط الحق بفواتها.
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row">
          <span>© {new Date().getFullYear()} محامي نفسك — جميع الحقوق محفوظة.</span>
          <span>المملكة العربية السعودية</span>
        </div>
      </div>
    </footer>
  );
}
