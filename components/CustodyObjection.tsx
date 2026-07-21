"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import Markdown from "@/components/Markdown";

/**
 * مرحلة الاعتراض على نتيجة الحضانة — لكل محضون على حدة.
 *
 * بعد ظهور المستحق للحضانة يُسأل المستخدم: هل ترى أن مصلحة المحضون تتحقق مع
 * الحاضن المذكور؟ فإن اختار «لا» ظهرت أربع خانات، ثم زر تحليل استرشادي
 * بالذكاء الاصطناعي (Gemini) يعمل عبر مسار خادم فلا يظهر المفتاح للمتصفح.
 *
 * كل نسخة من هذا المكوّن مستقلة الحالة تمامًا، فبيانات محضون لا تختلط بمحضون آخر.
 */

const PREFERRED_OPTIONS = [
  { value: "", label: "— اختر —" },
  { value: "الأب", label: "الأب" },
  { value: "الأم", label: "الأم" },
  { value: "الجدة (أم الأم)", label: "الجدة (أم الأم)" },
  { value: "الجدة (أم الأب)", label: "الجدة (أم الأب)" },
  { value: "other", label: "شخص آخر" },
];

const MIN_REASON = 10;

export default function CustodyObjection({
  childId,
  childLabel,
  ageYears,
  custodianLabel,
  resultLabel,
}: {
  childId: string;
  childLabel: string;
  ageYears: number;
  /** الحاضن الذي انتهت إليه النتيجة */
  custodianLabel: string;
  /** وسم النتيجة، مثل: «المستحق للحضانة غالبًا» */
  resultLabel: string;
}) {
  const [satisfied, setSatisfied] = useState<null | boolean>(null);

  const [reason, setReason] = useState("");
  const [preferred, setPreferred] = useState("");
  const [preferredOther, setPreferredOther] = useState("");
  const [benefitsWith, setBenefitsWith] = useState("");
  const [benefitsLost, setBenefitsLost] = useState("");

  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingKey, setMissingKey] = useState(false);

  const canAnalyze =
    reason.trim().length >= MIN_REASON &&
    preferred.length > 0 &&
    (preferred !== "other" || preferredOther.trim().length > 0);

  const track = (type: "result_satisfied" | "result_unsatisfied") => {
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, toolId: "tool-custody" }),
      keepalive: true,
    }).catch(() => {});
  };

  /** إرسال بيانات هذا المحضون وحده إلى مسار التحليل */
  const analyzeCustodyObjection = async (id: string) => {
    if (!canAnalyze || busy) return;
    setBusy(true);
    setError(null);
    setMissingKey(false);
    setAnalysis(null);

    try {
      const response = await fetch("/api/analyze-objection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId: id,
          childName: childLabel,
          childAge: ageYears,
          currentCustodian: custodianLabel,
          resultLabel,
          objectionReason: reason,
          preferredCustodian: preferred === "other" ? preferredOther : preferred,
          benefitsWithAlternative: benefitsWith,
          benefitsLost: benefitsLost,
        }),
      });

      const data = await response.json();
      if (data.missingKey) {
        setMissingKey(true);
      } else if (data.ok) {
        setAnalysis(data.analysis as string);
      } else {
        setError(data.error ?? "تعذّر التحليل.");
      }
    } catch {
      setError("تعذّر الاتصال. تحقّق من الشبكة وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-soft mt-3 p-5 no-print">
      {/* السؤال المستقل */}
      <p className="text-sm font-extrabold leading-relaxed text-slate-900">
        هل ترى أن مصلحة {childLabel} تتحقق مع الحاضن المذكور في النتيجة (
        {custodianLabel})؟
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setSatisfied(true);
            track("result_satisfied");
          }}
          className={`inline-flex items-center gap-1.5 rounded-full border-2 px-5 py-1.5 text-sm font-bold transition ${
            satisfied === true
              ? "border-emerald-500 bg-emerald-50 text-emerald-800"
              : "border-slate-200 bg-white text-slate-500 hover:border-emerald-300"
          }`}
        >
          <Icon name="check" className="h-4 w-4" />
          نعم
        </button>
        <button
          type="button"
          onClick={() => {
            setSatisfied(false);
            track("result_unsatisfied");
          }}
          className={`inline-flex items-center gap-1.5 rounded-full border-2 px-5 py-1.5 text-sm font-bold transition ${
            satisfied === false
              ? "border-rose-400 bg-rose-50 text-rose-700"
              : "border-slate-200 bg-white text-slate-500 hover:border-rose-300"
          }`}
        >
          لا
        </button>
      </div>

      {/* نعم: تنتهي المرحلة */}
      {satisfied === true && (
        <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800">
          شكرًا لك.
        </p>
      )}

      {/* لا: الخانات الأربع */}
      {satisfied === false && (
        <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
          <div>
            <label htmlFor={`reason-${childId}`} className="label">
              لماذا لا ترى أن مصلحة المحضون تتحقق مع الحاضن المذكور؟
            </label>
            <textarea
              id={`reason-${childId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={1500}
              className="field"
              placeholder="مثال: الأم غير مؤهلة لرعاية المحضون بسبب..."
            />
            <p className="mt-1 text-[11px] text-slate-400">
              اكتب أسبابك دون ذكر أسماء أو بيانات شخصية غير لازمة (الحد الأدنى{" "}
              {MIN_REASON} أحرف).
            </p>
          </div>

          <div>
            <label htmlFor={`preferred-${childId}`} className="label">
              من تراه أصلح للحضانة؟
            </label>
            <select
              id={`preferred-${childId}`}
              value={preferred}
              onChange={(event) => setPreferred(event.target.value)}
              className="field"
            >
              {PREFERRED_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {preferred === "other" && (
              <input
                type="text"
                value={preferredOther}
                onChange={(event) => setPreferredOther(event.target.value)}
                maxLength={80}
                className="field mt-2"
                placeholder="اكتب من تراه أصلح"
              />
            )}
          </div>

          <div>
            <label htmlFor={`with-${childId}`} className="label">
              ما المصالح التي تتحقق للمحضون ببقائه مع من تراه أصلح؟
            </label>
            <textarea
              id={`with-${childId}`}
              value={benefitsWith}
              onChange={(event) => setBenefitsWith(event.target.value)}
              rows={3}
              maxLength={1500}
              className="field"
            />
          </div>

          <div>
            <label htmlFor={`lost-${childId}`} className="label">
              ما المصالح التي قد تفوت على المحضون إذا بقي مع الحاضن الحالي؟
            </label>
            <textarea
              id={`lost-${childId}`}
              value={benefitsLost}
              onChange={(event) => setBenefitsLost(event.target.value)}
              rows={3}
              maxLength={1500}
              className="field"
            />
          </div>

          <button
            type="button"
            onClick={() => analyzeCustodyObjection(childId)}
            disabled={!canAnalyze || busy}
            className="btn-brand !py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="sparkle" className="h-4 w-4" />
            {busy ? "جارٍ التحليل..." : "تحليل أسباب الاعتراض بالذكاء الاصطناعي"}
          </button>

          <p className="text-[11px] leading-relaxed text-slate-400">
            يُرسَل ما كتبته ونتيجة الأداة إلى خدمة تحليل خارجية لإصدار تحليل استرشادي.
            التحليل لا يغيّر النتيجة ولا يقرر انتقال الحضانة، والقرار النهائي للمحكمة.
          </p>

          {/* تنبيه المطور عند غياب المفتاح */}
          {missingKey && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
              <span className="font-extrabold">تنبيه للمطوّر:</span> لم يُضبَط مفتاح
              الذكاء الاصطناعي. أضِف <code className="rounded bg-amber-100 px-1">GEMINI_API_KEY</code>{" "}
              في متغيّرات البيئة لتفعيل التحليل. باقي الموقع يعمل دون تعطّل.
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
              {error}
            </div>
          )}

          {/* صندوق التحليل */}
          {analysis && (
            <section className="rounded-2xl border-2 border-brand-100 bg-brand-50/40 p-5">
              <h3 className="flex items-center gap-2 text-base font-extrabold text-brand-800">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <Icon name="sparkle" className="h-4 w-4" />
                </span>
                تحليل استرشادي لأسباب الاعتراض
              </h3>
              <div className="mt-3">
                <Markdown source={analysis} />
              </div>
              <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                هذا التحليل استرشادي بالذكاء الاصطناعي، ولا يُعد استشارة قانونية ولا يقرر
                انتقال الحضانة. القرار النهائي للمحكمة بعد ثبوت الأسباب بأدلة معتبرة.
              </p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
