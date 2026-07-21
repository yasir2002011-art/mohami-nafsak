"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

/**
 * تقييم رضا المستخدم عن النتيجة.
 *
 * بعد ظهور النتيجة يُسأل: هل أنت راضٍ عنها؟
 *  - نعم  → يُسجَّل حدث مجهول (result_satisfied) فقط، دون أي بيانات.
 *  - لا   → تظهر خانة «علّل» ثم يُرسل التعليل كبلاغ يظهر في لوحة الإدارة
 *           (نوعه unsatisfied-result) لمراجعته وتحسين شجرة القرار.
 *
 * ما يُرسَل هو ما يكتبه المستخدم بنفسه فقط، مع وسم النتيجة العام (بلا اسم
 * ولا بيانات شخصية). لا تُرسل إجاباته على الأسئلة.
 */
export default function ResultFeedback({
  toolId,
  resultLabel,
}: {
  toolId: string;
  /** وسم عام للنتيجة (مثل: «المستحق للحضانة: الأم») — بلا بيانات شخصية */
  resultLabel?: string;
}) {
  const [stage, setStage] = useState<"ask" | "explain" | "done-yes" | "done-no">("ask");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const track = (type: "result_satisfied" | "result_unsatisfied") => {
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, toolId }),
      keepalive: true,
    }).catch(() => {});
  };

  const onYes = () => {
    track("result_satisfied");
    setStage("done-yes");
  };

  const onNo = () => {
    track("result_unsatisfied");
    setStage("explain");
  };

  const submit = async () => {
    const text = reason.trim();
    if (!text) return;
    setBusy(true);

    await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toolId,
        kind: "unsatisfied-result",
        message: resultLabel
          ? `عدم رضا عن النتيجة (${resultLabel}): ${text}`
          : `عدم رضا عن النتيجة: ${text}`,
      }),
    }).catch(() => {});

    setStage("done-no");
  };

  if (stage === "done-yes") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800 no-print">
        شكرًا لك. سعدنا بأن النتيجة كانت واضحة ومفيدة.
      </div>
    );
  }

  if (stage === "done-no") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-800 no-print">
        <p className="font-extrabold">وصلنا تعليلك، شكرًا لك.</p>
        <p className="mt-1">
          سيراجعه الفريق القانوني، وملاحظتك تساعدنا على تحسين دقة الكاشف. إن كانت
          حالتك عاجلة فلا تنتظر — راجع محاميًا مرخّصًا.
        </p>
      </div>
    );
  }

  return (
    <div className="card-soft p-5 no-print">
      {stage === "ask" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-extrabold text-slate-900">
            هل أنت راضٍ عن هذه النتيجة؟
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onYes}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-emerald-500 bg-emerald-50 px-5 py-1.5 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100"
            >
              <Icon name="check" className="h-4 w-4" />
              نعم
            </button>
            <button
              type="button"
              onClick={onNo}
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-rose-400 bg-rose-50 px-5 py-1.5 text-sm font-bold text-rose-700 transition hover:bg-rose-100"
            >
              لا
            </button>
          </div>
        </div>
      ) : (
        <div>
          <label htmlFor="feedback-reason" className="text-sm font-extrabold text-slate-900">
            نأسف لذلك. علّل عدم رضاك حتى نتمكّن من تحسين الكاشف
          </label>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            اكتب ما تراه في النتيجة دون ذكر أسماء أو أي بيانات شخصية عن قضيتك.
          </p>

          <textarea
            id="feedback-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            maxLength={1500}
            className="field mt-3"
            placeholder="مثال: أرى أن النتيجة أغفلت واقعة كذا، أو أن ترتيب المستحقين لا يناسب حالتي لأن..."
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy || !reason.trim()}
              className="btn-brand !py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "جارٍ الإرسال..." : "إرسال التعليل"}
            </button>
            <button
              type="button"
              onClick={() => setStage("ask")}
              className="btn-ghost !py-2 text-sm"
            >
              رجوع
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
