import { NextResponse } from "next/server";
import { experimentEnabled, gateKeyValid, openGate } from "@/lib/experiment/core";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

/** بوّابة الصفحة التجريبية: مفتاح صحيح ← كوكي دخول 12 ساعة */
export async function POST(request: Request) {
  if (!experimentEnabled()) return NextResponse.json({ ok: false }, { status: 404 });
  const limit = await checkRateLimit(`exp:gate:${clientKey(request)}`, 5, 600);
  if (!limit.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { key?: unknown };
  if (!gateKeyValid(body.key)) return NextResponse.json({ ok: false }, { status: 401 });
  await openGate();
  return NextResponse.json({ ok: true });
}
