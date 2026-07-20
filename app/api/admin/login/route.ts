import { NextResponse } from "next/server";
import {
  clearAttempts,
  recordFailedAttempt,
  signIn,
  tooManyAttempts,
} from "@/lib/auth";
import { logAudit } from "@/lib/store";

export async function POST(request: Request) {
  // مفتاح التحديد: عنوان الطلب — للحد من محاولات الدخول المتكررة
  const key =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

  if (tooManyAttempts(key)) {
    return NextResponse.json(
      { error: "محاولات كثيرة. انتظر 15 دقيقة ثم أعد المحاولة." },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "لم تُضبط كلمة مرور الإدارة. أضف ADMIN_PASSWORD في ملف .env.local" },
      { status: 500 },
    );
  }

  if (await signIn(password)) {
    clearAttempts(key);
    await logAudit({
      actor: "owner",
      action: "login",
      entity: "admin",
      entityId: "session",
      summary: "دخول ناجح إلى لوحة الإدارة",
    });
    return NextResponse.json({ ok: true });
  }

  recordFailedAttempt(key);
  return NextResponse.json({ error: "كلمة المرور غير صحيحة." }, { status: 401 });
}
