"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { LogoMark } from "@/components/Logo";
import LawyerContact from "@/components/LawyerContact";
import { track } from "@/lib/track";
import {
  INITIAL_STATE,
  MAX_RECORD_SECONDS,
  MAX_SECONDS,
  VoiceCall,
  type CallLine,
  type CallState,
  type Gender,
} from "@/lib/voice-call";
import type { Lawyer } from "@/types";

/**
 * المحامي الأسري الصوتي — تجربة مكالمة بدورٍ يملكه المتصل.
 *
 * زرّان كما طلب المالك: «تكلّم» يبدأ التسجيل (ويوقفه مؤقتًا ويكمله)، و«جاوبني»
 * يأذن للمساعد بالرد. التردد والوقفات لا تُنهي كلام المتصل. يختار المتصل قبل
 * الاتصال كيف يُخاطَب (رجل/امرأة) فتأتي كل العبارات بصيغته.
 *
 * كل المنطق في lib/voice-call.ts؛ هذا المكوّن عرض فقط.
 */

const TOPICS = ["الحضانة والزيارة", "النفقة", "الطلاق والخلع", "الزواج والولاية", "المواريث والوصية", "الإثبات ورفع الدعوى"];

const ENDED_NOTE: Record<string, string> = {
  user: "انتهت المكالمة.",
  limit: "بلغت المكالمة حدّها الأقصى.",
  idle: "أُنهيت المكالمة لعدم النشاط.",
  error: "تعذّر إكمال المكالمة.",
};

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** نص الحالة بصيغة المتصل */
function statusText(state: CallState): string {
  const f = state.gender === "f";
  switch (state.phase) {
    case "ringing":
      return "جارٍ الاتصال…";
    case "greeting":
      return "المحامي الأسري يرحّب بك";
    case "ready":
      return f ? "دوركِ — اضغطي «تكلّمي» متى ما كنتِ جاهزة" : "دورك — اضغط «تكلّم» متى ما كنت جاهز";
    case "recording":
      return state.paused
        ? f
          ? "متوقف مؤقتًا — كمّلي أو اضغطي «جاوبني»"
          : "متوقف مؤقتًا — كمّل أو اضغط «جاوبني»"
        : f
          ? "أسمعكِ… خذي راحتكِ"
          : "أسمعك… خذ راحتك";
    case "transcribing":
      return f ? "فهمت عليكِ، لحظة…" : "فهمت عليك، لحظة…";
    case "thinking":
      return "يراجع الأنظمة…";
    case "speaking":
      return "المحامي الأسري يتكلم";
    default:
      return "";
  }
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

function MicIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
    </svg>
  );
}

function SendIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 12.5 9 17.5 20 6.5" />
    </svg>
  );
}

