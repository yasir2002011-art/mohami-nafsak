import { NextResponse } from "next/server";
import { getAll, saveAll } from "@/lib/store";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import type { ErrorReport } from "@/types";

const KINDS: ErrorReport["kind"][] = [
  "legal-update",
  "wrong-result",
  "broken-link",
  "unsatisfied-result",
  "other",
];

/** بلاغ عن خطأ أو تحديث نظامي — يظهر في لوحة الإدارة للمراجعة */
export async function POST(request: Request) {
  const limit = await checkRateLimit(`report:${clientIp(request)}`, 6, 60);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "محاولات كثيرة." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const message = String(body.message ?? "").trim();

    if (!message || message.length > 2000) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const kind = KINDS.includes(body.kind) ? (body.kind as ErrorReport["kind"]) : "other";

    const reports = await getAll("error-reports");
    reports.push({
      id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      toolId: typeof body.toolId === "string" ? body.toolId : undefined,
      engineId: typeof body.engineId === "string" ? body.engineId : undefined,
      articleId: typeof body.articleId === "string" ? body.articleId : undefined,
      kind,
      message,
      contactEmail:
        typeof body.contactEmail === "string" && body.contactEmail.includes("@")
          ? body.contactEmail.slice(0, 160)
          : undefined,
      status: "new",
      createdAt: new Date().toISOString(),
    });

    await saveAll("error-reports", reports.slice(-2000));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
