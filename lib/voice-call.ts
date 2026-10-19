/**
 * محرّك المكالمة الصوتية في المتصفح (للمحامي الأسري الصوتي).
 *
 * يجعل التجربة مكالمة: رنين، ترحيب منطوق، ثم حوار متواصل بلا ضغط أزرار
 * (استماع ← تفكير ← نطق ← استماع…) حتى ينهي المتصل المكالمة.
 *
 * الصوت لا يصل إلى خادم المنصة أبدًا: تحويل الكلام إلى نص ونطق الجواب كلاهما
 * بواجهات المتصفح (Web Speech). ما يصل إلى الخادم هو النص فقط، ليُجاب عنه
 * بمواد نظامية (app/api/family-lawyer). لا يُحفظ شيء، والمحادثة تعيش في ذاكرة
 * الصفحة وتزول بإغلاقها.
 *
 * الحالة في كائن واحد غير قابل للتعديل يُستبدل عند كل تغيّر، فتقرؤه الواجهة
 * عبر useSyncExternalStore دون أي تأثيرات جانبية في المكوّن.
 */

import { trackToolComplete, trackToolStart, trackToolStep } from "@/lib/track";

export type Phase = "idle" | "ringing" | "listening" | "thinking" | "speaking" | "ended";

export interface CallSource {
  id: string;
  cite: string;
  section: string;
  text: string;
  url: string;
}

export interface CallLine {
  id: number;
  role: "user" | "assistant";
  text: string;
  sources?: CallSource[];
  /** تنبيه طوارئ ظهر مع هذا الجواب */
  safety?: string;
  failed?: boolean;
}

export interface CallState {
  phase: Phase;
  lines: CallLine[];
  /** ما يسمعه المساعد الآن من المتصل (نص مؤقت) */
  caption: string;
  seconds: number;
  muted: boolean;
  /** ملاحظة للمتصل (لا يوجد صوت عربي، تعذّر الميكروفون…) */
  notice: string | null;
  endedBy: "" | "user" | "limit" | "idle" | "error";
  turns: number;
}

export const MAX_TURNS = 20;
export const MAX_SECONDS = 12 * 60;

export const INITIAL_STATE: CallState = {
  phase: "idle",
  lines: [],
  caption: "",
  seconds: 0,
  muted: false,
  notice: null,
  endedBy: "",
  turns: 0,
};

const GREETING =
  "مرحبًا بك في محامي نفسك. أنا مساعد آلي ولست محاميًا، وإجاباتي استرشادية من نظام الأحوال الشخصية ولائحته التنفيذية، ونظام الإثبات وأدلته الإجرائية، ونظام المرافعات الشرعية، والقرار النهائي للمحكمة. تفضّل، كيف أساعدك؟";
const STILL_THERE = "هل ما زلت معي؟ تفضّل بسؤالك.";
const IDLE_END = "لم أسمع شيئًا، سأنهي المكالمة الآن. يمكنك الاتصال مجددًا في أي وقت.";
const LIMIT_END =
  "انتهت مدة المكالمة. شكرًا لاستخدامك محامي نفسك. وللمسائل المهمة نوصيك بالتواصل مع محامٍ مرخّص.";
const TURNS_END =
  "وصلنا إلى الحد الأقصى من الأسئلة في هذه المكالمة. شكرًا لك، ويمكنك الاتصال مجددًا. وللمسائل المهمة نوصيك بمحامٍ مرخّص.";
const FAIL_TEXT = "تعذّر الحصول على الجواب الآن. هل تعيد سؤالك؟";

/* ------------------------------- أنواع المتصفح ------------------------------- */

interface RecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function voiceSupport(): { recognition: boolean; synthesis: boolean } {
  return {
    recognition: recognitionCtor() !== null,
    synthesis: typeof window !== "undefined" && "speechSynthesis" in window,
  };
}

/** جمل قصيرة: Chrome يقطع النطق الطويل المتصل، وبالجمل يسهل التحكم والمقاطعة */
function splitSentences(text: string): string[] {
  const parts = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.؟?!،؛:])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const part of parts) {
    if (part.length <= 170) chunks.push(part);
    else for (let i = 0; i < part.length; i += 170) chunks.push(part.slice(i, i + 170));
  }
  return chunks;
}

