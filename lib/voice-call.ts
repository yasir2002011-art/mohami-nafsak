/**
 * محرّك مكالمة المحامي الأسري في المتصفح.
 *
 * الدور بيد المتصل (طلب المالك): يضغط «تكلّم» فيُسجَّل كلامه مهما تردّد أو
 * توقّف، ولا يرد المساعد إلا حين يضغط «جاوبني». الضغط على «تكلّم» أثناء
 * التسجيل يوقفه مؤقتًا ثم يكمل.
 *
 * المسار: تسجيل (WAV 16kHz) ← transcribe/ (نص) ← family-lawyer/ (جواب موقّع)
 *         ← voice/ (صوت بشري خليجي يُبث ويبدأ بعد نحو ثانية).
 * أثناء الانتظار تُسمع عبارة قصيرة مخزّنة («عطني لحظة أراجع لك النظام»).
 * إن تعذّر الصوت البشري يُقرأ الجواب بصوت الجهاز احتياطًا.
 *
 * لا يُحفظ شيء: التسجيل يُرسل للتفريغ ثم يُنسى، والمحادثة في ذاكرة الصفحة فقط.
 */

import { trackToolComplete, trackToolStart, trackToolStep } from "@/lib/track";
import { FILLERS, phraseId, phraseText, VOICE_VERSION, type Gender, type PhraseName } from "@/lib/voice-phrases";

export type { Gender };

export type Phase =
  | "idle"
  | "ringing"
  | "greeting"
  | "ready"
  | "recording"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "ended";

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
  safety?: string;
  failed?: boolean;
}

export interface CallState {
  phase: Phase;
  lines: CallLine[];
  seconds: number;
  /** مدة التسجيل الحالي بالثواني */
  recordSeconds: number;
  /** مستوى الصوت أثناء التسجيل (0–1) لمؤشر الموجة */
  level: number;
  paused: boolean;
  micAvailable: boolean;
  notice: string | null;
  endedBy: "" | "user" | "limit" | "idle" | "error";
  turns: number;
  gender: Gender;
}

export const MAX_TURNS = 25;
export const MAX_SECONDS = 20 * 60;
export const MAX_RECORD_SECONDS = 100;
const IDLE_SECONDS = 5 * 60;
const TARGET_RATE = 16_000;

export const INITIAL_STATE: CallState = {
  phase: "idle",
  lines: [],
  seconds: 0,
  recordSeconds: 0,
  level: 0,
  paused: false,
  micAvailable: true,
  notice: null,
  endedBy: "",
  turns: 0,
  gender: "m",
};

/* --------------------------------- التسجيل --------------------------------- */

