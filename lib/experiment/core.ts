import crypto from "node:crypto";
import { cookies } from "next/headers";

/**
 * الميزة التجريبية «المحامي الاصطناعي» (واتساب، هاتف، اتصلوا بي، فيديو).
 *
 * كل شيء هنا خلف مفتاح واحد: EXPERIMENT_VOICE=1. بدونه تعيد كل المسارات 404
 * والصفحة غير موجودة. الصفحة مخفية (noindex، بلا رابط) وخلف بوّابة بمفتاح
 * EXPERIMENT_KEY. لا علاقة لهذه الملفات بمسارات الإنتاج. التفاصيل: EXPERIMENT-VOICE.md
 *
 * الخصوصية: رقم الجوال لا يُحفظ عندنا أبدًا بصيغته؛ تُستعمل بصمته (HMAC) مفتاحًا
 * لحدود الطلبات فقط وتنتهي تلقائيًا خلال 24 ساعة. لا تُحفظ نصوص ولا تسجيلات.
 */

export function experimentEnabled(): boolean {
  return process.env.EXPERIMENT_VOICE === "1";
}

function secret(): string {
  // مفتاح مستقل إن وُجد، وإلا مفتاح الجلسات؛ لا قيمة افتراضية في الإنتاج
  const value = process.env.EXPERIMENT_KEY || "";
  const base = process.env.ADMIN_SESSION_SECRET || (process.env.NODE_ENV === "production" ? "" : "mn-exp-dev");
  return `${base}|${value}`;
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* --------------------------------- البوّابة --------------------------------- */

const GATE_COOKIE = "mn_exp";

function gateToken(): string {
  return crypto.createHmac("sha256", secret()).update("gate|v1").digest("hex");
}

export function gateKeyValid(key: unknown): boolean {
  const expected = process.env.EXPERIMENT_KEY ?? "";
  return typeof key === "string" && expected.length >= 16 && safeEqual(key, expected);
}

export async function openGate(): Promise<void> {
  (await cookies()).set(GATE_COOKIE, gateToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function gateOpen(): Promise<boolean> {
  if (!experimentEnabled() || (process.env.EXPERIMENT_KEY ?? "").length < 16) return false;
  const value = (await cookies()).get(GATE_COOKIE)?.value ?? "";
  return safeEqual(value, gateToken());
}

/* ---------------------------------- الأرقام ---------------------------------- */

/** يقبل جوالًا سعوديًا فقط ويعيده بصيغة E.164 (+9665XXXXXXXX)، وإلا null */
export function normalizeSaudiMobile(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[^\d+]/g, "")
    .replace(/^\+/, "")
    .replace(/^00/, "");
  const national = digits.startsWith("966") ? digits.slice(3) : digits.replace(/^0/, "");
  return /^5\d{8}$/.test(national) ? `+966${national}` : null;
}

/** بصمة الرقم لحدود الطلبات — لا يُعكس، ويتغير بتغير السر */
export function phoneHash(e164: string): string {
  return crypto.createHmac("sha256", secret()).update(`phone|${e164}`).digest("hex").slice(0, 32);
}

/**
 * قائمة الأرقام المسموحة في مرحلة «المالك فقط» (EXPERIMENT_ALLOWED_NUMBERS، مفصولة
 * بفواصل). ما دامت مضبوطة فلا يُرَد على غيرها في واتساب ولا يُتصل بغيرها.
 */
export function numberAllowed(e164: string): boolean {
  const list = (process.env.EXPERIMENT_ALLOWED_NUMBERS ?? "")
    .split(",")
    .map((item) => normalizeSaudiMobile(item) ?? item.trim())
    .filter(Boolean);
  return list.length === 0 ? false : list.includes(e164);
}

/* ------------------------------- تخزين قصير الأجل ------------------------------- */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const memory = new Map<string, { value: string; expiresAt: number }>();

async function redis(command: string[]): Promise<unknown> {
  const response = await fetch(`${UPSTASH_URL}/${command.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`upstash ${response.status}`);
  return ((await response.json()) as { result?: unknown }).result;
}

/** قيمة مؤقتة (رمز تحقق مجزّأ مثلًا) تنتهي تلقائيًا */
export async function tempSet(key: string, value: string, ttlSec: number): Promise<void> {
  if (UPSTASH_URL && UPSTASH_TOKEN) await redis(["SET", key, value, "EX", String(ttlSec)]);
  else memory.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

export async function tempGet(key: string): Promise<string | null> {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    const result = await redis(["GET", key]);
    return typeof result === "string" ? result : null;
  }
  const item = memory.get(key);
  if (!item || item.expiresAt < Date.now()) return null;
  return item.value;
}

export async function tempDel(key: string): Promise<void> {
  if (UPSTASH_URL && UPSTASH_TOKEN) await redis(["DEL", key]);
  else memory.delete(key);
}

/* ---------------------------------- السجل الفني ---------------------------------- */

/** سجل مجهّل: قناة ونتيجة ومدة فقط — بلا رقم ولا نص */
export function techLog(channel: string, outcome: string, ms?: number): void {
  console.log(JSON.stringify({ exp: "voice", channel, outcome, ...(ms === undefined ? {} : { ms }) }));
}

/* ------------------------------ قواعد القنوات التجريبية ------------------------------ */

/**
 * تُلحق بتعليمات مسار الإجابة القائم (لا تستبدلها): اسم المساعد في هذه القنوات،
 * وقيد المالك الأشد: لا رأي في واقعة بعينها ولا توصية بمسار تقاضٍ.
 */
export function channelRules(channel: "whatsapp" | "voice"): string {
  const format =
    channel === "whatsapp"
      ? "أنت الآن ترد كتابةً في واتساب: اكتب بالأسلوب نفسه لكن كرسالة مقروءة قصيرة، ولا تقل «في المكالمة»."
      : "أنت الآن في مكالمة هاتفية أو مرئية حية: جمل قصيرة جدًا تصلح للنطق.";
  return `قواعد إضافية لهذه القناة (تعلو ما سبق عند التعارض):
- اسمك هنا «المحامي الاصطناعي» من منصة «محامي نفسك». الاسم نفسه يبيّن أنك مساعد آلي؛ لا تقل إنك محامٍ ولا إنسان. وإن سُئلت مباشرة: «أنت إنسان؟ أنت روبوت؟ أنت حقيقي؟» فأقرّ فورًا وبوضوح أنك مساعد آلي للمنصة ثم أكمل بشكل طبيعي. لا تنفِ ذلك ولا تراوغ في أي حال.
- لا تُصدر رأيًا نظاميًا في واقعة المتصل بعينها، ولا تقيّم فرص كسب دعوى، ولا توصِ بمسار تقاضٍ معيّن (لا تقل: ارفع دعوى كذا). اشرح ما يقوله النص النظامي بشكل عام، واشرح الإجراء كما ورد في المواد، ثم وجّهه إلى الكاشف المناسب في موقع محامي نفسك (مثل كاشف مستحق الحضانة) أو إلى محامٍ مرخّص ليقيّم حالته.
- جنس المتصل غير معروف في هذه القناة: خاطبه بالمذكر، وإن ظهر من كلامه أنها امرأة فخاطبها بالمؤنث من حينها.
- ${format}`;
}
