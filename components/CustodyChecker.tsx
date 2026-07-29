"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import LawyerContact from "@/components/LawyerContact";
import CustodyObjection from "@/components/CustodyObjection";
import {
  formatGregorianAr,
  formatHijri,
  gregorianToHijri,
  HIJRI_MONTHS,
  hijriAge,
  hijriToGregorian,
  isValidHijri,
  parseISODate,
  toISODate,
  todayHijri,
  type HijriDate,
} from "@/lib/hijri";
import { emptyStates, runCustodyChecker } from "@/lib/custody";
import type {
  CandidateKey,
  CandidateState,
  CandidateStates,
  Child,
  ChildOutcome,
  CustodyRuleConfig,
  Tri,
} from "@/types/custody";
import type { Lawyer } from "@/types";

const STEPS = [
  "البداية",
  "المحضونون",
  "حالة الوالدين",
  "شروط الحاضن",
  "أسباب السقوط",
  "المطالبة بالحضانة",
  "النتيجة",
] as const;

/**
 * كاشف مستحق الحضانة.
 * كل البيانات تبقى في المتصفح ولا تُرسل إلى الخادم.
 */
export default function CustodyChecker({
  config,
  toolId,
  lawyers,
  todayLabel,
}: {
  config: CustodyRuleConfig;
  toolId: string;
  lawyers: Lawyer[];
  todayLabel: string;
}) {
  const [step, setStep] = useState(0);
  const [items, setItems] = useState<Child[]>([blankChild(0)]);
  const [states, setStates] = useState<CandidateStates>(() => emptyStates(config));

  // حالة الزوجية على مرحلتين:
  // 1) هل انتهت الزوجية (الفرقة: طلاق/خلع/فسخ/وفاة/لعان — المادة 76)؟
  // 2) إن لم تنتهِ، هل يعيش الوالدان في مسكن واحد؟
  const [marriageEnded, setMarriageEnded] = useState<"" | "yes" | "no">("");
  const [sameHome, setSameHome] = useState<"" | "yes" | "no">("");
  const [showSepInfo, setShowSepInfo] = useState(false);

  // أسرة قائمة (لا نزاع حضانة): زوجية قائمة + مسكن واحد → حضانة مشتركة (م.127/1)
  const jointCustody = marriageEnded === "no" && sameHome === "yes";
  // يُعمَل الترتيب النظامي عند الفرقة، أو بقاء الزوجية مع الافتراق في المسكن (م.133)
  const orderApplies =
    marriageEnded === "yes" || (marriageEnded === "no" && sameHome === "no");
  const maritalDecided = jointCustody || orderApplies;

  const ping = (type: string) => {
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, toolId }),
      keepalive: true,
    }).catch(() => {});
  };

  const result = useMemo(
    () => (step === 6 ? runCustodyChecker(items, states, config, jointCustody) : null),
    [step, items, states, config, jointCustody],
  );

  const childrenValid =
    items.length > 0 && items.every((child) => child.gender && isValidHijri(child.birth));

  const present = config.order.filter((entry) => states[entry.key].exists);

  const goNext = () => {
    if (step === 0) ping("tool_start");
    if (step === 5) ping("tool_complete");
    // أسرة قائمة (زوجية + مسكن واحد): لا معنى لأسئلة الترتيب — ننتقل إلى النتيجة
    const next = step === 2 && jointCustody ? 6 : step + 1;
    setStep(Math.min(next, 6));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    const previous = step === 6 && jointCustody ? 2 : step - 1;
    setStep(Math.max(previous, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const patchState = (key: CandidateKey, patch: Partial<CandidateState>) => {
    setStates((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  };

  return (
    <div className="space-y-6">
      <Stepper current={step} />

      {step === 0 && <Intro config={config} todayLabel={todayLabel} onStart={goNext} />}

      {step === 1 && (
        <ChildrenStep
          items={items}
          setItems={setItems}
          todayLabel={todayLabel}
          endAge={config.ageThresholds.end}
        />
      )}

      {step === 2 && (
        <Card
          title="حالة الوالدين والحاضنين"
          hint="لا يبدأ النزاع في الحضانة إلا بانتهاء الزوجية (الفرقة) أو بافتراق الوالدين في المسكن مع بقائها. أما إذا كانا زوجين في مسكن واحد فالحضانة من واجباتهما معًا."
        >
          {/* السؤال الأول: هل انتهت الزوجية؟ */}
          <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <p className="text-sm font-bold text-slate-800">
                هل انتهت الزوجية بين والدي المحضون؟
              </p>
              <button
                type="button"
                onClick={() => setShowSepInfo((value) => !value)}
                aria-label="ما معنى انتهاء الزوجية؟"
                className="flex h-5 w-5 items-center justify-center rounded-full border border-brand-300 text-[11px] font-extrabold text-brand-700 hover:bg-brand-50"
              >
                ؟
              </button>
            </div>

            {showSepInfo && (
              <p className="mb-3 rounded-xl bg-brand-50 px-3 py-2.5 text-xs leading-relaxed text-brand-900">
                {config.notes.separationMeaning}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setMarriageEnded("yes");
                  setSameHome("");
                }}
                className={`rounded-full border-2 px-5 py-2 text-sm font-bold transition ${
                  marriageEnded === "yes"
                    ? "border-brand-600 bg-brand-50 text-brand-800"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                }`}
              >
                نعم، انتهت الزوجية
              </button>
              <button
                type="button"
                onClick={() => setMarriageEnded("no")}
                className={`rounded-full border-2 px-5 py-2 text-sm font-bold transition ${
                  marriageEnded === "no"
                    ? "border-brand-600 bg-brand-50 text-brand-800"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                }`}
              >
                لا، الزوجية قائمة
              </button>
            </div>
          </div>

          {/* السؤال الثاني: يظهر فقط إذا كانت الزوجية قائمة */}
          {marriageEnded === "no" && (
            <div className="mt-4 rounded-2xl border-2 border-slate-200 bg-white p-4">
              <p className="mb-3 text-sm font-bold text-slate-800">
                هل يعيش والدا المحضون في مسكن واحد؟
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSameHome("yes")}
                  className={`rounded-full border-2 px-5 py-2 text-sm font-bold transition ${
                    sameHome === "yes"
                      ? "border-brand-600 bg-brand-50 text-brand-800"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                  }`}
                >
                  نعم، في مسكن واحد
                </button>
                <button
                  type="button"
                  onClick={() => setSameHome("no")}
                  className={`rounded-full border-2 px-5 py-2 text-sm font-bold transition ${
                    sameHome === "no"
                      ? "border-brand-600 bg-brand-50 text-brand-800"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                  }`}
                >
                  لا، منفصلان في المسكن
                </button>
              </div>
              {sameHome === "no" && (
                <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
                  {config.notes.motherLeftHome}
                </p>
              )}
            </div>
          )}

          {/* قائمة الوجود: تظهر متى تعيّن إعمال الترتيب */}
          {orderApplies && (
            <div className="mt-5">
              <p className="mb-3 text-sm font-bold text-slate-800">
                من الموجود من مستحقي الحضانة؟
              </p>
              <p className="mb-3 text-xs leading-relaxed text-slate-500">
                من كان متوفى أو مفقودًا أو غائبًا يخرج من الترتيب. الترتيب النظامي:
                الأم، ثم الأب، ثم أم الأم، ثم أم الأب.
              </p>

              <div className="space-y-3">
                {config.order.map((entry) => (
                  <label
                    key={entry.key}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 border-slate-200 bg-white px-5 py-3.5 transition hover:border-brand-300"
                  >
                    <span className="font-bold text-slate-800">{entry.label}</span>
                    <span className="flex items-center gap-2 text-sm">
                      <span className="text-slate-500">موجود</span>
                      <input
                        type="checkbox"
                        checked={states[entry.key].exists}
                        onChange={(event) =>
                          patchState(entry.key, { exists: event.target.checked })
                        }
                        className="h-5 w-5 accent-brand-600"
                      />
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {step === 3 && (
        <Card
          title="شروط الحاضن"
          hint="تخلّف أي شرط من هذه الشروط يُسقط الحق في الحضانة."
        >
          <div className="space-y-5">
            {present.map((entry) => (
              <CandidateBlock key={entry.key} label={entry.label}>
                <TriRow
                  label="كامل الأهلية"
                  value={states[entry.key].capacity}
                  onChange={(value) => patchState(entry.key, { capacity: value })}
                />
                <TriRow
                  label="قادر على تربية المحضون وحفظه ورعايته"
                  value={states[entry.key].care}
                  onChange={(value) => patchState(entry.key, { care: value })}
                />
                <TriRow
                  label="سالم من الأمراض المعدية الخطيرة"
                  value={states[entry.key].diseaseFree}
                  onChange={(value) => patchState(entry.key, { diseaseFree: value })}
                />

                {entry.female ? (
                  <TriRow
                    label="غير متزوجة برجل أجنبي عن المحضون"
                    hint={
                      entry.key === "mother"
                        ? "لا يُعمل هذا الشرط في حق الأم إذا لم يتجاوز المحضون سن العامين، فحضانته لها ولو تزوجت من رجل أجنبي عنه. وللمحكمة كذلك استثناؤه إذا اقتضت مصلحة المحضون خلافه."
                        : "للمحكمة استثناء ذلك إذا اقتضت مصلحة المحضون خلافه."
                    }
                    value={states[entry.key].notMarriedToStranger ?? "yes"}
                    onChange={(value) =>
                      patchState(entry.key, { notMarriedToStranger: value })
                    }
                  />
                ) : (
                  <TriRow
                    label="يقيم عنده من يصلح للحضانة من النساء"
                    value={states[entry.key].hasWomen ?? "yes"}
                    onChange={(value) => patchState(entry.key, { hasWomen: value })}
                  />
                )}
              </CandidateBlock>
            ))}
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card
          title="أسباب سقوط الحضانة"
          hint="هذان سببان مستقلان لسقوط الحق في الحضانة، ولو توافرت بقية الشروط."
        >
          <div className="mb-5 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm leading-relaxed text-brand-900">
            <span className="font-extrabold">تنبيه:</span> {config.notes.motherLeftHome}
          </div>

          <div className="space-y-5">
            {present.map((entry) => (
              <CandidateBlock key={entry.key} label={entry.label}>
                <TriRow
                  label="لم ينتقل إلى مكان بقصد الإقامة تفوت به مصلحة المحضون"
                  value={states[entry.key].noHarmfulRelocation}
                  onChange={(value) =>
                    patchState(entry.key, { noHarmfulRelocation: value })
                  }
                />
                <TriRow
                  label="لم يسكت عن المطالبة بالحضانة مدة تزيد على سنة دون عذر"
                  hint="للمحكمة استثناء ذلك إذا اقتضت مصلحة المحضون خلافه."
                  value={states[entry.key].claimedInTime}
                  onChange={(value) => patchState(entry.key, { claimedInTime: value })}
                />
              </CandidateBlock>
            ))}
          </div>
        </Card>
      )}

      {step === 5 && (
        <Card
          title="المطالبة بالحضانة"
          hint="إذا لم يطلب الحضانة أحد من مستحقيها فللنظام حكم خاص يُلزم به أحد الوالدين."
        >
          <div className="space-y-5">
            {present.map((entry) => (
              <CandidateBlock key={entry.key} label={entry.label}>
                <TriRow
                  label="يطالب بالحضانة أو يقبلها"
                  value={states[entry.key].claims}
                  onChange={(value) => patchState(entry.key, { claims: value })}
                />
              </CandidateBlock>
            ))}
          </div>
        </Card>
      )}

      {step === 6 && result && (
        <ResultView
          result={result}
          config={config}
          toolId={toolId}
          lawyers={lawyers}
          onRestart={() => {
            setStep(0);
            setItems([blankChild(0)]);
            setStates(emptyStates(config));
            setMarriageEnded("");
            setSameHome("");
          }}
        />
      )}

      {step > 0 && step < 6 && (
        <div className="flex items-center justify-between gap-3 no-print">
          <button type="button" onClick={goBack} className="btn-ghost">
            السابق
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={
              (step === 1 && !childrenValid) || (step === 2 && !maritalDecided)
            }
            className="btn-brand disabled:cursor-not-allowed disabled:opacity-40"
          >
            {step === 5 || (step === 2 && jointCustody) ? "اعرض النتيجة" : "التالي"}
            <Icon name="arrow" className="h-4 w-4" />
          </button>
        </div>
      )}

      {step > 0 && step < 6 && (
        <p className="flex items-center gap-2 text-xs text-slate-400 no-print">
          <Icon name="lock" className="h-3.5 w-3.5" />
          إجاباتك على هذه الأسئلة تبقى في متصفحك ولا تُرسل إلى الخادم ولا تُحفظ إلا بموافقتك.
        </p>
      )}
    </div>
  );
}

/* ------------------------------- المكوّنات ------------------------------- */

function blankChild(index: number): Child {
  return {
    id: `child-${index}-${Math.random().toString(36).slice(2, 8)}`,
    gender: "m",
    birth: { year: 0, month: 0, day: 0 },
    incapacitated: false,
  };
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5 no-print">
      {STEPS.map((label, index) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            className={`badge ${
              index === current
                ? "bg-brand-700 text-white"
                : index < current
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-400"
            }`}
          >
            {index < current && <Icon name="check" className="h-3 w-3" />}
            {label}
          </span>
          {index < STEPS.length - 1 && <span className="text-slate-300">·</span>}
        </li>
      ))}
    </ol>
  );
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-soft rise-in p-6 sm:p-8">
      <h2 className="text-xl font-extrabold text-slate-900">{title}</h2>
      {hint && (
        <p className="mt-2 rounded-xl bg-slate-50 px-4 py-2.5 text-sm leading-relaxed text-slate-600">
          {hint}
        </p>
      )}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function CandidateBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 flex items-center gap-2 font-extrabold text-slate-900">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Icon name="users" className="h-4 w-4" />
        </span>
        {label}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

const TRI_OPTIONS: { value: Tri; label: string; className: string }[] = [
  {
    value: "yes",
    label: "نعم",
    className: "border-emerald-500 bg-emerald-50 text-emerald-800",
  },
  { value: "no", label: "لا", className: "border-rose-500 bg-rose-50 text-rose-800" },
  {
    value: "unsure",
    label: "غير متأكد",
    className: "border-amber-500 bg-amber-50 text-amber-800",
  },
];

function TriRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: Tri;
  onChange: (value: Tri) => void;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-sm font-bold leading-relaxed text-slate-800">{label}</p>
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{hint}</p>}

      <div className="mt-2.5 flex flex-wrap gap-2">
        {TRI_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold transition ${
              value === option.value
                ? option.className
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ خطوة المحضونين ------------------------------ */

function ChildrenStep({
  items,
  setItems,
  todayLabel,
  endAge,
}: {
  items: Child[];
  setItems: (value: Child[]) => void;
  todayLabel: string;
  /** سن انتهاء الحضانة — عنده فقط يظهر خيار «غير قادر على رعاية نفسه» */
  endAge: number;
}) {
  const patch = (id: string, updates: Partial<Child>) => {
    setItems(items.map((child) => (child.id === id ? { ...child, ...updates } : child)));
  };

  const patchBirth = (id: string, updates: Partial<HijriDate>) => {
    setItems(
      items.map((child) =>
        child.id === id ? { ...child, birth: { ...child.birth, ...updates } } : child,
      ),
    );
  };

  // تاريخ اليوم بالتقويمين — يُحسب عند كل عرض فيتحدّث يومًا بيوم
  const todayG = hijriToGregorian(todayHijri());
  const todayDual = todayG
    ? `${todayLabel} الموافق ${formatGregorianAr(todayG)}`
    : todayLabel;

  return (
    <Card
      title="التحقق من المحضونين"
      hint={`المحضونون هم من تُطلب حضانتهم. الأعمار تُحسب بالتقويم الهجري. تاريخ اليوم: ${todayDual}`}
    >
      <div className="space-y-4">
        {items.map((child, index) => {
          // خيار عدم القدرة على رعاية النفس لا يؤثر إلا عند بلوغ سن الانتهاء،
          // فلا يظهر إلا إذا دلّت المدخلات على أن عمر المحضون بلغ ذلك السن.
          const showIncapacitated =
            isValidHijri(child.birth) && hijriAge(child.birth) >= endAge;

          return (
          <div key={child.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900">
                {["المحضون الأول", "المحضون الثاني", "المحضون الثالث", "المحضون الرابع"][
                  index
                ] ?? `المحضون ${index + 1}`}
              </h3>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => setItems(items.filter((item) => item.id !== child.id))}
                  className="text-xs font-bold text-rose-600 hover:underline"
                >
                  حذف
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">الاسم (اختياري)</label>
                <input
                  type="text"
                  value={child.name ?? ""}
                  onChange={(event) => patch(child.id, { name: event.target.value })}
                  className="field"
                  placeholder="يمكنك تركه فارغًا"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  لا نطلب اسم الطفل، ويمكنك الاكتفاء بـ«المحضون الأول».
                </p>
              </div>

              <div>
                <label className="label">الجنس</label>
                <select
                  value={child.gender}
                  onChange={(event) =>
                    patch(child.id, { gender: event.target.value as "m" | "f" })
                  }
                  className="field"
                >
                  <option value="m">ذكر</option>
                  <option value="f">أنثى</option>
                </select>
              </div>
            </div>

            <p className="label mt-4">تاريخ الميلاد</p>
            <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
              أدخل التاريخ بأيّ من التقويمين، فيتحوّل إلى الآخر مباشرة. المعتمد في الحساب هو
              الهجري.
            </p>

            {/* التقويم الهجري */}
            <span className="mb-1 block text-[11px] font-bold text-brand-700">هجري</span>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                min={1}
                max={30}
                value={child.birth.day || ""}
                onChange={(event) =>
                  patchBirth(child.id, { day: Number(event.target.value) })
                }
                className="field"
                placeholder="اليوم"
              />
              <select
                value={child.birth.month || ""}
                onChange={(event) =>
                  patchBirth(child.id, { month: Number(event.target.value) })
                }
                className="field"
              >
                <option value="">الشهر</option>
                {HIJRI_MONTHS.map((month, monthIndex) => (
                  <option key={month} value={monthIndex + 1}>
                    {month}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1300}
                max={1500}
                value={child.birth.year || ""}
                onChange={(event) =>
                  patchBirth(child.id, { year: Number(event.target.value) })
                }
                className="field"
                placeholder="السنة"
              />
            </div>

            {/* التقويم الميلادي — مشتق من الهجري ومتزامن معه */}
            <span className="mb-1 mt-3 block text-[11px] font-bold text-brand-700">ميلادي</span>
            <input
              type="date"
              min="1850-01-01"
              max="2100-12-31"
              value={
                isValidHijri(child.birth)
                  ? (() => {
                      const g = hijriToGregorian(child.birth);
                      return g ? toISODate(g) : "";
                    })()
                  : ""
              }
              onChange={(event) => {
                const g = parseISODate(event.target.value);
                if (g) {
                  const h = gregorianToHijri(
                    new Date(Date.UTC(g.year, g.month - 1, g.day)),
                  );
                  patchBirth(child.id, h);
                }
              }}
              className="field"
            />

            {isValidHijri(child.birth) &&
              (() => {
                const g = hijriToGregorian(child.birth);
                return g ? (
                  <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                    {formatHijri(child.birth)} · الموافق {formatGregorianAr(g)} · العمر{" "}
                    {hijriAge(child.birth)} سنة هجرية
                  </p>
                ) : null;
              })()}

            {showIncapacitated && (
              <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl bg-slate-50 p-3">
                <input
                  type="checkbox"
                  checked={child.incapacitated}
                  onChange={(event) =>
                    patch(child.id, { incapacitated: event.target.checked })
                  }
                  className="mt-0.5 h-4 w-4 accent-brand-600"
                />
                <span>
                  <span className="text-sm font-bold text-slate-800">
                    المحضون غير قادر على رعاية نفسه
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                    بلغ المحضون ثمانية عشر عامًا. فإذا كان مجنونًا أو معتوهًا أو مريضًا مرضًا
                    مقعدًا، تستمر الحضانة ولا تنتهي ببلوغه هذا السن.
                  </span>
                </span>
              </label>
            )}
          </div>
          );
        })}

        <button
          type="button"
          onClick={() => setItems([...items, blankChild(items.length)])}
          className="btn-ghost !py-2 text-sm"
        >
          + إضافة محضون آخر
        </button>
      </div>
    </Card>
  );
}

/* -------------------------------- النتيجة -------------------------------- */

const OUTCOME_STYLES: Record<
  ChildOutcome["kind"],
  { bar: string; chip: string; icon: string }
> = {
  assigned: {
    bar: "from-emerald-500 to-teal-500",
    chip: "bg-emerald-100 text-emerald-800",
    icon: "check",
  },
  obligated: {
    bar: "from-brand-600 to-brand-500",
    chip: "bg-brand-50 text-brand-800",
    icon: "gavel",
  },
  childChooses: {
    bar: "from-sky-500 to-cyan-500",
    chip: "bg-sky-100 text-sky-800",
    icon: "question",
  },
  ended: {
    bar: "from-slate-400 to-slate-300",
    chip: "bg-slate-100 text-slate-700",
    icon: "clock",
  },
  courtDiscretion: {
    bar: "from-amber-500 to-orange-500",
    chip: "bg-amber-100 text-amber-800",
    icon: "alert",
  },
};

const OUTCOME_LABELS: Record<ChildOutcome["kind"], string> = {
  assigned: "المستحق للحضانة غالبًا",
  obligated: "يُلزم بالحضانة",
  childChooses: "المحضون يختار",
  ended: "انتهت الحضانة",
  courtDiscretion: "يرجع الأمر إلى تقدير المحكمة",
};

// صيغ محايدة تصلح للمذكّر والمؤنث معًا (الأم، الأب، الجدتان)
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  eligible: { label: "الشروط متوافرة", className: "bg-emerald-100 text-emerald-800" },
  forfeited: { label: "الحق ساقط", className: "bg-rose-100 text-rose-800" },
  absent: { label: "غير موجود", className: "bg-slate-100 text-slate-600" },
};

function ResultView({
  result,
  config,
  toolId,
  lawyers,
  onRestart,
}: {
  result: ReturnType<typeof runCustodyChecker>;
  config: CustodyRuleConfig;
  toolId: string;
  lawyers: Lawyer[];
  onRestart: () => void;
}) {
  const copyResult = () => {
    const lines: string[] = ["نتيجة كاشف مستحق الحضانة", ""];

    for (const outcome of result.outcomes) {
      lines.push(`${outcome.childLabel} (${outcome.ageYears} سنة هجرية):`);
      lines.push(
        `  ${OUTCOME_LABELS[outcome.kind]}${outcome.winnerLabel ? `: ${outcome.winnerLabel}` : ""}`,
      );
      for (const reason of outcome.rationale) lines.push(`  - ${reason}`);
      lines.push("");
    }

    lines.push("النتيجة استرشادية، وللمحكمة أن تقرر خلاف الترتيب بناءً على مصلحة المحضون.");
    lines.push("المصدر: منصة محامي نفسك.");

    void navigator.clipboard.writeText(lines.join("\n"));
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "result_copy", toolId }),
    }).catch(() => {});
  };

  return (
    <div className="rise-in space-y-6">
      {result.needsLawyer && (
        <div className="flex items-start gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
            <Icon name="alert" className="h-5 w-5" />
          </span>
          <div>
            <p className="font-extrabold text-amber-900">النتيجة تحتاج تحققًا</p>
            <p className="mt-1 text-sm leading-relaxed text-amber-800">
              وردت إجابة «غير متأكد» على شرط أو أكثر. هذه النقاط قد تغيّر النتيجة كليًا،
              فتحقّق منها أو راجع محاميًا مرخّصًا قبل الاعتماد على ما يظهر أدناه.
            </p>
          </div>
        </div>
      )}

      {result.outcomes.map((outcome) => {
        const style = OUTCOME_STYLES[outcome.kind];

        return (
          <div key={outcome.childId}>
          <article className="card-soft overflow-hidden">
            <div className={`h-1.5 w-full bg-gradient-to-l ${style.bar}`} />

            <div className="p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-extrabold text-slate-900">
                  {outcome.childLabel}
                </h2>
                <span className="badge bg-slate-100 text-slate-700">
                  {outcome.ageYears} سنة هجرية
                </span>
              </div>

              <div className="mt-4">
                <span className={`badge ${style.chip}`}>
                  <Icon name={style.icon} className="h-3.5 w-3.5" />
                  {OUTCOME_LABELS[outcome.kind]}
                </span>

                {outcome.winnerLabel && (
                  <p className="mt-3 text-3xl font-black text-brand-800">
                    {outcome.winnerLabel}
                  </p>
                )}
              </div>

              <section className="mt-6">
                <h3 className="flex items-center gap-2 font-extrabold text-slate-900">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <Icon name="check" className="h-4 w-4" />
                  </span>
                  سبب النتيجة
                </h3>
                <ul className="mt-3 space-y-2">
                  {outcome.rationale.map((reason, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700"
                    >
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="mt-6">
                <h3 className="flex items-center gap-2 font-extrabold text-slate-900">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                    <Icon name="users" className="h-4 w-4" />
                  </span>
                  حالة كل مستحق
                </h3>

                <ul className="mt-3 space-y-2">
                  {outcome.evaluations.map((evaluation) => {
                    const status = STATUS_LABELS[evaluation.status];
                    return (
                      <li
                        key={evaluation.key}
                        className="rounded-xl border border-slate-200 bg-white p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900">{evaluation.label}</span>
                          <span className={`badge ${status.className}`}>{status.label}</span>
                          {evaluation.key === outcome.winnerKey && (
                            <span className="badge bg-brand-700 text-white">المستحق</span>
                          )}
                        </div>

                        {evaluation.forfeitReasons.length > 0 && (
                          <ul className="mt-2 space-y-1.5">
                            {evaluation.forfeitReasons.map((reason, index) => (
                              <li key={index} className="text-slate-600">
                                · {reason.text}
                                <span className="mr-1 text-xs text-slate-400">
                                  ({reason.article.split("—").pop()?.trim()})
                                </span>
                                {reason.exceptionPossible && (
                                  <span className="mr-1 text-xs text-amber-700">
                                    — للمحكمة استثناؤه لمصلحة المحضون
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}

                        {evaluation.uncertainties.length > 0 && (
                          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                            يحتاج تحققًا: {evaluation.uncertainties.join(" — ")}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>

              {outcome.notes.length > 0 && (
                <section className="mt-6">
                  <h3 className="flex items-center gap-2 font-extrabold text-slate-900">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <Icon name="alert" className="h-4 w-4" />
                    </span>
                    ملاحظات نظامية مهمة
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {[...new Set(outcome.notes)].map((note, index) => (
                      <li
                        key={index}
                        className="rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700"
                      >
                        {note}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                  <Icon name="scroll" className="h-4 w-4" />
                  المستند النظامي
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {[...new Set(outcome.articles)].map((article) => (
                    <li key={article}>· {article}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-500">
                  {config.jurisdiction} · إصدار الوحدة {config.version}
                  {config.lastReviewedAt
                    ? ` · آخر مراجعة قانونية: ${config.lastReviewedAt}`
                    : " · لم تُسجَّل مراجعة قانونية بعد"}
                  {config.legalReviewer && ` · المراجع القانوني: ${config.legalReviewer}`}
                </p>
              </section>
            </div>
          </article>

          {/* مرحلة الاعتراض — لكل محضون له حاضن معيّن في النتيجة */}
          {outcome.winnerLabel && (
            <CustodyObjection
              childId={outcome.childId}
              childLabel={outcome.childLabel}
              ageYears={outcome.ageYears}
              custodianLabel={outcome.winnerLabel}
              resultLabel={OUTCOME_LABELS[outcome.kind]}
              candidates={outcome.evaluations.map((evaluation) => ({
                label: evaluation.label,
                status: evaluation.status,
                reasons: evaluation.forfeitReasons.map((reason) => reason.text),
              }))}
            />
          )}
          </div>
        );
      })}

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-relaxed text-amber-900">
        <span className="font-extrabold">تنبيه:</span> هذه النتيجة استرشادية مبنية على ما
        أدخلته، وللمحكمة أن تقرر خلاف الترتيب بناءً على مصلحة المحضون. وهي لا تُغني عن
        استشارة محامٍ مرخّص يطّلع على وقائع حالتك كاملة.
      </div>

      <div className="flex flex-wrap gap-3 no-print">
        <button type="button" onClick={copyResult} className="btn-brand">
          نسخ النتيجة
        </button>
        <button type="button" onClick={() => window.print()} className="btn-ghost">
          طباعة
        </button>
        <button type="button" onClick={onRestart} className="btn-ghost">
          إعادة الكشف
        </button>
      </div>

      {lawyers.length > 0 && (
        <LawyerContact
          lawyers={lawyers}
          toolId={toolId}
          resultId="custody-checker"
          topicLabel="حضانة"
        />
      )}
    </div>
  );
}

/* ------------------------------- المقدّمة ------------------------------- */

function Intro({
  config,
  todayLabel,
  onStart,
}: {
  config: CustodyRuleConfig;
  todayLabel: string;
  onStart: () => void;
}) {
  return (
    <div className="card-soft rise-in p-6 sm:p-8">
      <h2 className="text-2xl font-black leading-snug text-slate-900 sm:text-3xl">
        إلى من تؤول حضانة الأبناء <span className="text-brand-700">نظامًا</span>؟
      </h2>

      <p className="mt-4 text-base leading-loose text-slate-600">{config.intro}</p>

      <ul className="mt-6 grid gap-2.5 text-sm text-slate-700 sm:grid-cols-2">
        {[
          "التحقق من المحضونين وأعمارهم بالتقويم الهجري",
          "التحقق من شروط الحاضن في المادتين (125) و(126)",
          "التحقق من أسباب سقوط الحضانة في المادة (128)",
          "إعمال أحكام السن في النظام واللائحة التنفيذية",
        ].map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Icon name="check" className="h-3.5 w-3.5" />
            </span>
            {item}
          </li>
        ))}
      </ul>

      <p className="mt-5 rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
        التاريخ الهجري اليوم: {todayLabel}
      </p>

      <button
        type="button"
        onClick={onStart}
        className="btn-brand mt-6 w-full justify-center sm:w-auto"
      >
        ابدأ الكاشف
        <Icon name="arrow" className="h-4 w-4" />
      </button>
    </div>
  );
}
