import { NextResponse } from "next/server";
import { transcribe, VoiceError } from "@/lib/gemini-voice";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

/**
 * تفريغ كلام المتصل: يستقبل تسجيله (WAV أحادي 16kHz من المتصفح) ويعيده نصًّا.
 *
 * التسجيل يُرسل إلى Gemini للتفريغ ثم يُنسى: لا يُحفظ عندنا ولا يُكتب في السجلات.
 * يستقبل بعد أن يضغط المتصل «جاوبني» فقط، فالتردد والوقفات لا تقطع كلامه.
 */

export const maxDuration = 30;

/** نحو 100 ثانية بجودة 16kHz/16-bit — تحت حد حجم الطلب في Vercel (4.5MB) */
const MAX_BYTES = 3_400_000;
/** أقل من ربع ثانية لا يحمل كلامًا */
const MIN_BYTES = 8_000;

export async function POST(request: Request) {
  if (process.env.AI_ANALYSIS_DISABLED === "1" || process.env.FAMILY_LAWYER_DISABLED === "1") {
    return NextResponse.json({ ok: false, error: "الخدمة موقوفة مؤقتًا." }, { status: 503 });
  }

  const key = clientKey(request);
  const perMinute = await checkRateLimit(`fl:stt:min:${key}`, 10, 60);
  const perDay = await checkRateLimit(`fl:stt:day:${key}`, 100, 86_400);
  const day = new Date().toISOString().slice(0, 10);
  const global = await checkRateLimit(`fl:stt:global:${day}`, 4000, 86_400);
  if (!perMinute.allowed || !perDay.allowed || !global.allowed) {
    return NextResponse.json({ ok: false, error: "تجاوزت الحد المسموح. حاول لاحقًا." }, { status: 429 });
  }

  if (!(request.headers.get("content-type") ?? "").startsWith("audio/wav")) {
    return NextResponse.json({ ok: false, error: "صيغة غير مدعومة." }, { status: 415 });
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return NextResponse.json({ ok: false, error: "التسجيل طويل جدًا." }, { status: 413 });

  const audio = Buffer.from(await request.arrayBuffer());
  if (audio.length > MAX_BYTES) return NextResponse.json({ ok: false, error: "التسجيل طويل جدًا." }, { status: 413 });
  if (audio.length < MIN_BYTES || audio.subarray(0, 4).toString("ascii") !== "RIFF") {
    return NextResponse.json({ ok: true, text: "" });
  }

  try {
    return NextResponse.json({ ok: true, text: (await transcribe(audio)).slice(0, 700) });
  } catch (error) {
    const transient = !(error instanceof VoiceError) || error.status === 0 || error.status >= 429;
    return NextResponse.json(
      { ok: false, retryable: transient, error: "تعذّر سماع التسجيل الآن." },
      { status: transient ? 503 : 502 },
    );
  }
}
