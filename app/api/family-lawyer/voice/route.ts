import { NextResponse } from "next/server";
import { synthesize, synthesizeStream, VoiceError } from "@/lib/gemini-voice";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";
import { toSpoken } from "@/lib/spoken";
import { isPhraseId, phraseText } from "@/lib/voice-phrases";
import { verifySpeech } from "@/lib/voice-sign";

/**
 * صوت المحامي الأسري.
 *
 * GET  ?phrase=greeting.m— عبارة ثابتة كملف WAV، تُخزَّن في شبكة التوزيع (تُولَّد مرة).
 * POST {text, sig, tone} — جواب موقّع من خادمنا، يُبث صوتًا خامًا (PCM 24kHz)
 *                          فيبدأ النطق قبل اكتمال التوليد.
 *
 * لا يقبل نصًا لم يوقّعه خادمنا، ولا يحفظ شيئًا.
 */

export const maxDuration = 60;

/** النبرة لكل جملة؛ اللهجة والهوية ثابتتان في الصوت المصمَّم */
const STYLES: Record<string, string> = {
  warm: "warm, friendly and calm, natural relaxed conversational pace, like a phone call",
  empathetic: "gentle, caring and empathetic, soft and a little slower, like comforting a worried friend on the phone",
  reassuring: "calm, steady and reassuring, natural conversational pace",
  serious: "serious, caring and attentive, calm but clear",
};

const PHRASE_STYLE = STYLES.warm;

function disabled(): boolean {
  return process.env.AI_ANALYSIS_DISABLED === "1" || process.env.FAMILY_LAWYER_DISABLED === "1";
}

export async function GET(request: Request) {
  if (disabled()) return NextResponse.json({ ok: false }, { status: 503 });
  const phrase = new URL(request.url).searchParams.get("phrase");
  if (!isPhraseId(phrase)) return NextResponse.json({ ok: false }, { status: 404 });

  // العبارات تُخزَّن في الشبكة؛ الحد هنا يحمي من توليد متكرر لو تجاوز أحد التخزين
  const limit = await checkRateLimit(`fl:phrase:${clientKey(request)}`, 30, 60);
  if (!limit.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  try {
    const wav = await synthesize({ text: toSpoken(phraseText(phrase)), style: PHRASE_STYLE });
    return new Response(new Uint8Array(wav), {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "public, max-age=604800, s-maxage=31536000, immutable",
      },
    });
  } catch (error) {
    const status = error instanceof VoiceError && error.status === 429 ? 503 : 502;
    return NextResponse.json({ ok: false }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  if (disabled()) return NextResponse.json({ ok: false }, { status: 503 });

  const key = clientKey(request);
  const perMinute = await checkRateLimit(`fl:voice:min:${key}`, 20, 60);
  const perDay = await checkRateLimit(`fl:voice:day:${key}`, 200, 86_400);
  const day = new Date().toISOString().slice(0, 10);
  const global = await checkRateLimit(`fl:voice:global:${day}`, 6000, 86_400);
  if (!perMinute.allowed || !perDay.allowed || !global.allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let body: { text?: unknown; sig?: unknown; tone?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text : "";
  if (!text || text.length > 1500 || !verifySpeech(text, body.sig)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const style = STYLES[typeof body.tone === "string" ? body.tone : ""] ?? STYLES.warm;

  try {
    const stream = await synthesizeStream({ text, style });
    return new Response(stream, {
      headers: {
        "Content-Type": "audio/L16; rate=24000; channels=1",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