/** يحوّل عيّنات Float32 بمعدل الجهاز إلى WAV أحادي 16kHz/16-bit */
function encodeWav(chunks: Float32Array[], inputRate: number): Blob {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const ratio = inputRate / TARGET_RATE;
  const outLength = Math.floor(total / ratio);
  const pcm = new Int16Array(outLength);

  // متوسط النوافذ (تخفيض بسيط يكفي للكلام)
  let chunkIndex = 0;
  let offset = 0;
  const readSample = (): number => {
    while (chunkIndex < chunks.length && offset >= chunks[chunkIndex].length) {
      chunkIndex += 1;
      offset = 0;
    }
    if (chunkIndex >= chunks.length) return 0;
    const value = chunks[chunkIndex][offset];
    offset += 1;
    return value;
  };
  let consumed = 0;
  for (let i = 0; i < outLength; i += 1) {
    const until = Math.floor((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    while (consumed < until) {
      sum += readSample();
      count += 1;
      consumed += 1;
    }
    const sample = Math.max(-1, Math.min(1, count ? sum / count : 0));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const write = (at: number, text: string) => [...text].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_RATE, true);
  view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  new Int16Array(buffer, 44).set(pcm);
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * أفضل صوت عربي على الجهاز (مجاني): أصوات Microsoft «الطبيعية» في متصفح Edge
 * (مثل حامد السعودي) قريبة جدًا من الإنسان، ثم صوت Google في Chrome، ثم أي عربي.
 */
function bestDeviceVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const arabic = voices.filter((v) => v.lang.toLowerCase().startsWith("ar"));
  const gulf = /^ar-(sa|ae|kw|qa|bh|om)$/i;
  const natural = (v: SpeechSynthesisVoice) => /natural|online|neural/i.test(v.name);
  const score = (v: SpeechSynthesisVoice) =>
    (natural(v) ? 8 : 0) +
    (gulf.test(v.lang) ? 4 : 0) +
    (/google/i.test(v.name) ? 2 : 0) +
    // صوت رجل للمحامي (حامد)، ويبقى أي صوت طبيعي مقبولًا
    (/hamed|fahed|hamdan|moaz|abdullah|naayf|majed/i.test(v.name) ? 1 : 0);
  return arabic.sort((a, b) => score(b) - score(a))[0];
}

/* ---------------------------------- التشغيل ---------------------------------- */

class Player {
  private sources = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  private epoch = 0;
  private abort: AbortController | null = null;

  constructor(private readonly ctx: AudioContext) {}

  stop() {
    this.epoch += 1;
    this.abort?.abort();
    this.abort = null;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // انتهى
      }
    }
    this.sources.clear();
    this.nextTime = 0;
  }

  private schedule(buffer: AudioBuffer): Promise<void> {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    const at = Math.max(this.ctx.currentTime + 0.04, this.nextTime);
    source.start(at);
    this.nextTime = at + buffer.duration;
    this.sources.add(source);
    return new Promise((resolve) => {
      source.onended = () => {
        this.sources.delete(source);
        resolve();
      };
    });
  }

  /** يعيد true إن اكتمل التشغيل دون مقاطعة */
  async playBuffer(buffer: AudioBuffer): Promise<boolean> {
    const epoch = this.epoch;
    await this.ctx.resume().catch(() => {});
    await this.schedule(buffer);
    return epoch === this.epoch;
  }

  /** يشغّل تيار PCM خامًا (16-bit، 24kHz) أثناء وصوله */
  async playStream(url: string, body: unknown): Promise<"done" | "stopped" | "failed"> {
    const epoch = this.epoch;
    this.abort = new AbortController();
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: this.abort.signal,
      });
    } catch {
      return epoch === this.epoch ? "failed" : "stopped";
    }
    if (!response.ok || !response.body) return "failed";
    await this.ctx.resume().catch(() => {});

    const reader = response.body.getReader();
    const tail: { bytes: Uint8Array | null } = { bytes: null };
    let last: Promise<void> = Promise.resolve();
    let played = 0;
    // نجمع نحو 0.25 ثانية قبل الجدولة حتى لا تتقطّع المقاطع الصغيرة
    let pending: Uint8Array[] = [];
    let pendingBytes = 0;
    const flush = () => {
      if (pendingBytes < 2) return;
      const joined = new Uint8Array(pendingBytes);
      let at = 0;
      for (const part of pending) {
        joined.set(part, at);
        at += part.length;
      }
      pending = [];
      pendingBytes = 0;
      const usable = joined.length - (joined.length % 2);
      if (usable < joined.length) tail.bytes = joined.slice(usable);
      const samples = new Int16Array(joined.buffer, 0, usable / 2);
      const buffer = this.ctx.createBuffer(1, samples.length, 24_000);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i += 1) channel[i] = samples[i] / 0x8000;
      played += samples.length;
      last = this.schedule(buffer);
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (epoch !== this.epoch) return "stopped";
        if (done) break;
        let chunk = value;
        if (tail.bytes) {
          const merged = new Uint8Array(tail.bytes.length + chunk.length);
          merged.set(tail.bytes);
          merged.set(chunk, tail.bytes.length);
          chunk = merged;
          tail.bytes = null;
        }
        pending.push(chunk);
        pendingBytes += chunk.length;
        if (pendingBytes >= 12_000) flush();
      }
      flush();
    } catch {
      if (epoch !== this.epoch) return "stopped";
      if (played === 0) return "failed";
    }
    if (played === 0) return "failed";
    await last;
    return epoch === this.epoch ? "done" : "stopped";
  }
}

/* ---------------------------------- المحرّك ---------------------------------- */

export class VoiceCall {
  private state: CallState = INITIAL_STATE;
  private listeners = new Set<() => void>();
  private lineId = 0;
  private active = false;
  private epoch = 0;

  private ctx: AudioContext | null = null;
  private player: Player | null = null;
  private phrases = new Map<string, AudioBuffer>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private idleSince = 0;
  private abort: AbortController | null = null;

  // التسجيل
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private samples = 0;
  private energy = 0;
  private capturing = false;
  private lastLevelAt = 0;

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

