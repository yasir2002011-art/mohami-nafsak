import crypto from "node:crypto";
import { after, NextResponse } from "next/server";
import { channelRules, experimentEnabled, numberAllowed, phoneHash, safeEqual, techLog } from "@/lib/experiment/core";
import { acceptWhatsAppCall, disconnectWhatsAppCall, livekitConfigured } from "@/lib/experiment/livekit";
import {
  downloadMedia,
  parseCalls,
  parseInbound,
  sendText,
  signatureValid,
  whatsappConfigured,
  type InboundCall,
  type InboundMessage,
} from "@/lib/experiment/whatsapp";
import { answerFamilyQuestion } from "@/lib/family-answer";
import { transcribe } from "@/lib/gemini-voice";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * ويب هوك واتساب (تجريبي):
 * - رسالة نصية أو صوتية ← مسار الإجابة القائم ← رد نصي.
 * - مكالمة واتساب يبدؤها المستخدم (مجانية) ← تُسلَّم إلى LiveKit ليرد الوكيل الصوتي.
 *
 * - مرحلة «المالك فقط»: لا يُرَد إلا على أرقام EXPERIMENT_ALLOWED_NUMBERS.
 * - بلا ذاكرة: كل رسالة تُجاب وحدها، لأننا لا نحفظ نصوص المحادثات في هذه المرحلة.
 * - لا يُكتب رقم ولا نص في السجلات.
 */

export const maxDuration = 60;

const MAX_AUDIO_BYTES = 4_000_000;

/** التحقق الأولي من Meta عند ربط الويب هوك */
export async function GET(request: Request) {
  if (!experimentEnabled()) return new Response("not found", { status: 404 });
  const params = new URL(request.url).searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
  if (
    params.get("hub.mode") === "subscribe" &&
    expected.length >= 16 &&
    safeEqual(params.get("hub.verify_token") ?? "", expected)
  ) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(request: Request) {
  if (!experimentEnabled() || !whatsappConfigured()) return new Response("not found", { status: 404 });

  const raw = await request.text();
  if (!signatureValid(raw, request.headers.get("x-hub-signature-256"))) {
    return new Response("forbidden", { status: 403 });
  }

  let messages: InboundMessage[] = [];
  let calls: InboundCall[] = [];
  try {
    const payload = JSON.parse(raw);
    messages = parseInbound(payload);
    calls = parseCalls(payload);
  } catch {
    return NextResponse.json({ ok: true });
  }

  // نرد 200 فورًا (Meta تعيد الإرسال إن تأخرنا) ثم نعالج
  after(async () => {
    // المكالمات أولًا: يجب قبولها خلال ثوانٍ
    for (const call of calls) await handleCall(call).catch(() => techLog("whatsapp-call", "error"));
    for (const message of messages) await handle(message).catch(() => techLog("whatsapp", "error"));
  });
  return NextResponse.json({ ok: true });
}

async function handle(message: InboundMessage): Promise<void> {
  const started = Date.now();
  const e164 = `+${message.from.replace(/\D/g, "")}`;
  if (!numberAllowed(e164)) {
    techLog("whatsapp", "ignored-not-allowed");
    return;
  }

  // Meta تعيد إرسال الحدث نفسه أحيانًا: نعالج كل رسالة مرة واحدة
  const seen = await checkRateLimit(`exp:wa:msg:${message.id.slice(-48)}`, 1, 86_400);
  if (!seen.allowed) return;

  const who = phoneHash(e164);
  const perMinute = await checkRateLimit(`exp:wa:min:${who}`, 6, 60);
  const perDay = await checkRateLimit(`exp:wa:day:${who}`, 60, 86_400);
  if (!perMinute.allowed || !perDay.allowed) {
    techLog("whatsapp", "rate-limited");
    return;
  }

  let question = "";
  if (message.type === "text") {
    question = (message.text ?? "").trim();
  } else if (message.type === "audio" && message.audioId) {
    const media = await downloadMedia(message.audioId, MAX_AUDIO_BYTES);
    if (media) question = await transcribe(media.data, media.mime).catch(() => "");
    if (!question) {
      await sendText(message.from, "معليش، ما قدرت أسمع الرسالة الصوتية بوضوح. ممكن تعيدها أو تكتب سؤالك؟");
      techLog("whatsapp", "audio-unclear", Date.now() - started);
      return;
    }
  } else {
    await sendText(message.from, "أقدر أستقبل رسائل نصية وصوتية فقط. اكتب سؤالك أو سجّله صوتيًا.");
    return;
  }
  if (question.length < 2) return;

  const result = await answerFamilyQuestion([{ role: "user", text: question }], "m", {
    extraRules: channelRules("whatsapp"),
  });
  const body = result.body as { ok?: boolean; answer?: string; safety?: { text: string }; sources?: { cite: string }[] };
  if (!body.ok || !body.answer) {
    await sendText(message.from, "معليش، صار عندي خلل بسيط. ممكن تعيد سؤالك بعد شوي؟");
    techLog("whatsapp", "answer-failed", Date.now() - started);
    return;
  }

  const cites = [...new Set((body.sources ?? []).map((source) => source.cite))].slice(0, 6);
  const text = [
    body.safety?.text,
    body.answer,
    cites.length ? `المصدر: ${cites.join("، ")}.` : "",
    "— المحامي الاصطناعي (مساعد آلي). الإجابة استرشادية ولا تغني عن محامٍ مرخّص.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const sent = await sendText(message.from, text);
  techLog("whatsapp", sent ? "answered" : "send-failed", Date.now() - started);
}

/** مكالمة واتساب: نقبل فقط ما بدأه مستخدم من القائمة المسموحة، ولا نتصل نحن بأحد */
async function handleCall(call: InboundCall): Promise<void> {
  if (!livekitConfigured()) return;

  if (call.event === "terminate") {
    await disconnectWhatsAppCall(call.id).catch(() => {});
    techLog("whatsapp-call", "ended");
    return;
  }
  if (call.event !== "connect" || call.direction !== "USER_INITIATED" || !call.sdp) return;

  const e164 = `+${call.from.replace(/\D/g, "")}`;
  if (!numberAllowed(e164)) {
    techLog("whatsapp-call", "ignored-not-allowed");
    return;
  }
  const seen = await checkRateLimit(`exp:wa:call:${call.id.slice(-48)}`, 1, 3600);
  const perDay = await checkRateLimit(`exp:wa:calls:${phoneHash(e164)}`, 10, 86_400);
  if (!seen.allowed || !perDay.allowed) return;

  await acceptWhatsAppCall(call.id, call.sdp, `wa-${crypto.randomBytes(6).toString("hex")}`);
  techLog("whatsapp-call", "accepted");
}
