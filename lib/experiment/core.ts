import crypto from "node:crypto";
import { cookies } from "next/headers";

/**
 * الميزة التجريبية «المحامي الاصطناعي» (واتساب كتابةً ومكالمةً، هاتف وارد، فيديو الموقع).
 *
 * المستخدم هو الذي يبدأ دائمًا: لا اتصال صادر من المنصة إطلاقًا، ولا مزوّد مدفوع.
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
 * بفواصل). لا يُرَد في واتساب (كتابةً أو مكالمةً) إلا عليها؛ وإن كانت فارغة فلا يُرَد على أحد.
 */
export function numberAllowed(e164: string): boolean {
  const list = (process.env.EXPERIMENT_ALLOWED_NUMBERS ?? "")
    .split(",")
    .map((item) => normalizeSaudiMobile(item) ?? item.trim())
    .filter(Boolean);
  return list.length === 0 ? false : list.includes(e164);
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
