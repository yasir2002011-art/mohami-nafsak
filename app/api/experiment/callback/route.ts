import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  experimentEnabled,
  gateOpen,
  normalizeSaudiMobile,
  numberAllowed,
  phoneHash,
  safeEqual,
  techLog,
  tempDel,
  tempGet,
  tempSet,
} from "@/lib/experiment/core";
import { dispatchAgent, livekitConfigured } from "@/lib/experiment/livekit";
import { sendOtp, whatsappConfigured } from "@/lib/experiment/whatsapp";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

/**
 * «اتصلوا بي» (تجريبي): الزائر يطلب الاتصال بنفسه من الصفحة.
 *
 *   request: رقم + سبب مختصر ← رمز تحقق عبر واتساب (صالح 5 دقائق).
 *   verify:  الرمز الصحيح ← يُستدعى الوكيل ليتصل بالرقم خلال دقيقة.
 *
 * لا اتصال إلا برقم تحقق صاحبه منه الآن في الجلسة نفسها. لا قوائم ولا جدولة.
 * الرقم لا يُحفظ: بصمته فقط مفتاح لحدود الطلبات ورمز التحقق، وتنتهي تلقائيًا.
 */

const OTP_TTL = 300;
const REASONS = ["حضانة", "نفقة", "طلاق أو خلع", "زواج", "مواريث أو وصية", "إثبات أو إجراءات", "أخرى"];

const otpHash = (code: string, who: string) => crypto.createHash("sha256").update(`${who}|${code}`).digest("hex");

export async function POST(request: Request) {
  if (!experimentEnabled() || !(await gateOpen())) return NextResponse.json({ ok: false }, { status: 404 });
  if (!whatsappConfigured() || !livekitConfigured()) {
    return NextResponse.json({ ok: false, error: "الخدمة غير مهيّأة بعد (واتساب أو LiveKit)." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: unknown;
    phone?: unknown;
    reason?: unknown;
    code?: unknown;
  };
  const phone = normalizeSaudiMobile(body.phone);
  if (!phone) return NextResponse.json({ ok: false, error: "اكتب رقم جوال سعودي صحيح." }, { status: 400 });
  if (!numberAllowed(phone)) {
    return NextResponse.json({ ok: false, error: "هذا الرقم غير مضاف لقائمة التجربة." }, { status: 403 });
  }

  const who = phoneHash(phone);
  const ip = clientKey(request);

  if (body.action === "request") {
    const perNumber = await checkRateLimit(`exp:cb:num:${who}`, 3, 86_400);
    const perIp = await checkRateLimit(`exp:cb:ip:${ip}`, 5, 86_400);
    if (!perNumber.allowed || !perIp.allowed) {
      return NextResponse.json({ ok: false, error: "وصلت الحد اليومي لطلبات الاتصال." }, { status: 429 });
    }
    const reason = REASONS.includes(String(body.reason)) ? String(body.reason) : "أخرى";
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    await tempSet(`exp:otp:${who}`, JSON.stringify({ hash: otpHash(code, who), reason, tries: 0 }), OTP_TTL);
    const sent = await sendOtp(phone.slice(1), code);
    techLog("callback", sent ? "otp-sent" : "otp-send-failed");
    if (!sent) return NextResponse.json({ ok: false, error: "تعذّر إرسال رمز التحقق عبر واتساب." }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "verify") {
    const attempts = await checkRateLimit(`exp:cb:try:${who}`, 6, OTP_TTL);
    const stored = await tempGet(`exp:otp:${who}`);
    if (!attempts.allowed || !stored) {
      return NextResponse.json({ ok: false, error: "انتهت صلاحية الرمز. اطلب رمزًا جديدًا." }, { status: 400 });
    }
    const record = JSON.parse(stored) as { hash: string; reason: string };
    const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
    if (code.length !== 6 || !safeEqual(otpHash(code, who), record.hash)) {
      return NextResponse.json({ ok: false, error: "الرمز غير صحيح." }, { status: 400 });
    }
    await tempDel(`exp:otp:${who}`); // الرمز يُستعمل مرة واحدة

    try {
      const room = `cb-${crypto.randomBytes(6).toString("hex")}`;
      await dispatchAgent(room, { mode: "callback", phone, reason: record.reason });
      techLog("callback", "call-dispatched");
      return NextResponse.json({ ok: true });
    } catch {
      techLog("callback", "dispatch-failed");
      return NextResponse.json({ ok: false, error: "تعذّر بدء الاتصال الآن." }, { status: 502 });
    }
  }

  return NextResponse.json({ ok: false }, { status: 400 });
}
