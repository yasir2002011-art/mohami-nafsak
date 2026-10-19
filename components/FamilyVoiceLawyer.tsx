"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { LogoMark } from "@/components/Logo";
import LawyerContact from "@/components/LawyerContact";
import { track } from "@/lib/track";
import {
  INITIAL_STATE,
  MAX_SECONDS,
  VoiceCall,
  voiceSupport,
  type CallLine,
  type Phase,
} from "@/lib/voice-call";
import type { Lawyer } from "@/types";

/**
 * المحامي الأسري الصوتي — تجربة مكالمة.
 *
 * الزائر يضغط «اتصال»، فيسمع رنينًا ثم ترحيبًا منطوقًا، ثم يتحاور بصوته بلا أي
 * ضغط أزرار حتى ينهي المكالمة. كل المنطق في lib/voice-call.ts؛ هذا المكوّن عرض فقط.
 *
 * المساعد آلي لا محامٍ، يجيب من نصوص رسمية بصياغة استرشادية، والمحادثة لا تُحفظ.
 */

const SERVER_SUPPORT = { recognition: true, synthesis: true };
let cachedSupport: { recognition: boolean; synthesis: boolean } | null = null;
const supportSnapshot = () => (cachedSupport ??= voiceSupport());
const noopSubscribe = () => () => {};

const TOPICS = ["الحضانة والزيارة", "النفقة", "الطلاق والخلع", "الزواج والولاية", "المواريث والوصية", "الإثبات ورفع الدعوى"];

const STATUS: Record<Phase, string> = {
  idle: "",
  ringing: "جارٍ الاتصال…",
  listening: "أستمع إليك…",
  thinking: "أراجع الأنظمة…",
  speaking: "المساعد يتحدث",
  ended: "انتهت المكالمة",
};

const ENDED_NOTE: Record<string, string> = {
  user: "أنهيت المكالمة.",
  limit: "بلغت المكالمة حدّها الأقصى.",
  idle: "أُنهيت المكالمة لعدم سماع صوت.",
  error: "تعذّر إكمال المكالمة.",
};

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function PhoneIcon({ className = "h-6 w-6", down = false }: { className?: string; down?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={down ? { transform: "rotate(135deg)" } : undefined}
      aria-hidden="true"
    >
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
    </svg>
  );
}

