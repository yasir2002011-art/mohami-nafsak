import { NextResponse } from "next/server";
import { channelRules, experimentEnabled, safeEqual, techLog } from "@/lib/experiment/core";
import { answerFamilyQuestion } from "@/lib/family-answer";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * جسر الوكيل الصوتي (voice-agent) إلى مسار الإجابة القائم.
 *
 * الوكيل لا يجيب عن أي سؤال نظامي من عنده: يرسل سؤال المتصل إلى هنا ويقرأ الجواب
 * كما هو. محمي بسر مشترك (EXPERIMENT_AGENT_SECRET)، ولا يُستدعى من المتصفح.
 */

export const maxDuration = 30;

export async function POST(request: Request) {
  if (!experimentEnabled()) return NextResponse.json({ ok: false }, { status: 404 });
  const expected = process.env.EXPERIMENT_AGENT_SECRET ?? "";
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (expected.length < 24 || !safeEqual(given, expected)) return NextResponse.json({ ok: false }, { status: 404 });

  const day = new Date().toISOString().slice(0, 10);
  const limit = await checkRateLimit(`exp:agent:${day}`, 500, 86_400);
  if (!limit.allowed) return NextResponse.json({ ok: false, error: "limit" }, { status: 429 });

  const started = Date.now();
  const body = (await request.json().catch(() => ({}))) as { messages?: unknown };
  const result = await answerFamilyQuestion(body.messages, "m", { extraRules: channelRules("voice") });
  const data = result.body as { ok?: boolean; speech?: { text: string }; answer?: string };
  techLog("agent-answer", data.ok ? "ok" : `fail-${result.status}`, Date.now() - started);
  // نص النطق: الأرقام كلمات كما تُقال، وتنبيه الطوارئ أولًا إن وُجد
  return NextResponse.json(
    data.ok ? { ok: true, say: data.speech?.text ?? data.answer } : { ok: false },
    { status: data.ok ? 200 : result.status },
  );
}
