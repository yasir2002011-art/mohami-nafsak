import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * تحليل استرشادي لأسباب اعتراض المستخدم على نتيجة كاشف الحضانة.
 *
 * يعمل على الخادم فقط: المفتاح (GEMINI_API_KEY) لا يصل إلى المتصفح إطلاقًا،
 * التزامًا بقاعدة الأمان: «عدم وضع مفاتيح الذكاء الاصطناعي داخل كود الواجهة».
 *
 * الذكاء الاصطناعي هنا لا يقرر انتقال الحضانة ولا يغيّر نتيجة الشجرة، بل
 * يحلّل قوة أسباب الاعتراض ومدى ارتباطها بمصلحة المحضون، ويذكّر بأن القرار
 * النهائي للمحكمة.
 */

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MIN_REASON = 10;

/** نصوص المواد المرجعية — تُقرأ من ملف بيانات منفصل عن الكود */
async function legalReference(): Promise<string> {
  try {
    return await fs.readFile(
      path.join(process.cwd(), "data", "legal", "custody-reference.txt"),
      "utf-8",
    );
  } catch {
    return "";
  }
}

const clip = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const SYSTEM_PROMPT = `أنت مساعد قانوني استرشادي في منصة سعودية اسمها «محامي نفسك».
مهمتك تحليل أسباب اعتراض مستخدم على نتيجة أداة حضانة، بالاستناد إلى نصوص نظام
الأحوال الشخصية ولائحته التنفيذية المرفقة فقط، دون اختراع مواد أو أحكام.

قيود صارمة يجب الالتزام بها حرفيًا:
- لا تقرر أن الحضانة تنتقل حتمًا، ولا تكتب عبارات جازمة مثل «المستحق هو الأب قطعًا»
  أو «تنتقل الحضانة». استخدم صياغات احتمالية مثل: «قد تؤثر هذه الوقائع في تقدير
  المحكمة لمصلحة المحضون إذا ثبتت بأدلة معتبرة».
- المعيار الأعلى هو مصلحة المحضون، والقرار النهائي للمحكمة وحدها.
- لا تعِد بنتيجة ولا تعطِ نسبة نجاح، وإذا كانت المعلومات غير كافية فقُل ذلك صراحة.
- التزم بحالة المرشّحين كما أدخلها المستخدم في الأداة، ولا تفترض خلافها. فإن رشّح
  المستخدم شخصًا أفاد بأنه «غير موجود» أو «سقط حقه»، فنبّه صراحةً إلى أن ترجيحه لا
  يستقيم إلا إن ثبت وجوده وتوافر شروطه، ووجّه المستخدم إلى تصحيح مدخلاته إن لزم.
- اكتب بالعربية الفصحى المبسّطة، وكن موجزًا ومحددًا.

أخرِج التحليل بصيغة Markdown في ست فقرات مرقّمة، كل فقرة تبدأ بعنوانها هكذا:
### 1. ملخص اعتراض المستخدم
### 2. مدى قوة الأسباب من الناحية القانونية
### 3. مدى ارتباط الأسباب بمصلحة المحضون
### 4. الأدلة التي يحتاج المستخدم إلى تجهيزها
### 5. نقاط الضعف أو النقص في الاعتراض
### 6. تنبيه بأن القرار النهائي للمحكمة`;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;

  // بلا مفتاح: تنبيه للمطور فقط، دون تعطيل باقي الموقع
  if (!apiKey) {
    return NextResponse.json({ ok: false, missingKey: true }, { status: 200 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "طلب غير صالح" }, { status: 400 });
  }

  const objectionReason = clip(body.objectionReason, 1500);
  if (objectionReason.length < MIN_REASON) {
    return NextResponse.json(
      { ok: false, error: "سبب الاعتراض قصير جدًا." },
      { status: 400 },
    );
  }

  // الحد الأدنى فقط: لا اسم محضون ولا أي بيان شخصي — حالات مجرّدة
  const childAge = Number(body.childAge);
  const details = {
    resultLabel: clip(body.resultLabel, 120),
    currentCustodian: clip(body.currentCustodian, 60),
    childAge: Number.isFinite(childAge) ? childAge : "غير محدد",
    objectionReason,
    preferredCustodian: clip(body.preferredCustodian, 80),
    benefitsWithAlternative: clip(body.benefitsWithAlternative, 1500),
    benefitsLost: clip(body.benefitsLost, 1500),
    // ملخص حالات المرشّحين كما أدخلها المستخدم في الشجرة (بلا أسماء)
    treeSummary: clip(body.treeSummary, 600),
  };

  const reference = await legalReference();

  const userPrompt = `النصوص النظامية المرجعية:
${reference}

نتيجة أداة الحضانة لهذا المحضون:
- النتيجة: ${details.resultLabel}
- الحاضن الذي انتهت إليه النتيجة: ${details.currentCustodian}
- عمر المحضون: ${details.childAge} سنة هجرية

حالة المرشّحين كما أدخلها المستخدم في الأداة (التزم بها ولا تخالفها):
${details.treeSummary || "لم تُذكر"}

اعتراض المستخدم:
- سبب عدم الاقتناع بالنتيجة: ${details.objectionReason}
- من يراه المستخدم أصلح للحضانة: ${details.preferredCustodian || "لم يُحدَّد"}
- المصالح التي تتحقق للمحضون مع الحاضن البديل: ${details.benefitsWithAlternative || "لم تُذكر"}
- المصالح التي قد تفوت على المحضون إذا بقي مع الحاضن الحالي: ${details.benefitsLost || "لم تُذكر"}

حلّل هذا الاعتراض وفق التعليمات والقيود، وأخرِج الفقرات الست المرقّمة.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 2048,
          topP: 0.9,
          // نماذج 2.5 تستهلك ميزانية الإخراج في «التفكير» الداخلي؛ نوقفه
          // لأن المهمة منظّمة ومحددة، فيبقى الإخراج للفقرات الست كاملة.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          error: `تعذّر الاتصال بخدمة التحليل (${response.status}).`,
          detail: detail.slice(0, 400),
        },
        { status: 502 },
      );
    }

    const data = await response.json();
    const analysis: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text ?? "")
        .join("")
        .trim() ?? "";

    if (!analysis) {
      return NextResponse.json(
        { ok: false, error: "لم تُرجِع خدمة التحليل نصًا." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, analysis });
  } catch {
    return NextResponse.json(
      { ok: false, error: "حدث خطأ أثناء التحليل. حاول مرة أخرى." },
      { status: 500 },
    );
  }
}
