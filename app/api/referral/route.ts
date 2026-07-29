import { NextResponse } from "next/server";
import { getAll, saveAll } from "@/lib/store";
import { track } from "@/lib/analytics";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import type { Referral } from "@/types";

/**
 * تسجيل إحالة إلى محامٍ.
 *
 * يُسجَّل: من أي أداة، وأي نتيجة، وأي محامٍ، ومتى، وهل وُجدت موافقة.
 * لا يُسجَّل: أي إجابة، ولا اسم، ولا وصف قضية.
 *
 * حتى لو أُرسل حقل sharedSummary من المتصفح فإنه يُتجاهل هنا عمدًا —
 * المنصة لا تنقل ملخص القضية، والمستخدم هو من يكتبه بنفسه في محادثته.
 */
export async function POST(request: Request) {
  const limit = await checkRateLimit(`referral:${clientIp(request)}`, 10, 60);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "محاولات كثيرة." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const lawyerId = String(body.lawyerId ?? "");
    if (!lawyerId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const lawyers = await getAll("lawyers");
    if (!lawyers.some((lawyer) => lawyer.id === lawyerId && lawyer.active)) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    const now = new Date().toISOString();
    const referral: Referral = {
      id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      lawyerId,
      toolId: typeof body.toolId === "string" ? body.toolId : undefined,
      resultId: typeof body.resultId === "string" ? body.resultId : undefined,
      topicLabel: String(body.topicLabel ?? "مسألة نظامية").slice(0, 120),
      consentGiven: body.consentGiven === true,
      status: "new",
      createdAt: now,
      updatedAt: now,
    };

    const referrals = await getAll("referrals");
    referrals.push(referral);
    await saveAll("referrals", referrals);

    await track("lawyer_click", {
      lawyerId,
      toolId: referral.toolId,
      resultId: referral.resultId,
    });
    await track("referral_created", { lawyerId, toolId: referral.toolId });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
