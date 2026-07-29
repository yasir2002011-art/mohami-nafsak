import { NextResponse } from "next/server";
import { adminSecuritySafe, signIn } from "@/lib/auth";
import { logAudit } from "@/lib/store";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  // بيئة أمان غير سليمة في الإنتاج — لا تفتح اللوحة حتى تُضبط الأسرار
  if (!adminSecuritySafe()) {
    return NextResponse.json(
      {
        error:
          "لوحة الإدارة مقفلة لأسباب أمنية. اضبط ADMIN_SESSION_SECRET (32 حرفًا فأكثر) وADMIN_PASSWORD (12 حرفًا فأكثر) في متغيّرات البيئة.",
      },
      { status: 503 },
    );
  }

  // حدّ محاولات الدخول — يعمل بموثوقية عبر النسخ عند تفعيل Upstash
  const ip = clientIp(request);
  const limit = await checkRateLimit(`login:${ip}`, 5, 15 * 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة." },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "لم تُضبط كلمة مرور الإدارة. أضف ADMIN_PASSWORD في متغيّرات البيئة." },
      { status: 500 },
    );
  }

  if (await signIn(password)) {
    await logAudit({
      actor: "owner",
      action: "login",
      entity: "admin",
      entityId: "session",
      summary: "دخول ناجح إلى لوحة الإدارة",
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "كلمة المرور غير صحيحة." }, { status: 401 });
}
