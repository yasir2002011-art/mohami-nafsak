"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { answeredTrail, runEngine, sourcesForResult, type Answers } from "@/lib/engine";
import type { DecisionEngine, EngineQuestion, EngineResult, Lawyer } from "@/types";
import LawyerContact from "@/components/LawyerContact";
import ResultFeedback from "@/components/ResultFeedback";

/**
 * مشغّل الأداة في المتصفح.
 *
 * الإجابات تبقى في ذاكرة المتصفح فقط ولا تُرسل إلى الخادم ولا تُحفظ.
 * ما يُرسل هو أحداث مجهولة (بدء/إكمال/انسحاب) بلا أي محتوى إجابة.
 */
export default function EngineRunner({
  engine,
  toolId,
  lawyers,
}: {
  engine: DecisionEngine;
  toolId: string;
  lawyers: Lawyer[];
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [started, setStarted] = useState(false);
  const [multiDraft, setMultiDraft] = useState<string[]>([]);

  const step = useMemo(() => runEngine(engine, answers), [engine, answers]);
  const trail = useMemo(() => answeredTrail(engine, answers), [engine, answers]);

  const ping = (type: string, questionId?: string, resultId?: string) => {
    // حدث مجهول — بلا أي إجابة أو بيان شخصي
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, toolId, questionId, resultId }),
      keepalive: true,
    }).catch(() => {});
  };

  const start = () => {
    setStarted(true);
    ping("tool_start");
  };

  const answer = (question: EngineQuestion, value: string | string[]) => {
    setAnswers((previous) => ({ ...previous, [question.id]: value }));
    setMultiDraft([]);
  };

  const goBack = () => {
    const last = trail[trail.length - 1];
    if (!last) return;
    setAnswers((previous) => {
      const next = { ...previous };
      delete next[last.question.id];
      return next;
    });
    setMultiDraft([]);
  };

  const restart = () => {
    setAnswers({});
    setMultiDraft([]);
    setStarted(false);
  };

  if (!started) {
    return <IntroCard engine={engine} onStart={start} />;
  }

  if (step.kind === "result" && step.result) {
    return (
      <ResultCard
        engine={engine}
        result={step.result}
        trail={trail}
        toolId={toolId}
        lawyers={lawyers}
        onRestart={restart}
        onMount={() => ping("tool_complete", undefined, step.result?.id)}
      />
    );
  }

  if (step.kind === "question" && step.question) {
    const question = step.question;
    const progress = Math.round(
      (step.answeredCount / Math.max(step.estimatedTotal, 1)) * 100,
    );

    return (
      <div className="card-soft rise-in overflow-hidden">
        {/* شريط التقدّم */}
        <div className="h-1.5 w-full bg-brand-50">
          <div
            className="h-full brand-gradient transition-all duration-500"
            style={{ width: `${Math.min(Math.max(progress, 8), 95)}%` }}
          />
        </div>

        <div className="p-6 sm:p-8">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-400">
            <Icon name="sparkle" className="h-4 w-4" />
            السؤال {step.answeredCount + 1}
          </div>

          <h2 className="text-xl font-extrabold leading-relaxed text-slate-900 sm:text-2xl">
            {question.text}
          </h2>

          {question.hint && (
            <p className="mt-2 rounded-xl bg-slate-50 px-4 py-2.5 text-sm leading-relaxed text-brand-700">
              {question.hint}
            </p>
          )}

          <div className="mt-6 space-y-3">
            {question.type === "multi" ? (
              <MultiChoice
                question={question}
                draft={multiDraft}
                setDraft={setMultiDraft}
                onConfirm={() => answer(question, multiDraft)}
              />
            ) : (
              question.options?.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => answer(question, option.id)}
                  className="group flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-slate-200 bg-white/80 px-5 py-4 text-right text-base font-bold text-slate-800 transition hover:-translate-y-0.5 hover:border-brand-500 hover:bg-brand-50 hover:shadow-lg"
                >
                  <span>{option.label}</span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition group-hover:bg-brand-500 group-hover:text-white">
                    <Icon name="arrow" className="h-4 w-4" />
                  </span>
                </button>
              ))
            )}
          </div>

          {trail.length > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="mt-6 text-sm font-bold text-slate-500 underline-offset-4 hover:underline"
            >
              رجوع للسؤال السابق
            </button>
          )}

          <PrivacyNote />
        </div>
      </div>
    );
  }

  return (
    <div className="card-soft p-8 text-center">
      <p className="font-bold text-slate-800">
        لم نتمكّن من إكمال المسار بهذه الإجابات.
      </p>
      <button type="button" onClick={restart} className="btn-ghost mt-4">
        إعادة البدء
      </button>
    </div>
  );
}