  /** قراءة المرحلة بعد انتظار (تتغير أثناءه، فلا يصح تضييق النوع) */
  private phaseIs(phase: Phase): boolean {
    return this.state.phase === phase;
  }

  private setPhase(phase: Phase) {
    if (phase === "ready") this.idleSince = this.state.seconds;
    this.set({ phase });
  }

  /* -------------------------------- بدء المكالمة -------------------------------- */

  async start(gender: Gender): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.epoch += 1;
    const epoch = this.epoch;
    this.lineId = 0;
    const micAvailable = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    this.set({
      ...INITIAL_STATE,
      phase: "ringing",
      gender,
      micAvailable,
      notice: micAvailable ? null : "متصفحك لا يسمح بالتسجيل الصوتي؛ اكتب سؤالك وسيجيبك المساعد بصوته.",
    });
    trackToolStart(this.toolId);

    // سياق الصوت يُنشأ داخل ضغطة «اتصل» حتى تسمح المتصفحات بالتشغيل (iPhone خصوصًا)
    try {
      const Ctx =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.player = new Player(this.ctx);
    } catch {
      this.ctx = null;
      this.player = null;
    }

    // نحمّل العبارات الثابتة أثناء الرنين
    // الترحيب أثناء الرنين، وبقية العبارات تُحمَّل بالتتابع بعده (مخزّنة غالبًا في الشبكة)
    await Promise.all([this.ring(), this.loadPhrase("greeting")]);
    if (epoch !== this.epoch) return;

