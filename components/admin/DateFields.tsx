"use client";

import { useState } from "react";
import { GREGORIAN_MONTHS_AR, isValidGregorian, parseISODate, toISODate } from "@/lib/hijri";

/**
 * حقل تاريخ ميلادي للنماذج غير المضبوطة (لوحة الإدارة).
 *
 * ثلاثة حقول (يوم/شهر/سنة) بدل حقل التاريخ الأصلي للمتصفح، لأن Chromium يفرض
 * اتجاه حقل type="date" من لغة المتصفح ويرسم تسمياته العربية معكوسة في صفحة
 * RTL، ولا يمكن تجاوز ذلك بـ CSS (انظر التعليق في globals.css).
 *
 * التوافق مع إجراءات الخادم: يُكتب الناتج في حقل مخفي يحمل نفس الاسم (name)
 * بصيغة ISO ‏(yyyy-mm-dd)‏ — وهي الصيغة نفسها التي كان حقل المتصفح يرسلها —
 * فلا يتغيّر شيء في قراءة FormData. تاريخ ناقص أو غير صحيح يُرسَل فارغًا،
 * تمامًا كما كان حقل المتصفح يرسل الفارغ عند عدم اكتمال الإدخال.
 *
 * (للكاشف نسخة مضبوطة بالحالة داخل CustodyChecker لأنها تتزامن مع الهجري.)
 */
export default function DateFields({
  name,
  id,
  defaultValue,
  required,
}: {
  name: string;
  id?: string;
  /** ISO ‏(yyyy-mm-dd)‏ أو طابع زمني كامل — يُؤخذ منه التاريخ فقط */
  defaultValue?: string;
  required?: boolean;
}) {
  const initial = defaultValue ? parseISODate(defaultValue.slice(0, 10)) : null;
  const [draft, setDraft] = useState(() => ({
    day: initial ? String(initial.day) : "",
    month: initial ? String(initial.month) : "",
    year: initial ? String(initial.year) : "",
  }));

  const candidate = {
    day: Number(draft.day),
    month: Number(draft.month),
    year: Number(draft.year),
  };
  const iso = isValidGregorian(candidate) ? toISODate(candidate) : "";
  const update = (patch: Partial<typeof draft>) => setDraft({ ...draft, ...patch });

  return (
    <div className="grid grid-cols-3 gap-2">
      <input type="hidden" name={name} value={iso} />
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={31}
        value={draft.day}
        onChange={(event) => update({ day: event.target.value })}
        required={required}
        className="field"
        placeholder="اليوم"
        aria-label="اليوم"
      />
      <select
        value={draft.month}
        onChange={(event) => update({ month: event.target.value })}
        required={required}
        className="field"
        aria-label="الشهر"
      >
        <option value="">الشهر</option>
        {GREGORIAN_MONTHS_AR.map((month, monthIndex) => (
          <option key={month} value={monthIndex + 1}>
            {month}
          </option>
        ))}
      </select>
      <input
        type="number"
        inputMode="numeric"
        min={1850}
        max={2100}
        value={draft.year}
        onChange={(event) => update({ year: event.target.value })}
        required={required}
        className="field"
        placeholder="السنة"
        aria-label="السنة"
      />
    </div>
  );
}
