/**
 * صوت المحامي الأسري: تحويل الكلام إلى نص، والنص إلى صوت بشري (Gemini).
 *
 * خادمي فقط — المفتاح GEMINI_API_KEY لا يصل إلى المتصفح.
 *
 * - النطق: نماذج Gemini TTS عبر Interactions API، بصوت مُصمَّم بلهجة خليجية
 *   (FAMILY_VOICE_ID) أو صوت جاهز احتياطي. store=false حتى لا تحتفظ Google بالنص
 *   (الافتراضي عندهم حفظ التفاعلات 55 يومًا).
 * - التفريغ: نموذج Gemini يستمع لتسجيل المتصل ويعيد كلامه نصًّا كما قيل.
 *
 * لا يُحفظ عندنا صوت ولا نص.
 */

const API = "https://generativelanguage.googleapis.com/v1beta";

export const TTS_MODEL = process.env.FAMILY_TTS_MODEL || "gemini-3.8-flash-tts";
/** صوت جاهز احتياطي إن لم يُضبط صوت مُصمَّم */
export const FALLBACK_VOICE = "Sadaltager";
export const STT_MODEL = process.env.GEMINI_STT_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash";

export function voiceId(): string {
  return process.env.FAMILY_VOICE_ID || FALLBACK_VOICE;
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new VoiceError(503, "missing-key");
  return key;
}

export class VoiceError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(detail);
  }
}

async function call(path: string, init: RequestInit & { timeoutMs?: number }): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20_000);
  try {
    const response = await fetch(`${API}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey(), ...(init.headers ?? {}) },
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) throw new VoiceError(response.status, text.slice(0, 400));
    return text ? JSON.parse(text) : {};
  } catch (error) {
    if (error instanceof VoiceError) throw error;
    throw new VoiceError(0, controller.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
}

/** يبحث في الرد عن آخر مقطع صوتي (steps[].content[] بنوع audio) */
function findAudio(node: unknown): string | null {
  let found: string | null = null;
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    if (record.type === "audio" && typeof record.data === "string") found = record.data;
    for (const child of Object.values(record)) visit(child);
  };
  visit(node);
  return found;
}

/* ---------------------------------- النطق ---------------------------------- */

export interface SpeakOptions {
  text: string;
  /** نبرة الجملة (عاطفة/سرعة)، أما اللهجة والهوية فثابتة في الصوت المصمَّم */
  style?: string;
  voice?: string;
  model?: string;
}

/** يعيد WAV (24kHz، أحادي، 16-bit) */
export async function synthesize({ text, style, voice, model }: SpeakOptions): Promise<Buffer> {
  const body = {
    model: model || TTS_MODEL,
    store: false,
    input: [
      {
        type: "user_input",
        content: [
          {
            type: "text",
            text,
            ...(style ? { annotations: [{ type: "speech_metadata", style }] } : {}),
          },
        ],
      },
    ],
    response_format: { type: "audio", mime_type: "audio/wav" },
    generation_config: { speech_config: [{ voice: voice || voiceId() }] },
  };
  const data = await call("/interactions", { method: "POST", body: JSON.stringify(body), timeoutMs: 25_000 });
  const audio = findAudio(data);
  if (!audio) throw new VoiceError(502, "no-audio");
  const wav = Buffer.from(audio, "base64");
  return wav.subarray(0, 4).toString("ascii") === "RIFF" ? wav : pcmToWav(wav, 24_000);
}

/** لو جاء الصوت PCM خامًا بلا ترويسة نلفّه بترويسة WAV */
export function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/* --------------------------------- التفريغ --------------------------------- */

const STT_PROMPT = `هذا تسجيل لشخص يتكلم في مكالمة مع مساعد قانوني في مسائل الأسرة، غالبًا بلهجة خليجية أو سعودية.
اكتب كلامه نصًّا عربيًا كما قاله بلهجته، دون تلخيص ولا إضافة ولا ترجمة ولا تصحيح للمعنى.
احذف أصوات التردد والتأتأة والكلمات المكررة بلا معنى (مثل: اممم، آآه، يعني يعني).
إن لم يكن في التسجيل كلام مفهوم فأعد نصًا فارغًا.
الإخراج JSON بحقل واحد: text.`;

export async function transcribe(wav: Buffer): Promise<string> {
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ inline_data: { mime_type: "audio/wav", data: wav.toString("base64") } }, { text: STT_PROMPT }],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 1200,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: { type: "OBJECT", properties: { text: { type: "STRING" } }, required: ["text"] },
    },
  };
  const data = (await call(`/models/${STT_MODEL}:generateContent`, {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: 20_000,
  })) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  try {
    const parsed = JSON.parse(raw) as { text?: unknown };
    return typeof parsed.text === "string" ? parsed.text.replace(/\s+/g, " ").trim() : "";
  } catch {
    return "";
  }
}

/* ------------------------- مكتبة الأصوات وتصميمها (للإعداد) ------------------------- */

export async function listVoices(params: Record<string, string | string[]>): Promise<unknown> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  return call(`/voices?${query.toString()}`, { method: "GET", timeoutMs: 15_000 });
}

export async function designVoice(input: {
  displayName: string;
  gender: "male" | "female";
  languageCode: string;
  description: string;
}): Promise<unknown> {
  return call("/voices", {
    method: "POST",
    timeoutMs: 40_000,
    body: JSON.stringify({
      store: true,
      voice: {
        model: TTS_MODEL,
        type: "prompted",
        display_name: input.displayName,
        gender: input.gender,
        language_code: input.languageCode,
        prompted: { input: input.description },
      },
    }),
  });
}

/** يستمع نموذج Gemini لتسجيل ويصفه (اللهجة، الطبيعية) — لتقييم العيّنات قبل عرضها */
export async function describeAudio(wav: Buffer, question: string): Promise<string> {
  const data = (await call(`/models/${STT_MODEL}:generateContent`, {
    method: "POST",
    timeoutMs: 30_000,
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ inline_data: { mime_type: "audio/wav", data: wav.toString("base64") } }, { text: question }],
        },
      ],
      generationConfig: { temperature: 0, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } },
    }),
  })) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
}