/* ------------------------------- المقدّمة ------------------------------- */

function IntroCard({ engine, onStart }: { engine: DecisionEngine; onStart: () => void }) {
  return (
    <div className="card-soft rise-in p-6 sm:p-8">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-1.5 text-xs font-extrabold text-brand-800">
        <Icon name="sparkle" className="h-4 w-4" />
        {engine.questions.length} أسئلة تقريبًا · دقيقتان
      </div>

      <p className="text-base leading-loose text-slate-600">{engine.intro}</p>

      <ul className="mt-5 grid gap-2.5 text-sm text-slate-600 sm:grid-cols-2">
        {[
          "لا نطلب اسمك ولا هويتك ولا رقم قضيتك",
          "إجاباتك لا تُحفظ بعد ظهور النتيجة",
          "النتيجة تبيّن لك أسبابها ومصادرها",
          "لا نرسل شيئًا لأي محامٍ إلا بموافقتك",
        ].map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Icon name="check" className="h-3.5 w-3.5" />
            </span>
            {item}
          </li>
        ))}
      </ul>

      <button type="button" onClick={onStart} className="btn-brand mt-7 w-full justify-center sm:w-auto">
        ابدأ الأسئلة
      </button>
    </div>
  );
}

/* --------------------------- سؤال متعدد الاختيار --------------------------- */

function MultiChoice({
  question,
  draft,
  setDraft,
  onConfirm,
}: {
  question: EngineQuestion;
  draft: string[];
  setDraft: (value: string[]) => void;
  onConfirm: () => void;
}) {
  const toggle = (id: string) => {
    setDraft(draft.includes(id) ? draft.filter((item) => item !== id) : [...draft, id]);
  };

  return (
    <>
      {question.options?.map((option) => {
        const selected = draft.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => toggle(option.id)}
            className={`flex w-full items-center gap-3 rounded-2xl border-2 px-5 py-3.5 text-right text-base font-bold transition ${
              selected
                ? "border-brand-500 bg-brand-50 text-brand-800"
                : "border-slate-200 bg-white/80 text-slate-800 hover:border-brand-300"
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition ${
                selected ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200"
              }`}
            >
              {selected && <Icon name="check" className="h-3.5 w-3.5" />}
            </span>
            {option.label}
          </button>
        );
      })}

      <button
        type="button"
        onClick={onConfirm}
        disabled={draft.length === 0}
        className="btn-brand mt-2 w-full justify-center disabled:cursor-not-allowed disabled:opacity-40"
      >
        متابعة
      </button>
    </>
  );
}

/* -------------------------------- النتيجة -------------------------------- */

const TONE_STYLES = {
  positive: { bar: "from-teal-400 to-emerald-500", chip: "bg-emerald-100 text-emerald-800", icon: "check" },
  neutral: { bar: "from-brand-500 to-brand-400", chip: "bg-brand-50 text-slate-700", icon: "sparkle" },
  caution: { bar: "from-amber-400 to-orange-400", chip: "bg-amber-100 text-amber-800", icon: "clock" },
  warning: { bar: "from-rose-600 to-rose-500", chip: "bg-rose-100 text-rose-800", icon: "alert" },
} as const;

