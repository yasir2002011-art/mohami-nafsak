/**
 * التقويم الهجري (أم القرى).
 *
 * أعمار المحضونين تُحسب بالسنوات الهجرية، لأن النصوص النظامية تعتمدها.
 */

export interface HijriDate {
  year: number;
  month: number;
  day: number;
}

export const HIJRI_MONTHS = [
  "محرم",
  "صفر",
  "ربيع الأول",
  "ربيع الآخر",
  "جمادى الأولى",
  "جمادى الآخرة",
  "رجب",
  "شعبان",
  "رمضان",
  "شوال",
  "ذو القعدة",
  "ذو الحجة",
] as const;

/** تاريخ اليوم بالتقويم الهجري (أم القرى) */
export function todayHijri(now: Date = new Date()): HijriDate {
  const formatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Riyadh",
  });

  const parts = formatter.formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value.replace(/\D/g, "") ?? 0);

  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * العمر بالسنوات الهجرية الكاملة.
 * تُطرح سنة إذا لم يمرّ يوم الميلاد بعدُ في السنة الجارية.
 */
export function hijriAge(birth: HijriDate, today: HijriDate = todayHijri()): number {
  let age = today.year - birth.year;
  if (today.month < birth.month || (today.month === birth.month && today.day < birth.day)) {
    age -= 1;
  }
  return age;
}

export function formatHijri(date: HijriDate): string {
  const month = HIJRI_MONTHS[date.month - 1] ?? "";
  return `${date.day} ${month} ${date.year}هـ`;
}

/** تحقق من صحة تاريخ هجري مُدخل */
export function isValidHijri(date: Partial<HijriDate>): date is HijriDate {
  const { year, month, day } = date;
  if (!year || !month || !day) return false;
  if (year < 1300 || year > 1500) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 30) return false;
  return true;
}
