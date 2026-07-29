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

export interface GregorianDate {
  year: number;
  month: number;
  day: number;
}

const HIJRI_FORMATTER = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  timeZone: "UTC",
});

/** تحويل تاريخ ميلادي إلى هجري (أم القرى) */
export function gregorianToHijri(date: Date): HijriDate {
  const parts = HIJRI_FORMATTER.formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value.replace(/\D/g, "") ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

const DAY_MS = 86_400_000;

/**
 * تحويل تاريخ هجري (أم القرى) إلى ميلادي.
 *
 * لا توجد دالة عكسية مباشرة في المتصفح، فنبحث ثنائيًا عن اليوم الميلادي الذي
 * يوافق صياغته الهجرية التاريخَ المطلوب. المطابقة رتيبة فالبحث سريع (نحو 17 خطوة).
 */
export function hijriToGregorian(hijri: HijriDate): GregorianDate | null {
  if (!isValidHijri(hijri)) return null;

  const target = hijri.year * 10000 + hijri.month * 100 + hijri.day;
  let lo = Math.floor(Date.UTC(1850, 0, 1) / DAY_MS);
  let hi = Math.floor(Date.UTC(2100, 0, 1) / DAY_MS);

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const date = new Date(mid * DAY_MS);
    const h = gregorianToHijri(date);
    const value = h.year * 10000 + h.month * 100 + h.day;
    if (value === target) {
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
    }
    if (value < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

/** تاريخ اليوم بالتقويم الهجري (أم القرى) */
export function todayHijri(now: Date = new Date()): HijriDate {
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Riyadh",
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value.replace(/\D/g, "") ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** صيغة ISO ‏(yyyy-mm-dd)‏ لحقل التاريخ الميلادي */
export function toISODate(date: GregorianDate): string {
  const mm = String(date.month).padStart(2, "0");
  const dd = String(date.day).padStart(2, "0");
  return `${date.year}-${mm}-${dd}`;
}

/** قراءة قيمة حقل التاريخ الميلادي ‏(yyyy-mm-dd)‏ */
export function parseISODate(value: string): GregorianDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

const GREGORIAN_MONTHS_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

export function formatGregorianAr(date: GregorianDate): string {
  return `${date.day} ${GREGORIAN_MONTHS_AR[date.month - 1] ?? ""} ${date.year}م`;
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