function ResultCard({
  engine,
  result,
  trail,
  toolId,
  lawyers,
  onRestart,
  onMount,
}: {
  engine: DecisionEngine;
  result: EngineResult;
  trail: { question: EngineQuestion; label: string }[];
  toolId: string;
  lawyers: Lawyer[];
  onRestart: () => void;
  onMount: () => void;
}) {
  const [reported, setReported] = useState(false);
  const tone = TONE_STYLES[result.tone];
  const sources = sourcesForResult(engine, result);

  // إرسال حدث الإكمال مرة واحدة عند ظهور النتيجة
  useEffect(() => {
    onMount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.id]);

  const copyResult = () => {
    const text = [
      result.title,
      "",
      result.summary,
      "",
      "أسباب النتيجة:",
      ...result.reasons.map((reason) => `- ${reason}`),
      "",
      "الخطوات التالية:",
      ...result.nextActions.map((action) => `- ${action}`),
      "",
      "وقائع قد تغيّر النتيجة:",
      ...result.missingFacts.map((fact) => `- ${fact}`),
      "",
      "المصدر: منصة محامي نفسك — معلومات عامة ولا تُعد استشارة قانونية.",
    ].join("\n");

    void navigator.clipboard.writeText(text);
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "result_copy", toolId, resultId: result.id }),
    }).catch(() => {});
  };

  return (
    <div className="rise-in space-y-6">
      {result.urgentNotice && (
        <div className="flex items-start gap-3 rounded-2xl border-2 border-rose-300 bg-rose-50 p-5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
            <Icon name="alert" className="h-5 w-5" />
          </span>
          <div>
            <p className="font-extrabold text-rose-900">تنبيه عاجل بخصوص المواعيد</p>
            <p className="mt-1 text-sm leading-relaxed text-rose-800">{result.urgentNotice}</p>
          </div>
        </div>
      )}

      <article className="card-soft overflow-hidden">
        <div className={`h-2 w-full bg-gradient-to-l ${tone.bar}`} />

        <div className="p-6 sm:p-8">
          <span className={`badge ${tone.chip}`}>
            <Icon name={tone.icon} className="h-3.5 w-3.5" />
            نتيجتك
          </span>

          <h2 className="mt-3 text-2xl font-extrabold leading-snug text-slate-900 sm:text-3xl">
            {result.title}
          </h2>
          <p className="mt-3 text-base leading-loose text-slate-600">{result.summary}</p>

          <ResultList
            title="لماذا ظهرت لك هذه النتيجة"
            icon="check"
            accent="teal"
            items={result.reasons}
          />
          <ResultList
            title="الخطوات العملية التالية"
            icon="arrow"
            accent="violet"
            items={result.nextActions}
          />
          <ResultList
            title="وقائع ناقصة قد تغيّر النتيجة"
            icon="alert"
            accent="amber"
            items={result.missingFacts}
          />
          <ResultList
            title="متى تحتاج محاميًا مرخّصًا"
            icon="users"
            accent="rose"
            items={result.whenToSeeLawyer}
          />

          {/* المصادر النظامية */}
          <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-800">
              <Icon name="scroll" className="h-4 w-4" />
              المصادر النظامية
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              النطاق النظامي: {engine.jurisdiction}
            </p>

            <ul className="mt-3 space-y-2.5">
              {sources.map((source) => (
                <li key={source.id} className="rounded-xl bg-white/80 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-800">{source.regulation}</span>
                    {source.article && (
                      <span className="text-slate-600">المادة {source.article}</span>
                    )}
                    {!source.verified && (
                      <span className="badge bg-amber-100 text-amber-800">
                        بانتظار المراجعة القانونية
                      </span>
                    )}
                  </div>
                  {source.text && (
                    <p className="mt-1 text-slate-600">{source.text}</p>
                  )}
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block font-bold text-brand-700 hover:underline"
                    >
                      المصدر الرسمي
                    </a>
                  )}
                </li>
              ))}
            </ul>

            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              إصدار المحرك {engine.version} · الحالة:{" "}
              {engine.status === "published" ? "منشور" : "قيد الإعداد"}
              {engine.lastReviewedAt
                ? ` · آخر مراجعة قانونية: ${engine.lastReviewedAt}`
                : " · لم تُسجَّل مراجعة قانونية بعد"}
              {engine.legalReviewer && ` · المراجع القانوني: ${engine.legalReviewer}`}
            </p>
          </section>

          {/* الإجابات التي بُنيت عليها النتيجة */}
          <details className="mt-6 rounded-2xl border border-slate-200 bg-white/70 p-4">
            <summary className="cursor-pointer text-sm font-extrabold text-slate-800">
              الوقائع التي بُنيت عليها النتيجة ({trail.length})
            </summary>
            <ul className="mt-3 space-y-2 text-sm">
              {trail.map((entry) => (
                <li key={entry.question.id} className="border-r-2 border-slate-200 pr-3">
                  <p className="text-slate-500">{entry.question.text}</p>
                  <p className="font-bold text-slate-800">{entry.label}</p>
                </li>
              ))}
            </ul>
          </details>

          {/* أزرار */}
          <div className="mt-7 flex flex-wrap gap-3 no-print">
            <button type="button" onClick={copyResult} className="btn-brand">
              نسخ النتيجة
            </button>
            <button type="button" onClick={() => window.print()} className="btn-ghost">
              طباعة
            </button>
            <button type="button" onClick={onRestart} className="btn-ghost">
              إعادة الأسئلة
            </button>
          </div>
        </div>
      </article>

      {/* رضا المستخدم عن النتيجة */}
      <ResultFeedback toolId={toolId} resultLabel={result.title} />

      {/* المحامون — معزولون تمامًا عن النتيجة القانونية */}
      {lawyers.length > 0 && (
        <LawyerContact
          lawyers={lawyers}
          toolId={toolId}
          resultId={result.id}
          topicLabel={engine.legalDomain}
        />
      )}

      {/* الإبلاغ عن خطأ أو تحديث نظامي */}
      <div className="card-soft p-5 no-print">
        {reported ? (
          <p className="text-sm font-bold text-emerald-700">
            وصلنا بلاغك، شكرًا لك. سيراجعه الفريق القانوني.
          </p>
        ) : (
          <ReportForm
            toolId={toolId}
            engineId={engine.id}
            onDone={() => setReported(true)}
          />
        )}
      </div>

      <p className="px-2 text-center text-xs leading-relaxed text-slate-500">
        هذه النتيجة معلومات عامة مبنية على ما أدخلته أنت، ولا تُعد استشارة قانونية
        ولا تنشئ علاقة موكِّل بمحامٍ، ولا تتضمن ضمانًا بنتيجة أي دعوى.
      </p>
    </div>
  );
}

