import { NextResponse } from "next/server";
import { track } from "@/lib/analytics";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import type { AnalyticsEventType } from "@/types";

/**
 * استقبال أحداث مجهولة الهوية.
 *
 * قائمة بيضاء صارمة للحقول: أي حقل غير مذكور هنا يُتجاهل،
 * فلا يمكن تسريب إجابة أو نص حر إلى ملف الإحصاءات عن طريق هذا المسار.
 */

const ALLOWED_TYPES: AnalyticsEventType[] = [
  "tool_view",
  "tool_start",
  "tool_question",
  "tool_complete",
  "tool_abandon",
  "result_copy",
  "result_satisfied",
  "result_unsatisfied",
  "lawyer_click",
  "ad_impression",
  "article_view",
];

const asId = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 && value.length <= 100 ? value : undefined;

export async function POST(request: Request) {
  const limit = await checkRateLimit(`track:${clientIp(request)}`, 80, 60);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  try {
    const body = await request.json();
    const type = body?.type as AnalyticsEventType;

    if (!ALLOWED_TYPES.includes(type)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    await track(type, {
      toolId: asId(body.toolId),
      sectionId: asId(body.sectionId),
      questionId: asId(body.questionId),
      resultId: asId(body.resultId),
      lawyerId: asId(body.lawyerId),
      articleId: asId(body.articleId),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
