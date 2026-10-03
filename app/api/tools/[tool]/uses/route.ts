import { NextResponse } from "next/server";
import { getAll, getSettings } from "@/lib/store";
import { DEFAULT_MIN_DISPLAY, getUsageTotals } from "@/lib/metrics";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

/**
 * عدّاد الاستخدام العام لأداة — للقراءة فقط.
 *
 * يعيد مجموع الاستخدامات منذ البداية (عدّ مجمّع، بلا أي بيان عن الزوار).
 * لا يُعرض الرقم قبل بلوغ الحد الأدنى ولا للأداة التي أُخفي عدّادها، فيعيد
 * uses = null في الحالتين حتى لا تتسرّب الأرقام الصغيرة من هذا المسار.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tool: string }> },
) {
  const limit = await checkRateLimit(`uses:${clientKey(request)}`, 60, 60);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const { tool: slug } = await params;
  const tools = await getAll("tools");
  const tool = tools.find((item) => item.published && (item.slug === slug || item.id === slug));
  if (!tool) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const [totals, settings] = await Promise.all([getUsageTotals(), getSettings()]);
  const min = settings.usageMinDisplay ?? DEFAULT_MIN_DISPLAY;
  const total = totals[tool.id] ?? 0;
  const visible = tool.showUsage !== false && total >= min;

  return NextResponse.json(
    { ok: true, tool: tool.slug, uses: visible ? total : null },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=600" } },
  );
}
