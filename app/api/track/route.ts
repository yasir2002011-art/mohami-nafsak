import { NextResponse } from "next/server";
import { recordMetric } from "@/lib/metrics";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

/**
 * استقبال أحداث قياس السلوك من المتصفح.
 *
 * لا يُحفظ من الطلب إلا زيادة عدّاد اليوم لحدث من القوائم المغلقة
 * (lib/metrics-schema.ts). لا يُقرأ ولا يُحفظ أي كوكي أو معرّف أو عنوان IP أو
 * نص حر؛ والحدث غير المطابق للقوائم يُرفض كله.
 *
 * سقف العدّاد العام: الاتصال الواحد لا يُحتسب له أكثر من USES_PER_DAY استخدامًا
 * للأداة الواحدة في اليوم، فلا يُضخَّم العدّاد بطلبات آلية. السقف يمرّ عبر مخزن
 * حدّ الطلبات نفسه (بصمة مشفّرة مؤقتة تنتهي تلقائيًا) ولا يدخل جدول العدّ.
 */
const USES_PER_DAY = 5;

export async function POST(request: Request) {
  const key = clientKey(request);
  const limit = await checkRateLimit(`track:${key}`, 120, 60);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  try {
    const body = await request.json();
    const ok = await recordMetric(body?.event, body?.props, "client", {
      useAllowed: async (tool) =>
        (await checkRateLimit(`use:${key}:${tool}`, USES_PER_DAY, 86_400)).allowed,
    });
    return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