    this.timer = setInterval(() => this.tick(), 1000);
    this.addLine({ role: "assistant", text: phraseText(phraseId("greeting", gender)) });
    this.setPhase("greeting");
    void (async () => {
      for (const name of [...FILLERS, "didntHear", "error"] as PhraseName[]) await this.loadPhrase(name);
    })();
    await this.sayPhrase("greeting");
    if (epoch === this.epoch && this.state.phase === "greeting") this.setPhase("ready");
  }

  private tick() {
    const seconds = this.state.seconds + 1;
    this.set({ seconds });
    if (seconds >= MAX_SECONDS) void this.closeWith("timeLimit", "limit");
    else if (this.state.phase === "ready" && seconds - this.idleSince >= IDLE_SECONDS) void this.closeWith("idle", "idle");
  }

  private ring(): Promise<void> {
    const ctx = this.ctx;
    if (ctx) {
      try {
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
      } catch {
        // بلا رنين
      }
    }
    return new Promise((resolve) => setTimeout(resolve, 2700));
  }

  private async loadPhrase(name: PhraseName): Promise<void> {
    if (!this.ctx) return;
    const id = phraseId(name, this.state.gender);
    if (this.phrases.has(id)) return;
    try {
      const response = await fetch(`/api/family-lawyer/voice?phrase=${encodeURIComponent(id)}&v=${VOICE_VERSION}`);
      if (!response.ok) return;
      const buffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
      this.phrases.set(id, buffer);
    } catch {
      // تُقرأ بصوت الجهاز احتياطًا
    }
  }

  /** عبارة انتظار قصيرة إن كانت جاهزة؛ وإلا صمت (صوت الجهاز هنا ينشز عن صوت المحادثة) */
  private sayFiller(): Promise<boolean> {
    const ready = FILLERS.filter((name) => this.phrases.has(phraseId(name, this.state.gender)));
    if (ready.length === 0) return Promise.resolve(true);
    return this.sayPhrase(ready[Math.floor(Math.random() * ready.length)]);
  }

  /** ينطق عبارة ثابتة؛ يعيد true إن اكتملت دون مقاطعة */
  private async sayPhrase(name: PhraseName): Promise<boolean> {
    const id = phraseId(name, this.state.gender);
    const buffer = this.phrases.get(id);
    if (buffer && this.player) return this.player.playBuffer(buffer);
    return this.deviceSpeak(phraseText(id));
  }

  /** صوت الجهاز احتياطًا (أقل طبيعية) */
  private deviceSpeak(text: string): Promise<boolean> {
    const epoch = this.epoch;
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setTimeout(() => resolve(epoch === this.epoch), Math.min(8000, 1200 + text.length * 30));
        return;
      }
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ar-SA";
      utterance.rate = 0.95;
      const voice = bestDeviceVoice(synth.getVoices());
      if (voice) utterance.voice = voice;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(watchdog);
        resolve(epoch === this.epoch);
      };
      const watchdog = setTimeout(finish, 2500 + text.length * 85);
      utterance.onend = finish;
      utterance.onerror = finish;
      synth.speak(utterance);
    });
  }

  private stopSpeaking() {
    this.player?.stop();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  /* ------------------------------ زر «تكلّم» ------------------------------ */

  /** بدء الكلام، أو إيقافه مؤقتًا/إكماله، أو مقاطعة المساعد ليتكلم المتصل */
  async talk(): Promise<void> {
    if (!this.active || !this.state.micAvailable) return;
    const { phase, paused } = this.state;
    if (phase === "recording") {
      this.capturing = paused;
      this.set({ paused: !paused, level: 0 });
      return;
    }
    if (phase === "speaking" || phase === "greeting") {
      this.epoch += 1;
      this.stopSpeaking();
    } else if (phase !== "ready") {
      return;
    }
    await this.startRecording();
  }

  private async startRecording() {
    if (!this.ctx) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch {
      this.set({
        micAvailable: false,
        notice: "ما قدرنا نوصل للميكروفون. اسمح به من إعدادات المتصفح، أو اكتب سؤالك تحت.",
      });
      this.setPhase("ready");
      return;
    }
    if (!this.active) {
      this.releaseMic();
      return;
    }
    await this.ctx.resume().catch(() => {});
    this.chunks = [];
    this.samples = 0;
    this.energy = 0;
    this.capturing = true;
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    const rate = this.ctx.sampleRate;
    this.processor.onaudioprocess = (event) => {
      if (!this.capturing) return;
      const data = event.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(data));
      this.samples += data.length;
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
      this.energy += sum;
      const now = performance.now();
      if (now - this.lastLevelAt > 90) {
        this.lastLevelAt = now;
        const rms = Math.sqrt(sum / data.length);
        const recordSeconds = Math.floor(this.samples / rate);
        this.set({ level: Math.min(1, rms * 6), recordSeconds });
        if (recordSeconds >= MAX_RECORD_SECONDS) {
          this.capturing = false;
          this.set({ paused: true, level: 0, notice: "وصلت أقصى مدة للتسجيل، اضغط «جاوبني»." });
        }
      }
    };
    this.source.connect(this.processor);
    this.processor.connect(this.ctx.destination);
    this.set({ phase: "recording", paused: false, recordSeconds: 0, level: 0, notice: null });
  }

  private releaseMic() {
    this.capturing = false;
    try {
      this.source?.disconnect();
      this.processor?.disconnect();
    } catch {
      // مفصول
    }
    if (this.processor) this.processor.onaudioprocess = null;
    this.source = null;
    this.processor = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  /** إلغاء التسجيل الحالي دون إرسال */
  discard() {
    if (this.state.phase !== "recording") return;
    this.releaseMic();
    this.chunks = [];
    this.set({ paused: false, level: 0, recordSeconds: 0 });
    this.setPhase("ready");
  }

  /* ------------------------------ زر «جاوبني» ------------------------------ */

  async answer(): Promise<void> {
    if (!this.active || this.state.phase !== "recording" || !this.ctx) return;
    const rate = this.ctx.sampleRate;
    const seconds = this.samples / rate;
    const rms = this.samples ? Math.sqrt(this.energy / this.samples) : 0;
    this.releaseMic();
    const chunks = this.chunks;
    this.chunks = [];
    this.set({ paused: false, level: 0 });

    if (seconds < 0.6 || rms < 0.003) {
      this.setPhase("speaking");
      await this.sayPhrase("didntHear");
      if (this.active && this.phaseIs("speaking")) this.setPhase("ready");
      return;
    }

    const epoch = this.epoch;
    this.setPhase("transcribing");
    const filler = this.sayFiller();

    let text = "";
    let failed = false;
    try {
      const response = await fetch("/api/family-lawyer/transcribe", {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: encodeWav(chunks, rate),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; text?: string };
      failed = !response.ok || !data.ok;
      text = (data.text ?? "").trim();
    } catch {
      failed = true;
    }
    if (epoch !== this.epoch) return;

    if (failed || !text) {
      await filler;
      if (epoch !== this.epoch) return;
      this.setPhase("speaking");
      await this.sayPhrase(failed ? "error" : "didntHear");
      if (epoch === this.epoch) this.setPhase("ready");
      return;
    }
    await this.ask(text, filler);
  }

  /** سؤال مكتوب (للضوضاء أو لمن لا يسمح متصفحه بالتسجيل) */
  async sendText(text: string): Promise<void> {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!this.active || clean.length < 2) return;
    if (!["ready", "speaking", "greeting", "recording"].includes(this.state.phase)) return;
    if (this.state.phase === "recording") {
      this.releaseMic();
      this.chunks = [];
    }
    this.epoch += 1;
    this.stopSpeaking();
    const filler = this.sayFiller();
    await this.ask(clean, filler);
  }

  private async ask(text: string, filler: Promise<boolean>) {
    const epoch = this.epoch;
    if (this.state.turns >= MAX_TURNS) {
      await filler;
      await this.closeWith("turnLimit", "limit");
      return;
    }
    const turns = this.state.turns + 1;
    trackToolStep(this.toolId, Math.min(turns, 40));
    this.addLine({ role: "user", text });
    this.set({ turns });
    this.setPhase("thinking");

    const messages = this.state.lines
      .filter((line) => !line.failed)
      .slice(-7)
      .map((line) => ({ role: line.role, text: line.text }));

    this.abort = new AbortController();
    const timeout = setTimeout(() => this.abort?.abort(), 30_000);
    let data: {
      ok?: boolean;
      answer?: string;
      sources?: CallSource[];
      safety?: { text: string };
      speech?: { text: string; sig: string; tone: string };
      error?: string;
    } = {};
    let ok = false;
    try {
      const response = await fetch("/api/family-lawyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, gender: this.state.gender }),
        signal: this.abort.signal,
      });
      data = await response.json().catch(() => ({}));
      ok = response.ok && !!data.ok && !!data.answer;
    } catch {
      ok = false;
    } finally {
      clearTimeout(timeout);
    }
    if (epoch !== this.epoch) return;

    // لا نقطع عبارة الانتظار في منتصفها
    await filler;
    if (epoch !== this.epoch) return;

    if (!ok) {
      this.addLine({ role: "assistant", text: data.error || phraseText(phraseId("error", this.state.gender)), failed: true });
      this.setPhase("speaking");
      await this.sayPhrase("error");
      if (epoch === this.epoch) this.setPhase("ready");
      return;
    }

    this.addLine({
      role: "assistant",
      text: data.answer!,
      sources: data.sources ?? [],
      safety: data.safety?.text,
    });
    this.setPhase("speaking");
    let outcome: "done" | "stopped" | "failed" = "failed";
    if (data.speech && this.player) {
      outcome = await this.player.playStream("/api/family-lawyer/voice", data.speech);
    }
    if (outcome === "failed" && epoch === this.epoch) {
      if (!this.state.notice) this.set({ notice: "تعذّر الصوت البشري مؤقتًا، فقرأنا الجواب بصوت جهازك." });
      await this.deviceSpeak(data.speech?.text ?? data.answer!);
    }
    if (epoch === this.epoch && this.state.phase === "speaking") this.setPhase("ready");
  }

  /** إيقاف كلام المساعد والعودة لدور المتصل */
  interrupt() {
    if (!this.active || (this.state.phase !== "speaking" && this.state.phase !== "greeting")) return;
    this.epoch += 1;
    this.stopSpeaking();
    this.setPhase("ready");
  }

  /* ------------------------------- إنهاء المكالمة ------------------------------- */

  private async closeWith(name: PhraseName, by: CallState["endedBy"]) {
    if (!this.active) return;
    this.epoch += 1;
    this.releaseMic();
    this.stopSpeaking();
    this.abort?.abort();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.addLine({ role: "assistant", text: phraseText(phraseId(name, this.state.gender)) });
    this.setPhase("speaking");
    await this.loadPhrase(name);
    await this.sayPhrase(name);
    this.end(by);
  }

  end(by: CallState["endedBy"] = "user") {
    if (!this.active) return;
    this.cleanup();
    trackToolComplete(this.toolId);
    this.set({ phase: "ended", endedBy: by, level: 0, paused: false });
  }

  private cleanup() {
    this.active = false;
    this.epoch += 1;
    this.abort?.abort();
    this.abort = null;
    this.releaseMic();
    this.stopSpeaking();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.player = null;
    this.phrases.clear();
  }

  dispose() {
    this.cleanup();
  }
}