function MicIcon({ off = false, className = "h-6 w-6" }: { off?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

export default function FamilyVoiceLawyer({
  toolId,
  lawyers,
}: {
  toolId: string;
  lawyers: (Lawyer & { placement?: "sponsored" | "recommended" })[];
}) {
  const [call] = useState(() => new VoiceCall(toolId));
  const state = useSyncExternalStore(call.subscribe, call.getSnapshot, () => INITIAL_STATE);
  const support = useSyncExternalStore(noopSubscribe, supportSnapshot, () => SERVER_SUPPORT);
  const [agreed, setAgreed] = useState(false);
  const [typed, setTyped] = useState("");
  const [rated, setRated] = useState<"" | "yes" | "no">("");

  useEffect(() => () => call.dispose(), [call]);

  const inCall = state.phase !== "idle" && state.phase !== "ended";
  const lastAnswer = [...state.lines].reverse().find((line) => line.role === "assistant");

  const startCall = () => {
    setRated("");
    void call.start();
  };

  const submitTyped = (event: React.FormEvent) => {
    event.preventDefault();
    if (!typed.trim()) return;
    call.sendText(typed);
    setTyped("");
  };

  const rate = (value: "yes" | "no") => {
    track("tool_helpful", { tool: toolId, value });
    setRated(value);
  };

  return (
    <div className="space-y-6">
      {/* التنبيه الدائم: آلي لا محامٍ */}
      <div className="card-soft disclaimer-note p-5">
        <p className="text-sm font-bold leading-relaxed text-slate-800">
          هذا مساعد آلي وليس محاميًا ولا قاضيًا. إجاباته استرشادية تُبنى على نصوص نظامية منشورة،
          والقرار النهائي للمحكمة، ولا يغني عن استشارة محامٍ مرخّص.
        </p>
      </div>

      {/* ----------------------------- قبل المكالمة ----------------------------- */}
      {!inCall && (
        <section className="card-soft p-6 text-center sm:p-8">
          <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-brand-900 ring-4 ring-gold-200">
            <LogoMark className="h-14 w-auto" />
          </span>
          <h2 className="mt-4 text-xl font-extrabold text-slate-900">
            {state.phase === "ended" ? ENDED_NOTE[state.endedBy] || "انتهت المكالمة." : "اتصل بالمحامي الأسري"}
          </h2>
          {state.phase === "ended" ? (
            <p className="mt-1 text-sm font-bold text-slate-500">
              مدة المكالمة {clock(state.seconds)} · لم يُحفظ صوتك ولا نص المحادثة
            </p>
          ) : (
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
              تحدّث بصوتك كأنها مكالمة، ويجيبك المساعد بصوته من نظام الأحوال الشخصية ولائحته
              التنفيذية، ونظام الإثبات وأدلته الإجرائية، ونظام المرافعات الشرعية.
            </p>
          )}

          {state.phase !== "ended" && (
            <ul className="mt-4 flex flex-wrap justify-center gap-2">
              {TOPICS.map((topic) => (
                <li key={topic} className="badge bg-gold-50 text-gold-800">
                  {topic}
                </li>
              ))}
            </ul>
          )}

          <label className="mx-auto mt-6 flex max-w-xl cursor-pointer items-start gap-3 text-start text-sm leading-relaxed text-slate-700">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--ink)]"
            />
            <span>
              أفهم أن المساعد آلي، وأن صوتي يُحوَّل إلى نص بواسطة متصفحي (وقد يعالجه مزوّد
              المتصفح، مثل Google في Chrome)، وأن النص وحده يُرسل إلى خدمة الذكاء الاصطناعي
              ليُجاب عنه، وأن المنصة لا تحفظ صوتي ولا نصي. وسأتجنّب ذكر أسماء أو أرقام هوية.
            </span>
          </label>

          <button
            type="button"
            onClick={startCall}
            disabled={!agreed}
            className="btn-brand mx-auto mt-6 inline-flex items-center gap-3 px-8 py-4 text-base disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PhoneIcon />
            {state.phase === "ended" ? "اتصال جديد" : "اتصل الآن"}
          </button>

          {!support.recognition && (
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-amber-800">
              متصفحك الحالي لا يلتقط الصوت. جرّب Chrome أو Edge للمكالمة الصوتية، أو اتصل واكتب
              أسئلتك وسيجيبك المساعد بصوته.
            </p>
          )}

          {state.phase === "ended" && (
            <div className="mx-auto mt-6 max-w-md border-t border-slate-200 pt-5">
              {rated ? (
                <p className="text-sm font-bold text-slate-600">شكرًا لتقييمك.</p>
              ) : (
                <>
                  <p className="text-sm font-bold text-slate-700">هل كانت المكالمة مفيدة؟</p>
                  <div className="mt-3 flex justify-center gap-3">
                    <button type="button" onClick={() => rate("yes")} className="btn-ghost px-5 py-2">
                      نعم
                    </button>
                    <button type="button" onClick={() => rate("no")} className="btn-ghost px-5 py-2">
                      لا
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* ------------------------------ أثناء المكالمة ------------------------------ */}
      {inCall && (
        <section className="hero-ink rounded-2xl p-6 text-center text-white sm:p-8" aria-label="مكالمة جارية">
          <span
            className={`mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-white/10 ring-4 ${
              state.phase === "speaking" ? "ring-gold-300" : "ring-white/25"
            } ${state.phase === "ringing" ? "animate-pulse" : ""}`}
          >
            <LogoMark className="h-16 w-auto" />
          </span>
          <h2 className="mt-4 text-lg font-extrabold">المحامي الأسري · محامي نفسك</h2>
          <p className="mt-1 text-sm font-bold text-gold-200" aria-live="polite">
            {state.muted && state.phase === "listening" ? "الميكروفون مكتوم" : STATUS[state.phase]}
            {state.phase !== "ringing" && (
              <span className="mx-2 text-white/60" dir="ltr">
                {clock(state.seconds)}
              </span>
            )}
          </p>

          {state.notice && (
            <p className="mx-auto mt-3 max-w-xl rounded-lg bg-white/10 px-4 py-2 text-xs leading-relaxed text-white/90">
              {state.notice}
            </p>
          )}

          {/* ما يُسمع/يُقال الآن */}
          <div className="mx-auto mt-5 min-h-[7rem] max-w-2xl rounded-xl bg-white/10 p-4 text-start" aria-live="polite">
            {state.phase === "listening" && state.caption ? (
              <p className="text-base leading-relaxed text-white">{state.caption}</p>
            ) : state.phase === "thinking" ? (
              <p className="text-sm text-white/70">أراجع المواد النظامية المتعلقة بسؤالك…</p>
            ) : lastAnswer ? (
              <p className="text-base leading-relaxed text-white">{lastAnswer.text}</p>
            ) : (
              <p className="text-sm text-white/70">تفضّل بسؤالك بعد الترحيب…</p>
            )}
          </div>

          {/* أزرار المكالمة */}
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => call.setMuted(!state.muted)}
              aria-pressed={state.muted}
              aria-label={state.muted ? "إلغاء كتم الميكروفون" : "كتم الميكروفون"}
              disabled={state.phase === "ringing"}
              className={`flex h-14 w-14 items-center justify-center rounded-full border border-white/30 transition-colors disabled:opacity-40 ${
                state.muted ? "bg-white text-brand-900" : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              <MicIcon off={state.muted} />
            </button>
            <button
              type="button"
              onClick={() => call.end("user")}
              aria-label="إنهاء المكالمة"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-700 text-white transition-colors hover:bg-rose-800"
            >
              <PhoneIcon down className="h-7 w-7" />
            </button>
            {state.phase === "speaking" && (
              <button
                type="button"
                onClick={() => call.interrupt()}
                className="rounded-full border border-white/30 bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/20"
              >
                قاطعه وتحدّث
              </button>
            )}
          </div>

          {state.seconds > MAX_SECONDS - 90 && (
            <p className="mt-4 text-xs text-gold-200">تقترب المكالمة من حدّها الأقصى.</p>
          )}

          {/* الكتابة: للضوضاء أو للمتصفحات بلا التقاط صوت */}
          <form onSubmit={submitTyped} className="mx-auto mt-6 flex max-w-xl gap-2">
            <label htmlFor="family-typed" className="sr-only">
              اكتب سؤالك
            </label>
            <input
              id="family-typed"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              maxLength={700}
              placeholder="أو اكتب سؤالك هنا"
              disabled={state.phase === "ringing"}
              className="field flex-1 text-slate-900"
            />
            <button type="submit" disabled={!typed.trim() || state.phase === "ringing"} className="btn-gold px-5 disabled:opacity-50">
              إرسال
            </button>
          </form>
        </section>
      )}

      {/* ------------------------------- سجل المكالمة ------------------------------- */}
      {state.lines.length > 0 && (
        <section className="card-soft p-5 sm:p-6" aria-label="نص المكالمة">
          <h3 className="text-base font-extrabold text-slate-900">نص المكالمة</h3>
          <p className="mt-1 text-xs text-slate-500">يبقى هنا ما دمت في هذه الصفحة، ولا يُحفظ عندنا.</p>
          <ol className="mt-4 space-y-4">
            {state.lines.map((line) => (
              <Line key={line.id} line={line} />
            ))}
          </ol>
        </section>
      )}

      {state.phase === "ended" && lawyers.length > 0 && (
        <LawyerContact lawyers={lawyers} toolId={toolId} resultId="family-voice" topicLabel="مسألة أسرية" />
      )}
    </div>
  );
}

function Line({ line }: { line: CallLine }) {
  const mine = line.role === "user";
  return (
    <li className={mine ? "flex justify-start" : "flex justify-end"}>
      <div
        className={`max-w-[92%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
          mine ? "bg-slate-100 text-slate-800" : line.failed ? "bg-amber-50 text-amber-900" : "bg-gold-50 text-slate-900"
        }`}
      >
        <p className="mb-1 text-[11px] font-bold text-slate-500">{mine ? "أنت" : "المحامي الأسري (مساعد آلي)"}</p>
        {line.safety && (
          <p className="mb-2 rounded-lg border border-rose-300 bg-white px-3 py-2 font-bold text-rose-800">
            {line.safety}
          </p>
        )}
        <p>{line.text}</p>
        {line.sources && line.sources.length > 0 && (
          <details className="mt-3 border-t border-gold-200 pt-2">
            <summary className="cursor-pointer text-xs font-bold text-gold-800">
              المواد المستند إليها ({line.sources.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {line.sources.map((source) => (
                <li key={source.id} className="rounded-lg bg-white p-3 text-xs leading-relaxed text-slate-700">
                  <p className="font-bold text-slate-900">
                    {source.cite}
                    {source.section ? ` — ${source.section}` : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-line">{source.text}</p>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block font-bold text-gold-800 underline"
                  >
                    النص الرسمي في البوابة القانونية
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </li>
  );
}
