/**
 * عنوان الموقع الأساسي.
 *
 * الترتيب: المتغيّر الصريح، ثم العنوان الذي تمنحه Vercel تلقائيًا،
 * ثم العنوان المحلي أثناء التطوير. هذا يجعل خريطة الموقع وrobots
 * تعمل على رابط النشر دون إعداد يدوي.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
