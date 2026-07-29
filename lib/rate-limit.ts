/**
 * تحديد معدّل الطلبات (rate limit).
 *
 * الأولوية: إن ضُبطت خدمة Upstash Redis (متغيّرا البيئة أدناه) استُخدمت،
 * فتعمل الحماية بموثوقية عبر كل نسخ الخادم بلا حالة (serverless). وإلا
 * فعدّاد في الذاكرة كحماية جزئية أفضل من لا شيء.
 *
 * للإنتاج التجاري يُنصح بشدّة بتفعيل Upstash (مجاني للبداية):
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

const memory = new Map<string, { count: number; resetAt: number }>();

function memoryLimit(key: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  const record = memory.get(key);

  if (!record || record.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { allowed: true, retryAfterSec: 0 };
  }

  record.count += 1;
  if (record.count > limit) {
    return { allowed: false, retryAfterSec: Math.ceil((record.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function upstash(command: string[]): Promise<number | null> {
  const response = await fetch(`${UPSTASH_URL}/${command.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`upstash ${response.status}`);
  const data = (await response.json()) as { result?: number };
  return typeof data.result === "number" ? data.result : null;
}

/**
 * يزيد العدّاد للمفتاح ويقرّر السماح. يُخفق مفتوحًا (يسمح) إن تعطّلت خدمة
 * التحديد، حتى لا يتوقف المنتج بسبب عطل في الحماية — والحاجز الصلب هو
 * مفتاح الإيقاف في مسارات التكلفة.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return memoryLimit(key, limit, windowSec);
  }

  try {
    const count = await upstash(["INCR", key]);
    if (count === 1) {
      await upstash(["EXPIRE", key, String(windowSec)]);
    }
    if (count !== null && count > limit) {
      return { allowed: false, retryAfterSec: windowSec };
    }
    return { allowed: true, retryAfterSec: 0 };
  } catch {
    // تعطّل خدمة التحديد — نسمح ولا نُسقط الطلب
    return { allowed: true, retryAfterSec: 0 };
  }
}

/** استخراج عنوان الطلب من رؤوس الوكيل */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
