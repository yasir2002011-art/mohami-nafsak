"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import type { Lawyer } from "@/types";

/**
 * التواصل مع محامٍ.
 *
 * القواعد المطبّقة هنا:
 * 1. لا تُرسل أي تفاصيل قضية تلقائيًا عند الضغط على واتساب.
 * 2. تظهر موافقة صريحة منفصلة قبل مشاركة أي ملخص.
 * 3. الرسالة الأولى تحمل الحد الأدنى فقط: «عميل من منصة محامي نفسك بخصوص مسألة ...».
 * 4. المحامي المعلن مميّز بوضوح عن المحامي المقترح غير المدفوع.
 */
export default function LawyerContact({
  lawyers,
  toolId,
  resultId,
  topicLabel,
}: {
  lawyers: (Lawyer & { placement?: "sponsored" | "recommended" })[];
  toolId: string;
  resultId: string;
  topicLabel: string;
}) {
  return (
    <section className="card-soft p-6 no-print">
      <h3 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Icon name="users" className="h-4 w-4" />
        </span>
        تحتاج مساعدة محامٍ مرخّص؟
      </h3>

      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        اختيارك للتواصل اختياري تمامًا، ولا يؤثر على النتيجة التي ظهرت لك. لن نرسل أي تفاصيل
        عن قضيتك، وستُطلب موافقتك صراحةً قبل مشاركة أي معلومة.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {lawyers.map((lawyer) => (
          <LawyerCard
            key={lawyer.id}
            lawyer={lawyer}
            toolId={toolId}
            resultId={resultId}
            topicLabel={topicLabel}
          />
        ))}
      </div>
    </section>
  );
}

function LawyerCard({
  lawyer,
  toolId,
  resultId,
  topicLabel,
}: {
  lawyer: Lawyer & { placement?: "sponsored" | "recommended" };
  toolId: string;
  resultId: string;
  topicLabel: string;
}) {
  const [step, setStep] = useState<"idle" | "consent" | "done">("idle");
  const [shareSummary, setShareSummary] = useState(false);

  const proceed = async () => {
    // تُسجَّل الإحالة: من أي أداة ونتيجة، وأي محامٍ، ومتى — بلا تفاصيل قضية
    await fetch("/api/referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lawyerId: lawyer.id,
        toolId,
        resultId,
        topicLabel,
        consentGiven: shareSummary,
      }),
    }).catch(() => {});

    // الرسالة تحمل الحد الأدنى فقط
    const message = `السلام عليكم، عميل قادم من منصة «محامي نفسك» بخصوص مسألة ${topicLabel}.`;
    const number = (lawyer.whatsapp ?? "").replace(/[^\d]/g, "");

    setStep("done");
    if (number) {
      window.open(
        `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer",
      );
    }
  };

  return (
    <article className="card-hover rounded-2xl border border-slate-200 bg-white/85 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="brand-gradient flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-extrabold text-white">
            {lawyer.name.slice(0, 1)}
          </span>
          <div>
            <p className="font-extrabold text-slate-900">{lawyer.name}</p>
            <p className="text-xs text-slate-500">
              {lawyer.city} · ترخيص {lawyer.licenseNumber}
            </p>
          </div>
        </div>

        <span
          className={`badge ${
            lawyer.placement === "sponsored"
              ? "bg-amber-100 text-amber-800"
              : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {lawyer.placement === "sponsored" ? "محامٍ معلن" : "ترشيح غير مدفوع"}
        </span>
      </div>

      {lawyer.specialties.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {lawyer.specialties.slice(0, 3).map((specialty) => (
            <span key={specialty} className="badge bg-brand-50 text-brand-700">
              {specialty}
            </span>
          ))}
        </div>
      )}

      {step === "idle" && (
        <button
          type="button"
          onClick={() => setStep("consent")}
          className="btn-brand mt-4 w-full justify-center !py-2.5 text-sm"
        >
          تواصل عبر واتساب
        </button>
      )}

      {step === "consent" && (
        <div className="mt-4 rounded-xl border-2 border-amber-200 bg-amber-50/70 p-3.5">
          <p className="text-sm font-extrabold text-amber-900">قبل المتابعة</p>
          <p className="mt-1.5 text-xs leading-relaxed text-amber-900/85">
            سنفتح لك محادثة واتساب برسالة تحتوي على الحد الأدنى فقط:
            <span className="mt-1.5 block rounded-lg bg-white/80 p-2 font-bold" dir="rtl">
              «عميل قادم من منصة محامي نفسك بخصوص مسألة {topicLabel}.»
            </span>
          </p>

          <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-amber-900">
            <input
              type="checkbox"
              checked={shareSummary}
              onChange={(event) => setShareSummary(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-600"
            />
            أوافق على أن أشارك المحامي بنفسي ملخص حالتي داخل المحادثة (اختياري).
          </label>

          <p className="mt-2 text-[11px] leading-relaxed text-amber-800">
            لن ترسل المنصة أي أسماء أو وقائع أو مستندات. أنت وحدك من يقرر ما يُكتب في المحادثة.
          </p>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={proceed}
              className="btn-brand !px-4 !py-2 text-xs"
            >
              موافق، افتح واتساب
            </button>
            <button
              type="button"
              onClick={() => setStep("idle")}
              className="btn-ghost !px-4 !py-2 text-xs"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
          فُتحت المحادثة. إن لم تُفتح تلقائيًا فتأكّد من السماح بالنوافذ المنبثقة.
        </p>
      )}
    </article>
  );
}
