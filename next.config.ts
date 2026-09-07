import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * سياسة أمن المحتوى (CSP).
 * - في التطوير نسمح بـ eval الذي يحتاجه التحديث الساخن (HMR).
 * - الخطوط من Google، والصور قد تكون خارجية (صور المحامين والإعلانات) فنسمح بـ https.
 * - النداءات الخارجية (Gemini) تتم من الخادم فلا تخضع لـ connect-src.
 */
const scriptSrc = isProd ? "'self' 'unsafe-inline'" : "'self' 'unsafe-inline' 'unsafe-eval'";
const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

/** الدومين الرسمي — تُوحَّد عليه كل العناوين البديلة */
const CANONICAL_HOST = "mohaminafsak.com";
const ALTERNATE_HOSTS = ["www.mohaminafsak.com", "mohami-nafsak.vercel.app"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * تضمين مجلد data في حزمة دوال الخادم.
   * مع التحديث الدوري تُعاد توليد الصفحات وقت التشغيل لا وقت البناء، وهي تقرأ
   * محرّكات القرار ووحدات القواعد والمراجع من data/ عبر نظام الملفات. تتبّع
   * الملفات التلقائي لا يلتقط المسارات المبنية من متغيّرات، فنضمّنه صراحةً
   * حتى لا تختفي الكواشف بعد أول تجديد.
   */
  outputFileTracingIncludes: {
    "/**": ["./data/**/*"],
  },
  /**
   * توحيد العنوان: www والرابط القديم على vercel.app يحوّلان تحويلًا دائمًا
   * إلى الدومين الرسمي، فلا يظهر الموقع لمحركات البحث بأكثر من عنوان،
   * وتبقى الروابط القديمة المنشورة تعمل.
   */
  async redirects() {
    return ALTERNATE_HOSTS.map((host) => ({
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: `https://${CANONICAL_HOST}/:path*`,
      permanent: true,
    }));
  },
  async headers() {
    return [
      {
        // منع فهرسة لوحة الإدارة من محركات البحث
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