/* --------------------------------- المحرّك --------------------------------- */

export class VoiceCall {
  private state: CallState = INITIAL_STATE;
  private listeners = new Set<() => void>();

  private lineId = 0;
  private active = false;
  /** يُزاد عند كل إيقاف ليتجاهل ما تأخر من نداءات الاستماع والنطق */
  private epoch = 0;
  private recognition: RecognitionLike | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private silentRounds = 0;
  private failures = 0;
  private audio: AudioContext | null = null;
  private arabicVoice: SpeechSynthesisVoice | null = null;
  private canSpeak = false;
  private abort: AbortController | null = null;

  constructor(private readonly toolId: string) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CallState => this.state;

  private set(patch: Partial<CallState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private addLine(line: Omit<CallLine, "id">) {
    this.lineId += 1;
    this.set({ lines: [...this.state.lines, { ...line, id: this.lineId }] });
  }

  /* ------------------------------- بدء المكالمة ------------------------------- */

  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.epoch += 1;
    const epoch = this.epoch;
    this.silentRounds = 0;
    this.failures = 0;
    this.lineId = 0;
    this.set({ ...INITIAL_STATE, phase: "ringing" });
    trackToolStart(this.toolId);

    const support = voiceSupport();
    let notice: string | null = null;

    // الصوت العربي: إن وُجدت أصوات على الجهاز وليس بينها عربي فلا نقرأ الجواب بصوت أجنبي
    this.canSpeak = support.synthesis;
    if (support.synthesis) {
      const voices = window.speechSynthesis.getVoices();
      this.arabicVoice =
        voices.find((v) => v.lang.toLowerCase() === "ar-sa") ??
        voices.find((v) => v.lang.toLowerCase().startsWith("ar")) ??
        null;
      if (voices.length > 0 && !this.arabicVoice) {
        this.canSpeak = false;
        notice = "لا يتوفر صوت عربي على جهازك، فستظهر الإجابات مكتوبة. ثبّت صوتًا عربيًا من إعدادات النظام لتُنطق.";
      }
    } else {
      notice = "متصفحك لا يدعم نطق الإجابات، فستظهر مكتوبة.";
    }

    if (support.recognition) {
      // طلب إذن الميكروفون أثناء الرنين حتى لا يقاطع النافذة أول كلام
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        this.fail("لم يُسمح بالوصول إلى الميكروفون. اسمح به من إعدادات الموقع ثم اتصل مجددًا، أو اكتب سؤالك.", epoch);
        return;
      }
    } else {
      notice =
        "متصفحك لا يلتقط الصوت (جرّب Chrome أو Edge). اكتب سؤالك في الخانة وسيجيبك المساعد." +
        (notice ? ` ${notice}` : "");
    }
    if (epoch !== this.epoch) return;
    this.set({ notice });

    await this.ring(epoch);
    if (epoch !== this.epoch) return;

    this.timer = setInterval(() => {
      const seconds = this.state.seconds + 1;
      this.set({ seconds });
      if (seconds >= MAX_SECONDS) this.closeWith(LIMIT_END, "limit");
    }, 1000);

