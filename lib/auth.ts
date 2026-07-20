import crypto from "node:crypto";
import { cookies } from "next/headers";

/**
 * جلسة لوحة الإدارة.
 *
 * نسخة أولى بسيطة: كلمة مرور واحدة من متغيّر بيئة + كوكي موقّعة.
 * لا توجد أي مفاتيح داخل كود الواجهة.
 *
 * قبل النشر الحقيقي يجب استبدالها بحسابات مستقلة + مصادقة ثنائية
 * (الحقول جاهزة في AdminUser: role و twoFactorEnabled).
 */

const COOKIE_NAME = "mn_admin_session";
/** انتهاء الجلسة تلقائيًا بعد عدم النشاط */
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 4;

function secret(): string {
  return process.env.ADMIN_SESSION_SECRET || "dev-only-insecure-secret";
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

function createToken(role: string): string {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${role}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string): { role: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [role, expiresAt, signature] = parts;
  const payload = `${role}.${expiresAt}`;
  const expected = sign(payload);

  // مقارنة ثابتة الزمن لتفادي تسريب التوقيع
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }

  if (Number(expiresAt) < Date.now()) return null;
  return { role };
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return Boolean(token && verifyToken(token));
}

export async function currentRole(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token)?.role ?? null;
}

/** يتحقق من كلمة المرور بمقارنة ثابتة الزمن ويفتح الجلسة */
export async function signIn(password: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;

  const given = Buffer.from(password);
  const target = Buffer.from(expected);
  if (given.length !== target.length || !crypto.timingSafeEqual(given, target)) {
    return false;
  }

  const store = await cookies();
  store.set(COOKIE_NAME, createToken("owner"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return true;
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/* ------------------------- حماية من المحاولات المتكررة ------------------------- */

const attempts = new Map<string, { count: number; firstAttemptAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function tooManyAttempts(key: string): boolean {
  const record = attempts.get(key);
  if (!record) return false;
  if (Date.now() - record.firstAttemptAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(key: string): void {
  const record = attempts.get(key);
  if (!record || Date.now() - record.firstAttemptAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttemptAt: Date.now() });
    return;
  }
  record.count += 1;
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}