/** موجة بسيطة تتحرك مع مستوى الصوت أثناء التسجيل */
function LevelBars({ level, active }: { level: number; active: boolean }) {
  const shape = [0.45, 0.75, 1, 0.75, 0.45];
  return (
    <span className="flex h-8 items-center justify-center gap-1" aria-hidden="true">
      {shape.map((factor, i) => (
        <span
          key={i}
          className="w-1.5 rounded-full bg-gold-300 transition-[height] duration-100"
          style={{ height: `${active ? Math.max(4, Math.round(32 * Math.min(1, level * factor + 0.08))) : 4}px` }}
        />
      ))}
    </span>
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
  const [agreed, setAgreed] = useState(false);
  const [gender, setGender] = useState<Gender | null>(null);
  const [typed, setTyped] = useState("");
  const [rated, setRated] = useState<"" | "yes" | "no">("");

  useEffect(() => () => call.dispose(), [call]);

  const inCall = state.phase !== "idle" && state.phase !== "ended";
  const f = state.gender === "f";
  const lastAnswer = [...state.lines].reverse().find((line) => line.role === "assistant");
  const lastUser = [...state.lines].reverse().find((line) => line.role === "user");
  const busy = state.phase === "transcribing" || state.phase === "thinking" || state.phase === "ringing";
  const canAnswer = state.phase === "recording" && state.recordSeconds >= 1;

  const startCall = () => {
    if (!gender) return;
    setRated("");
    void call.start(gender);
  };

  const submitTyped = (event: React.FormEvent) => {
    event.preventDefault();
    if (!typed.trim()) return;
    void call.sendText(typed);
    setTyped("");
  };

  const rate = (value: "yes" | "no") => {
    track("tool_helpful", { tool: toolId, value });
    setRated(value);
  };

  const talkLabel =
    state.phase === "recording"
      ? state.paused
        ? f
          ? "كمّلي كلامكِ"
          : "كمّل كلامك"
        : "إيقاف مؤقت"
      : state.phase === "speaking" || state.phase === "greeting"
        ? f
          ? "قاطعيه وتكلّمي"
          : "قاطعه وتكلّم"
        : busy
          ? "لحظة…"
          : f
            ? "تكلّمي"
            : "تكلّم";

  return (
    <div className="space-y-6">
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
              مكالمة بصوت بشري وبلهجة خليجية. تتكلم على راحتك ثم تضغط «جاوبني»، فيجيبك من نظام
              الأحوال الشخصية ولائحته، ونظام الإثبات وأدلته الإجرائية، ونظام المرافعات الشرعية.
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

          <fieldset className="mx-auto mt-6 max-w-xl">
            <legend className="mx-auto text-sm font-extrabold text-slate-800">كيف يخاطبك المساعد؟</legend>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {(
                [
                  ["m", "أنا رجل"],
                  ["f", "أنا امرأة"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-xl border-2 px-4 py-3 text-sm font-bold transition-colors ${
                    gender === value ? "border-brand-900 bg-brand-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-brand-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="caller-gender"
                    value={value}
                    checked={gender === value}
                    onChange={() => setGender(value)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="mx-auto mt-6 flex max-w-xl cursor-pointer items-start gap-3 text-start text-sm leading-relaxed text-slate-700">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--ink)]"
            />
            <span>
              أفهم أن المساعد آلي، وأن تسجيل صوتي يُرسل بعد ضغط «جاوبني» إلى خدمة Google Gemini
              لتحويله إلى نص ثم الإجابة عنه، وأن المنصة لا تحفظ صوتي ولا كلامي ولا المحادثة.
              وسأتجنّب ذكر أسماء أو أرقام هوية.
            </span>
          </label>

          <button
            type="button"
            onClick={startCall}
            disabled={!agreed || !gender}
            className="btn-brand mx-auto mt-6 inline-flex items-center gap-3 px-8 py-4 text-base disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PhoneIcon />
            {state.phase === "ended" ? "اتصال جديد" : "اتصل الآن"}
          </button>
          {(!agreed || !gender) && (
            <p className="mt-2 text-xs text-slate-500">اختر طريقة المخاطبة ووافق على التنبيه لتفعيل الاتصال.</p>
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
        <section className="hero-ink rounded-2xl p-5 text-center text-white sm:p-8" aria-label="مكالمة جارية">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-white/60" dir="ltr">
              {state.phase === "ringing" ? "" : clock(state.seconds)}
            </span>
            <button
              type="button"
              onClick={() => call.end("user")}
              aria-label="إنهاء المكالمة"
              className="flex items-center gap-2 rounded-full bg-rose-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-rose-800"
            >
              <PhoneIcon down className="h-4 w-4" />
              إنهاء
            </button>
          </div>

          <span
            className={`mx-auto mt-2 flex h-24 w-24 items-center justify-center rounded-full bg-white/10 ring-4 ${
              state.phase === "speaking" || state.phase === "greeting" ? "ring-gold-300" : "ring-white/25"
            } ${state.phase === "ringing" ? "animate-pulse" : ""}`}
          >
            <LogoMark className="h-14 w-auto" />
          </span>
          <h2 className="mt-3 text-lg font-extrabold">المحامي الأسري · محامي نفسك</h2>
          <p className="mt-1 text-sm font-bold text-gold-200" aria-live="polite">
            {statusText(state)}
          </p>

          {state.notice && (
            <p className="mx-auto mt-3 max-w-xl rounded-lg bg-white/10 px-4 py-2 text-xs leading-relaxed text-white/90">
              {state.notice}
            </p>
          )}

          {/* آخر ما قيل */}
          <div className="mx-auto mt-4 min-h-[6rem] max-w-2xl rounded-xl bg-white/10 p-4 text-start" aria-live="polite">
            {state.phase === "recording" ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <LevelBars level={state.level} active={!state.paused} />
                <p className="text-sm text-white/80" dir="ltr">
                  {clock(state.recordSeconds)} / {clock(MAX_RECORD_SECONDS)}
                </p>
              </div>
            ) : state.phase === "transcribing" || state.phase === "thinking" ? (
              <>
                {lastUser && state.phase === "thinking" && (
                  <p className="mb-2 text-xs text-white/60">
                    {f ? "قلتِ" : "قلت"}: «{lastUser.text}»
                  </p>
                )}
                <p className="text-sm text-white/80">{state.phase === "thinking" ? "يراجع المواد النظامية المتعلقة بسؤالك…" : "يستمع لتسجيلك…"}</p>
              </>
            ) : lastAnswer ? (
              <p className="text-base leading-relaxed text-white">{lastAnswer.text}</p>
            ) : (
              <p className="text-sm text-white/70">لحظات ويرد عليك…</p>
            )}
          </div>

          {/* الزرّان */}
          <div className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => void call.talk()}
              disabled={busy || !state.micAvailable}
              aria-pressed={state.phase === "recording" && !state.paused}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 px-3 py-5 text-base font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                state.phase === "recording" && !state.paused
                  ? "border-gold-300 bg-gold-300 text-brand-900"
                  : "border-white/30 bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              <MicIcon />
              {talkLabel}
            </button>
            <button
              type="button"
              onClick={() => void call.answer()}
              disabled={!canAnswer}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-white/30 bg-white px-3 py-5 text-base font-extrabold text-brand-900 transition-colors hover:bg-gold-50 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
            >
              <SendIcon />
              جاوبني
            </button>
          </div>

          {state.phase === "recording" ? (
            <button type="button" onClick={() => call.discard()} className="mt-3 text-xs font-bold text-white/70 underline">
              {f ? "امسحي التسجيل وابدئي من جديد" : "امسح التسجيل وابدأ من جديد"}
            </button>
          ) : (
            <p className="mt-3 text-xs leading-relaxed text-white/60">
              {f
                ? "خذي راحتكِ في الكلام وتوقّفي متى ما بغيتِ؛ ما راح يرد إلا لما تضغطين «جاوبني»."
                : "خذ راحتك في الكلام وتوقّف متى ما بغيت؛ ما راح يرد إلا لما تضغط «جاوبني»."}
            </p>
          )}

          {state.seconds > MAX_SECONDS - 90 && <p className="mt-3 text-xs text-gold-200">تقترب المكالمة من حدّها الأقصى.</p>}

          <form onSubmit={submitTyped} className="mx-auto mt-6 flex max-w-xl gap-2">
            <label htmlFor="family-typed" className="sr-only">
              اكتب سؤالك
            </label>
            <input
              id="family-typed"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              maxLength={700}
              placeholder={f ? "أو اكتبي سؤالكِ هنا" : "أو اكتب سؤالك هنا"}
              disabled={busy}
              className="field flex-1 text-slate-900"
            />
            <button type="submit" disabled={!typed.trim() || busy} className="btn-gold px-5 disabled:opacity-50">
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
              <Line key={line.id} line={line} female={f} />
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

function Line({ line, female }: { line: CallLine; female: boolean }) {
  const mine = line.role === "user";
  return (
    <li className={mine ? "flex justify-start" : "flex justify-end"}>
      <div
        className={`max-w-[92%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
          mine ? "bg-slate-100 text-slate-800" : line.failed ? "bg-amber-50 text-amber-900" : "bg-gold-50 text-slate-900"
        }`}
      >
        <p className="mb-1 text-[11px] font-bold text-slate-500">{mine ? (female ? "أنتِ" : "أنت") : "المحامي الأسري (مساعد آلي)"}</p>
        {line.safety && (
          <p className="mb-2 rounded-lg border border-rose-300 bg-white px-3 py-2 font-bold text-rose-800">{line.safety}</p>
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
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-bold text-gold-800 underline">
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
