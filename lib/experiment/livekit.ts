import crypto from "node:crypto";

/**
 * LiveKit — رموز الدخول واستدعاء الوكيل، بلا حزم إضافية (JWT بتوقيع HS256).
 *
 * المتغيرات: LIVEKIT_URL (wss://…livekit.cloud)، LIVEKIT_API_KEY، LIVEKIT_API_SECRET،
 * وLIVEKIT_AGENT_NAME (افتراضيًا mohami-agent، ويجب أن يطابق الاسم في voice-agent/agent.py).
 *
 * الاتصال الصادر ينفّذه الوكيل نفسه (voice-agent) بعد استدعائه ببيانات الطلب، وهو النمط
 * الموثّق في LiveKit؛ هذا الملف يستدعي الوكيل فقط.
 */

export const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME || "mohami-agent";

export function livekitConfigured(): boolean {
  return Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
}

const b64 = (value: object | Buffer) =>
  (Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value))).toString("base64url");

function jwt(claims: Record<string, unknown>, ttlSec: number): string {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    iss: process.env.LIVEKIT_API_KEY,
    nbf: now - 5,
    exp: now + ttlSec,
    ...claims,
  })}`;
  const signature = crypto.createHmac("sha256", process.env.LIVEKIT_API_SECRET ?? "").update(body).digest();
  return `${body}.${b64(signature)}`;
}

function httpBase(): string {
  return (process.env.LIVEKIT_URL ?? "").replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/$/, "");
}

async function twirp(service: string, method: string, grant: Record<string, unknown>, payload: unknown) {
  const response = await fetch(`${httpBase()}/twirp/livekit.${service}/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt(grant, 60)}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`livekit ${service}.${method} ${response.status}`);
  return response.json();
}

/** رمز دخول الزائر لغرفة مكالمة الفيديو داخل الموقع (10 دقائق لبدء الاتصال) */
export function webToken(room: string, identity: string): string {
  return jwt(
    {
      sub: identity,
      video: { roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: false },
    },
    600,
  );
}

/** يستدعي الوكيل الصوتي إلى الغرفة (dispatch صريح باسم الوكيل) */
export function dispatchAgent(room: string, metadata: Record<string, string>) {
  return twirp(
    "AgentDispatchService",
    "CreateDispatch",
    { video: { roomAdmin: true, room, roomCreate: true } },
    { agent_name: AGENT_NAME, room, metadata: JSON.stringify(metadata) },
  );
}
