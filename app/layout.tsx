import type { Metadata } from "next";
import { siteUrl } from "@/lib/site";
import "./globals.css";

/**
 * التحديث الدوري (ISR) لكل الصفحات العامة.
 *
 * الصفحات تُولَّد ساكنة للسرعة، لكن محتواها (الأقسام في الترويسة، الأدوات،
 * المحامون، المقالات، نوافذ الإعلانات) يأتي من المخزن. بدون هذا السطر يتجمّد
 * المحتوى عند آخر نشر ولا يظهر ما يُحفظ من لوحة الإدارة إلا بنشر جديد.
 * القيمة بالثواني: تتجدّد الصفحة عند أول زيارة بعد انقضائها، مع تقديم النسخة
 * السابقة فورًا أثناء التجديد فلا يشعر الزائر بأي بطء.
 * صفحات الإدارة ديناميكية بطبيعتها (تعتمد على الكوكي) فلا يشملها هذا.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "محامي نفسك — كواشف نظامية توجّهك إلى موقفك",
    template: "%s | محامي نفسك",
  },
  description:
    "منصة سعودية توجّهك إلى موقفك النظامي في القضايا الأسرية والعمالية والتجارية والإجرائية، عبر كواشف مبنية على الأنظمة ولوائحها التنفيذية مع بيان المادة التي بُنيت عليها كل نتيجة.",
  keywords: [
    "حضانة",
    "مستحق الحضانة",
    "نوع عقد العمل",
    "نظام العمل",
    "نظام الأحوال الشخصية",
    "السعودية",
  ],
  openGraph: {
    type: "website",
    locale: "ar_SA",
    siteName: "محامي نفسك",
    title: "محامي نفسك — كواشف نظامية توجّهك إلى موقفك",
    description:
      "كواشف نظامية سعودية: اعرف مستحق الحضانة ونوع مدة عقدك، مع المادة النظامية التي بُنيت عليها النتيجة.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* القاعدة التالية تخص Pages Router؛ في App Router هذا هو الموضع الصحيح للخط */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
