import { NextResponse } from "next/server";
import { answerFamilyQuestion, familyAnswerDisabled } from "@/lib/family-answer";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

/**
 * المحامي الأسري الصوتي — مسار الجواب (نص إلى نص) لصفحة الأداة في الموقع.
 *
 * المتصل يتكلم ثم يضغط «جاوبني»، فيُفرَّغ كلامه نصًّا (transcribe/)، وهذا المسار
 * يطبّق حدود الطلبات ثم يستدعي منطق الإجابة في lib/family-answer.ts، ويعيد الجواب
 * مع نسخة موقّعة للنطق (voice/). لا يُحفظ شيء.
 */

/** سقف عالمي يوميًا لكل الزوار — يحمي رصيد المفتاح من الاستنزاف */
const GLOBAL_DAILY_TURNS = 3000;

export const maxDuration = 30;

export async function POST(request: Request) {
  if (familyAnswerDisabled()) {
    return NextResponse.json({ ok: false, error: "الخدمة موقوفة مؤقتًا." }, { status: 503 });
  }

  const key = clientKey(request);
  const perMinute = await checkRateLimit(`fl:min:${key}`, 8, 60);
  const perDay = await checkRateLimit(`fl:day:${key}`, 80, 86_400);
  const day = new Date().toISOString().slice(0, 10);
  const global = await checkRateLimit(`fl:global:${day}`, GLOBAL_DAILY_TURNS, 86_400);
  if (!perMinute.allowed || !perDay.allowed || !global.allowed) {
    return NextResponse.json(
      {
        ok: false,
        retryable: !perMinute.allowed,
        error: !global.allowed
          ? "الخدمة مزدحمة اليوم. حاول لاحقًا."
          : "تجاوزت الحد المسموح من الأسئلة. حاول لاحقًا.",
      },
      { status: 429 },
    );
  }

  let body: { messages?: unknown; gender?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "طلب غير صالح." }, { status: 400 });
  }

  const result = await answerFamilyQuestion(body?.messages, body?.gender === "f" ? "f" : "m");
  return NextResponse.json(result.body, { status: result.status });
}
