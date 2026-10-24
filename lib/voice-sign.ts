import crypto from "node:crypto";

/**
 * توقيع نص الجواب قبل نطقه.
 *
 * مسار النطق لا يقبل إلا نصًا وقّعه خادمنا (جوابًا خرج من مسار المحامي الأسري)،
 * فلا يصلح خدمةَ تحويل نص إلى صوت مجانية لأي أحد.
 */

function secret(): string {
  return process.env.ADMIN_SESSION_SECRET || "mn-voice-dev-only";
}

export function signSpeech(text: string): string {
  return crypto.createHmac("sha256", secret()).update(`fl-voice|v1|${text}`).digest("hex").slice(0, 40);
}

export function verifySpeech(text: string, sig: unknown): boolean {
  if (typeof sig !== "string" || sig.length !== 40) return false;
  const expected = signSpeech(text);
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
