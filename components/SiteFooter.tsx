import Link from "next/link";
import { LogoFull } from "@/components/Logo";

const LEGAL_PAGES = [
  { href: "/about", label: "من نحن" },
  { href: "/contact", label: "تواصل معنا" },
  { href: "/privacy", label: "سياسة الخصوصية" },
  { href: "/terms", label: "الشروط والأحكام" },
  { href: "/disclaimer", label: "إخلاء المسؤولية" },
];

export default function SiteFooter() {
  return (
    <footer className="mt-16 bg-brand-900 text-white/70 lg:mt-24 no-print">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <LogoFull />
            <p className="mt-5 max-w-sm text-sm leading-relaxed">
              منصة تساعدك على فهم موقفك النظامي وترتيب خطواتك، بلغة واضحة ومصادر معلنة.
              المحتوى هنا معلومات عامة ولا يُعد استشارة قانونية.
            </p>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-bold text-white">صفحات المنصة</h3>
            <ul className="space-y-2.5 text-sm">
              {LEGAL_PAGES.map((page) => (
                <li key={page.href}>
                  <Link
                    href={page.href}
                    className="underline decoration-white/25 underline-offset-4 transition-colors duration-200 hover:text-gold-400 hover:decoration-gold-400"
                  >
                    {page.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-bold text-white">تنبيه مهم</h3>
            <div className="rounded-2xl border border-gold-400/50 p-4 text-sm leading-relaxed text-white/85">
              إذا كان لديك موعد جلسة أو مهلة اعتراض أو استئناف، فلا تؤجّل — راجع محاميًا مرخّصًا
              فورًا. المواعيد النظامية قد تسقط الحق بفواتها.
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/15 pt-6 text-xs sm:flex-row">
          <span>© {new Date().getFullYear()} محامي نفسك — جميع الحقوق محفوظة.</span>
          <span>المملكة العربية السعودية</span>
        </div>
      </div>
    </footer>
  );
}
