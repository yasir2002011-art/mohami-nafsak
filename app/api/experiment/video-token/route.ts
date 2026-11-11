import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { experimentEnabled, gateOpen, techLog } from "@/lib/experiment/core";
import { dispatchAgent, livekitConfigured, webToken } from "@/lib/experiment/livekit";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

/** مكالمة الفيديو داخل الموقع (تجريبي): غرفة جديدة + استدعاء الوكيل + رمز دخول الزائر */
export async function POST(request: Request) {
  if (!experimentEnabled() || !(await gateOpen())) return NextResponse.json({ ok: false }, { status: 404 });
  if (!livekitConfigured()) return NextResponse.json({ ok: false, error: "LiveKit غير مهيّأ بعد." }, { status: 503 });

  const limit = await checkRateLimit(`exp:video:${clientKey(request)}`, 10, 86_400);
  if (!limit.allowed) return NextResponse.json({ ok: false, error: "وصلت الحد اليومي." }, { status: 429 });

  try {
    const room = `web-${crypto.randomBytes(6).toString("hex")}`;
    await dispatchAgent(room, { mode: "web" });
    techLog("video", "room-created");
    return NextResponse.json({ ok: true, url: process.env.LIVEKIT_URL, room, token: webToken(room, "visitor") });
  } catch {
    techLog("video", "dispatch-failed");
    return NextResponse.json({ ok: false, error: "تعذّر بدء المكالمة الآن." }, { status: 502 });
  }
}
