/**
 * تهيئة النص للنطق بلهجة خليجية: الأرقام تُكتب كلمات كما تُقال
 * («المادة 124» ← «المادة مية وأربعة وعشرين»)، وتُحذف رموز لا تُنطق.
 *
 * النص المعروض للمتصل يبقى بالأرقام (وبه يتحقق الخادم من أرقام المواد)؛
 * هذا التحويل للصوت وحده.
 */

const ONES = ["صفر", "واحد", "اثنين", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const TEENS: Record<number, string> = {
  10: "عشرة",
  11: "إحدعش",
  12: "اثنعش",
  13: "ثلاثطعش",
  14: "أربعطعش",
  15: "خمسطعش",
  16: "ستطعش",
  17: "سبعطعش",
  18: "ثمنطعش",
  19: "تسعطعش",
};
const TENS = ["", "", "عشرين", "ثلاثين", "أربعين", "خمسين", "ستين", "سبعين", "ثمانين", "تسعين"];
const HUNDREDS = ["", "مية", "ميتين", "ثلاث مية", "أربع مية", "خمس مية", "ست مية", "سبع مية", "ثمان مية", "تسع مية"];

function belowHundred(n: number): string {
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n];
  const ones = n % 10;
  const tens = TENS[Math.floor(n / 10)];
  return ones ? `${ONES[ones]} و${tens}` : tens;
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(HUNDREDS[hundreds]);
  if (rest || !hundreds) parts.push(belowHundred(rest));
  return parts.join(" و");
}

/** 0–9999 بكلمات خليجية؛ غير ذلك يعاد كما هو */
export function numberToGulf(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 9999) return String(n);
  if (n < 1000) return belowThousand(n);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const head =
    thousands === 1 ? "ألف" : thousands === 2 ? "ألفين" : thousands <= 10 ? `${belowHundred(thousands)} آلاف` : `${belowHundred(thousands)} ألف`;
  return rest ? `${head} و${belowThousand(rest)}` : head;
}

export function toSpoken(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/(\d+)\s*%/g, (_, n: string) => `${numberToGulf(Number(n))} بالمية`)
    .replace(/\d{1,4}(?!\d)/g, (match, offset: number, whole: string) => {
      // جزء من رقم أطول (هاتف أو رقم هوية) لا يُحوَّل
      if (offset > 0 && /\d/.test(whole[offset - 1])) return match;
      return numberToGulf(Number(match));
    })
    .replace(/[()[\]«»"*#_`]/g, " ")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
