import crypto from "node:crypto";
import { safeEqual } from "@/lib/experiment/core";

/**
 * WhatsApp Cloud API (Meta) — إرسال واستقبال للميزة التجريبية.
 *
 * المتغيرات: WHATSAPP_TOKEN (رمز الوصول)، WHATSAPP_PHONE_ID (معرّف رقم الأعمال)،
 * WHATSAPP_APP_SECRET (لتوقيع الويب هوك)، WHATSAPP_VERIFY_TOKEN (للتحقق الأولي).
 *
 * المكالمات: الاشتراك في حقل calls يوصل حدث connect ومعه عرض SDP؛ يُسلَّم إلى
 * LiveKit (lib/experiment/livekit.ts) ليجيب الوكيل الصوتي. مكالمات المستخدم مجانية.
 */

const GRAPH = "https://graph.facebook.com/v27.0";

function token(): string {
  const value = process.env.WHATSAPP_TOKEN;
  if (!value) throw new Error("whatsapp-token-missing");
  return value;
}

export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_APP_SECRET);
}

/** توقيع Meta: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(الجسم الخام، سر التطبيق) */
export function signatureValid(rawBody: string, header: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return safeEqual(header.slice(7), expected);
}

async function send(payload: Record<string, unknown>): Promise<boolean> {
  // لا يرمي خطأ: فشل الإرسال نتيجة تُسجَّل (send-failed) لا عطل
  try {
    const response = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function sendText(to: string, body: string): Promise<boolean> {
  return send({ to, type: "text", text: { preview_url: false, body: body.slice(0, 3500) } });
}

/** تنزيل رسالة صوتية: معرّف الوسيط ← رابط مؤقت (5 دقائق) ← الملف */
export async function downloadMedia(mediaId: string, maxBytes: number): Promise<{ data: Buffer; mime: string } | null> {
  const meta = await fetch(`${GRAPH}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: "no-store",
  });
  if (!meta.ok) return null;
  const info = (await meta.json()) as { url?: string; mime_type?: string; file_size?: string | number };
  if (!info.url || Number(info.file_size ?? 0) > maxBytes) return null;
  // الرابط يجب أن يكون من نطاقات Meta قبل أن نرسل إليه رمز الوصول
  const host = new URL(info.url).hostname;
  if (!/(^|\.)(fbsbx\.com|facebook\.com|fbcdn\.net|whatsapp\.net)$/.test(host)) return null;
  const file = await fetch(info.url, { headers: { Authorization: `Bearer ${token()}` }, cache: "no-store" });
  if (!file.ok) return null;
  const data = Buffer.from(await file.arrayBuffer());
  if (data.length > maxBytes) return null;
  return { data, mime: (info.mime_type ?? "audio/ogg").split(";")[0].trim() };
}

export interface InboundMessage {
  id: string;
  from: string;
  type: string;
  text?: string;
  audioId?: string;
}

/** يستخرج الرسائل الواردة من حمولة الويب هوك (يتجاهل إشعارات الحالة) */
export function parseInbound(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    for (const change of (entry as { changes?: unknown[] })?.changes ?? []) {
      const value = (change as { value?: { messages?: unknown[] } })?.value;
      for (const raw of value?.messages ?? []) {
        const m = raw as {
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
          audio?: { id?: string };
        };
        // المستخدمون بأسماء مستخدمين قد لا يظهر رقمهم؛ التجربة للأرقام فقط
        if (!m.id || !m.from || !m.type) continue;
        out.push({ id: m.id, from: m.from, type: m.type, text: m.text?.body, audioId: m.audio?.id });
      }
    }
  }
  return out;
}

export interface InboundCall {
  id: string;
  from: string;
  event: string;
  direction: string;
  sdp?: string;
}

/** أحداث المكالمات (حقل calls): connect يحمل عرض SDP، وterminate عند إنهاء المتصل */
export function parseCalls(payload: unknown): InboundCall[] {
  const out: InboundCall[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    for (const change of (entry as { changes?: unknown[] })?.changes ?? []) {
      const value = (change as { value?: { calls?: unknown[] } })?.value;
      for (const raw of value?.calls ?? []) {
        const c = raw as {
          id?: string;
          from?: string;
          event?: string;
          direction?: string;
          session?: { sdp_type?: string; sdp?: string };
        };
        if (!c.id || !c.event) continue;
        out.push({
          id: c.id,
          from: c.from ?? "",
          event: c.event,
          direction: c.direction ?? "",
          sdp: c.session?.sdp_type === "offer" ? c.session.sdp : undefined,
        });
      }
    }
  }
  return out;
}