const ACCENTS = {
  teal: "bg-emerald-100 text-emerald-700",
  violet: "bg-brand-50 text-brand-700",
  amber: "bg-amber-100 text-amber-700",
  rose: "bg-rose-100 text-rose-700",
} as const;

function ResultList({
  title,
  icon,
  accent,
  items,
}: {
  title: string;
  icon: string;
  accent: keyof typeof ACCENTS;
  items: string[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="mt-7">
      <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${ACCENTS[accent]}`}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
        {title}
      </h3>
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-start gap-2.5 rounded-xl bg-white/70 p-3 text-sm leading-relaxed text-slate-700"
          >
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReportForm({
  toolId,
  engineId,
  onDone,
}: {
  toolId: string;
  engineId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState("legal-update");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-bold text-slate-600 underline-offset-4 hover:underline"
      >
        الإبلاغ عن خطأ أو تحديث نظامي في هذه النتيجة
      </button>
    );
  }

  const submit = async () => {
    if (!message.trim()) return;
    await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolId, engineId, kind, message }),
    });
    onDone();
  };

  return (
    <div className="space-y-3">
      <label className="label">نوع البلاغ</label>
      <select value={kind} onChange={(event) => setKind(event.target.value)} className="field">
        <option value="legal-update">تحديث نظامي (تغيّرت المادة أو الإجراء)</option>
        <option value="wrong-result">النتيجة لا تناسب حالتي</option>
        <option value="broken-link">رابط لا يعمل</option>
        <option value="other">أخرى</option>
      </select>

      <label className="label">التفاصيل</label>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={3}
        className="field"
        placeholder="اكتب ملاحظتك دون ذكر أي تفاصيل شخصية عن قضيتك."
      />

      <div className="flex gap-2">
        <button type="button" onClick={submit} className="btn-brand !py-2 text-sm">
          إرسال البلاغ
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost !py-2 text-sm">
          إلغاء
        </button>
      </div>
    </div>
  );
}

function PrivacyNote() {
  return (
    <p className="mt-6 flex items-center gap-2 text-xs text-slate-400">
      <Icon name="lock" className="h-3.5 w-3.5" />
      إجاباتك على هذه الأسئلة تبقى في متصفحك ولا تُرسل إلى الخادم ولا تُحفظ إلا بموافقتك.
    </p>
  );
}