    this.addLine({ role: "assistant", text: GREETING });
    this.speak(GREETING, () => this.listen());
  }

  private fail(message: string, epoch: number) {
    if (epoch !== this.epoch) return;
    this.cleanup();
    this.addLine({ role: "assistant", text: message, failed: true });
    this.set({ phase: "ended", endedBy: "error" });
  }

  /** نغمة رنين بسيطة بلا ملفات صوت: نغمتان قصيرتان مرتين */
  private ring(epoch: number): Promise<void> {
    return new Promise((resolve) => {
      try {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          this.audio = new Ctx();
          const ctx = this.audio;
          const gain = ctx.createGain();
          gain.gain.value = 0.06;
          gain.connect(ctx.destination);
          for (const offset of [0, 0.55, 1.6, 2.15]) {
            const osc = ctx.createOscillator();
            osc.frequency.value = 425;
            osc.connect(gain);
            osc.start(ctx.currentTime + offset);
            osc.stop(ctx.currentTime + offset + 0.4);
          }
        }
      } catch {
        // بلا رنين — نكمل
      }
      setTimeout(() => {
        if (epoch === this.epoch) void this.audio?.close().catch(() => {});
        resolve();
      }, 2700);
    });
  }

  /* --------------------------------- الاستماع --------------------------------- */

  private listen() {
    if (!this.active) return;
    this.stopRecognition();
    this.set({ phase: "listening", caption: "" });
    if (this.state.muted) return;

    const Ctor = recognitionCtor();
    if (!Ctor) return; // الكتابة وحدها

    const epoch = this.epoch;
    const rec = new Ctor();
    rec.lang = "ar-SA";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalText = "";
    rec.onresult = (event) => {
      if (epoch !== this.epoch) return;
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalText += `${result[0].transcript} `;
        else interim += result[0].transcript;
      }
      this.set({ caption: (finalText + interim).trim() });
    };
    rec.onerror = (event) => {
      if (epoch !== this.epoch) return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        this.fail("تعذّر الوصول إلى الميكروفون. اسمح به ثم اتصل مجددًا، أو اكتب سؤالك.", epoch);
      } else if (event.error === "network") {
        this.set({ notice: "انقطع الاتصال بخدمة التعرف على الصوت. تحقق من الإنترنت أو اكتب سؤالك." });
      }
      // no-speech / aborted: يعالجها onend
    };
    rec.onend = () => {
      if (epoch !== this.epoch || this.recognition !== rec) return;
      this.recognition = null;
      const text = finalText.trim();
      if (text.length >= 2) {
        this.silentRounds = 0;
        void this.submit(text);
        return;
      }
      this.silentRounds += 1;
      if (this.silentRounds === 3) this.speak(STILL_THERE, () => this.listen());
      else if (this.silentRounds >= 6) this.closeWith(IDLE_END, "idle");
      else setTimeout(() => epoch === this.epoch && this.listen(), 150);
    };

    this.recognition = rec;
    try {
      rec.start();
    } catch {
      // بدأ للتو — نتجاهل
    }
  }

  private stopRecognition() {
    const rec = this.recognition;
    this.recognition = null;
    if (!rec) return;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    try {
      rec.abort();
    } catch {
      // انتهى
    }
  }

  /* ---------------------------------- السؤال ---------------------------------- */

  /** سؤال مكتوب (للمتصفحات بلا التقاط صوت، أو لمن يفضّل الكتابة) */
  sendText(text: string) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!this.active || clean.length < 2) return;
    if (this.state.phase === "thinking" || this.state.phase === "ringing") return;
    this.stopRecognition();
    this.stopSpeech();
    this.epoch += 1; // يُبطل ما تبقّى من نطق الجواب السابق
    void this.submit(clean);
  }

  private async submit(text: string) {
    const epoch = this.epoch;
    if (this.state.turns >= MAX_TURNS) {
      this.closeWith(TURNS_END, "limit");
      return;
    }
    const turns = this.state.turns + 1;
    trackToolStep(this.toolId, turns);
    this.addLine({ role: "user", text });
    this.set({ phase: "thinking", caption: "", turns });

    const messages = this.state.lines
      .filter((line) => !line.failed)
      .slice(-7)
      .map((line) => ({ role: line.role, text: line.text }));

    this.abort = new AbortController();
    const timeout = setTimeout(() => this.abort?.abort(), 28_000);
    try {
      const response = await fetch("/api/family-lawyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
        signal: this.abort.signal,
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        answer?: string;
        sources?: CallSource[];
        safety?: { text: string; speech: string };
        error?: string;
      };
      if (epoch !== this.epoch) return;

      if (response.ok && data.ok && data.answer) {
        this.failures = 0;
        this.addLine({
          role: "assistant",
          text: data.answer,
          sources: data.sources ?? [],
          safety: data.safety?.text,
        });
        const spoken = (data.safety ? `${data.safety.speech} ` : "") + data.answer;
        this.speak(spoken, () => this.listen());
        return;
      }
      this.failures += 1;
      const message = data.error || FAIL_TEXT;
      this.addLine({ role: "assistant", text: message, failed: true });
      if (this.failures >= 3) this.closeWith(message, "error", false);
      else this.speak(message, () => this.listen());
    } catch {
      if (epoch !== this.epoch) return;
      this.failures += 1;
      this.addLine({ role: "assistant", text: FAIL_TEXT, failed: true });
      if (this.failures >= 3) this.closeWith(FAIL_TEXT, "error", false);
      else this.speak(FAIL_TEXT, () => this.listen());
    } finally {
      clearTimeout(timeout);
    }
  }

  /* ----------------------------------- النطق ----------------------------------- */

  private speak(text: string, done: () => void) {
    if (!this.active) return;
    this.stopRecognition();
    this.set({ phase: "speaking", caption: "" });

    if (!this.canSpeak) {
      // بلا صوت: نمهل المتصل قليلًا ليقرأ ثم نعود للاستماع
      const epoch = this.epoch;
      const wait = Math.min(9000, 1500 + text.length * 35);
      setTimeout(() => epoch === this.epoch && done(), this.state.muted ? 0 : wait);
      return;
    }

    const synth = window.speechSynthesis;
    synth.cancel();
    const epoch = this.epoch;
    const chunks = splitSentences(text);
    let index = 0;

    const next = () => {
      if (epoch !== this.epoch) return;
      if (index >= chunks.length) {
        // لحظة قصيرة ليهدأ الصدى قبل أن يلتقط الميكروفون
        setTimeout(() => epoch === this.epoch && done(), 350);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      index += 1;
      utterance.lang = "ar-SA";
      utterance.rate = 0.95;
      if (this.arabicVoice) utterance.voice = this.arabicVoice;

      let fired = false;
      const advance = () => {
        if (fired) return;
        fired = true;
        clearTimeout(watchdog);
        next();
      };
      // بعض المتصفحات لا تُطلق onend أحيانًا؛ مؤقّت احتياطي بقدر طول الجملة
      const watchdog = setTimeout(advance, 2000 + utterance.text.length * 85);
      utterance.onend = advance;
      utterance.onerror = (event) => {
        if (event.error === "interrupted" || event.error === "canceled") return;
        advance();
      };
      synth.speak(utterance);
    };
    next();
  }

  private stopSpeech() {
    if (voiceSupport().synthesis) window.speechSynthesis.cancel();
  }

  /** المتصل يقاطع المساعد ليتكلم */
  interrupt() {
    if (!this.active || this.state.phase !== "speaking") return;
    this.epoch += 1;
    this.stopSpeech();
    this.listen();
  }

  setMuted(muted: boolean) {
    if (!this.active) return;
    this.set({ muted });
    if (muted) this.stopRecognition();
    else if (this.state.phase === "listening") this.listen();
  }

  /* ------------------------------- إنهاء المكالمة ------------------------------- */

  /** يقول جملة الختام ثم يغلق (حد المدة، حد الأسئلة، صمت طويل) */
  private closeWith(message: string, by: CallState["endedBy"], speak = true) {
    if (!this.active) return;
    this.stopRecognition();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.addLine({ role: "assistant", text: message, failed: by === "error" });
    const finish = () => this.end(by);
    if (speak) this.speak(message, finish);
    else this.end(by);
  }

  end(by: CallState["endedBy"] = "user") {
    if (!this.active) return;
    this.cleanup();
    trackToolComplete(this.toolId);
    this.set({ phase: "ended", caption: "", endedBy: by });
  }

  private cleanup() {
    this.active = false;
    this.epoch += 1;
    this.abort?.abort();
    this.abort = null;
    this.stopRecognition();
    this.stopSpeech();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.audio?.close().catch(() => {});
    this.audio = null;
  }

  /** عند مغادرة الصفحة */
  dispose() {
    this.cleanup();
  }
}
