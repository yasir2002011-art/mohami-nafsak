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

const DEV_SECRET = "dev-only-insecure-secret";

function secret(): string {
  return process.env.ADMIN_SESSION_SECRET || DEV_SECRET;
}

/**
 * الفشل المغلق: في الإنتاج لا تُقبل أي جلسة إدارة ما لم يُضبط مفتاح توقيع
 * قوي (‏32 حرفًا فأكثر‏) وكلمة مرور قوية (‏12 حرفًا فأكثر‏). فبدونهما تكون
 * الجلسات قابلة للتزوير، فالأأمن منع لوحة الإدارة كليًا حتى تُضبط بيئة سليمة.
 */
export function adminSecuritySafe(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "";
  return (
    sessionSecret.length >= 32 &&
    sessionSecret !== DEV_SECRET &&
    password.length >= 12
  );
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
  if (!adminSecuritySafe()) return false;
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
  // لا تسمح بالدخول إذا كانت بيئة الأمان غير سليمة في الإنتاج
  if (!adminSecuritySafe()) return false;

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
    sameSite: "strict",
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
