/**
 * اختبار خصوصية قياس السلوك.
 *
 * يثبت أن جدول العدّ لا يمكن أن يحتوي معرّف زائر أو جلسة، ولا عنوان IP، ولا
 * نصًا حرًّا، ولا إجابة:
 *   1) اختبار المخطط: كل محاولة لإدخال قيمة ممنوعة تُرفض أو تُسقَط.
 *   2) اختبار حيّ (إن أُعطي عنوان خادم): يرسل أحداثًا صالحة وأخرى خبيثة إلى
 *      /api/track مع كوكي وعنوان IP مزروعين، ثم يفحص كل صف خُزّن فعليًا ويبحث
 *      عن القيم المزروعة في المخزن كله.
 *
 * التشغيل:
 *   node scripts/metrics-privacy.test.mjs                      (المخطط فقط)
 *   node scripts/metrics-privacy.test.mjs http://localhost:3001 (مع الاختبار الحي)
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { canonicalProps, inspectRow, sanitizeMetric } from "../lib/metrics-schema.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const base = process.argv[2];
let failed = 0;
let passed = 0;

function check(name, condition, detail = "") {
  if (condition) passed += 1;
  else {
    failed += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/* القيم المزروعة: لو ظهرت أي منها في المخزن فالاختبار فاشل */
const PLANTED = {
  ip: "203.0.113.77",
  ip6: "2001:db8::dead:beef",
  session: "sess-7f3a9c2e41",
  uuid: "3f2b8c1e-9d4a-4f6b-8e2a-1c5d7f9a0b3e",
  email: "visitor@example.com",
  text: "اسمي فلان وقضيتي حضانة ابني",
  answer: "married-to-stranger",
};

const ctx = {
  tools: new Set(["tool-custody", "tool-contract-type", "tool-fees-calculator"]),
  sections: new Set(["section-criminal"]),
  articles: new Set(["kayfa-tastakhdim-almawqi"]),
  lawyers: new Set(["lawyer-1"]),
  ads: new Set(["ad-1"]),
};

/* --------------------------- 1) اختبار المخطط --------------------------- */
console.log("1) المخطط: رفض القيم الممنوعة");

const mustReject = [
  ["حدث غير معرّف", "page_view", { path: "/" }],
  ["حدث إجابات (غير موجود أصلًا)", "tool_answer", { tool: "tool-custody", question: "q1", option: "yes" }],
  ["IP في خاصية مغلقة", "source_visit", { source: PLANTED.ip }],
  ["نص حر في المصدر", "source_visit", { source: PLANTED.text }],
  ["بريد في رمز الحلقة", "source_visit", { source: "tiktok", episode: PLANTED.email }],
  ["رمز حلقة بصيغة غير مسموحة", "source_visit", { source: "tiktok", episode: "episode12" }],
  ["رمز حلقة أطول من المسموح", "source_visit", { source: "tiktok", episode: "ep123456" }],
  ["أداة غير موجودة في الموقع", "tool_start", { tool: PLANTED.uuid, fresh: "1" }],
  ["معرّف جلسة مكان الأداة", "tool_start", { tool: PLANTED.session, fresh: "1" }],
  ["خطوة صفر", "tool_step", { tool: "tool-custody", step: "0" }],
  ["خطوة خارج المدى", "tool_step", { tool: "tool-custody", step: "41" }],
  ["خطوة بمعرّف سؤال لا برقم", "tool_step", { tool: "tool-custody", step: "q-mother-married" }],
  ["زمن بقيمة حرة", "tool_complete", { tool: "tool-custody", duration_bucket: "73 seconds" }],
  ["تقييم بنص حر", "tool_helpful", { tool: "tool-custody", value: PLANTED.text }],
  ["قالب صفحة بمسار فعلي", "client_error", { page: "/tools/custody?name=x", type: "error" }],
  ["نوع خطأ برسالة الخطأ", "client_error", { page: "/", type: "TypeError: x is undefined" }],
  ["قيمة ليست نصًا (كائن)", "tool_start", { tool: { id: "tool-custody" }, fresh: "1" }],
  ["قيمة ليست نصًا (رقم)", "tool_step", { tool: "tool-custody", step: 3 }],
  ["خاصية مطلوبة ناقصة", "tool_start", { tool: "tool-custody" }],
  ["حدث خادمي مُرسل من المتصفح", "lawyer_contact_click", { lawyer_id: "lawyer-1" }],
  ["بلاغ خطأ من المتصفح مباشرة", "tool_error_report", { tool: "tool-custody", category: "other" }],
];
for (const [name, event, props] of mustReject) {
  check(`يُرفض: ${name}`, sanitizeMetric(event, props, ctx, "client") === null);
}

// حدث صالح مع خصائص إضافية خبيثة: يُقبل الحدث وتُسقَط الزوائد كلها
const stripped = sanitizeMetric(
  "tool_start",
  {
    tool: "tool-custody",
    fresh: "1",
    ip: PLANTED.ip,
    sessionId: PLANTED.session,
    userId: PLANTED.uuid,
    email: PLANTED.email,
    note: PLANTED.text,
    answer: PLANTED.answer,
    question: "q1",
    option: "yes",
  },
  ctx,
  "client",
);
check("حدث صالح بزوائد خبيثة يُقبل", stripped !== null);
check(
  "الزوائد تُسقَط كلها",
  stripped !== null && canonicalProps(stripped.props) === '{"fresh":"1","tool":"tool-custody"}',
  stripped ? canonicalProps(stripped.props) : "",
);

// فاحص الصفوف نفسه يكشف المخالفات لو وُجدت
const bad = [
  { date: "2026-10-03", event: "tool_start", props_json: `{"fresh":"1","tool":"${PLANTED.ip}"}`, count: 1 },
  { date: "2026-10-03", event: "tool_start", props_json: `{"fresh":"1","tool":"x","sid":"${PLANTED.session}"}`, count: 1 },
  { date: "2026-10-03T10:22:31Z", event: "tool_start", props_json: '{"fresh":"1","tool":"x"}', count: 1 },
  { date: "2026-10-03", event: "tool_helpful", props_json: `{"tool":"x","value":"${PLANTED.text}"}`, count: 1 },
  { date: "2026-10-03", event: "tool_start", props_json: '{"fresh":"1","tool":"x"}', count: 1, ip: PLANTED.ip },
];
for (const row of bad) {
  check("الفاحص يكشف صفًّا مخالفًا", inspectRow(row).length > 0, JSON.stringify(row).slice(0, 70));
}
check(
  "الفاحص يقبل صفًّا سليمًا",
  inspectRow({ date: "2026-10-03", event: "tool_start", props_json: '{"fresh":"1","tool":"tool-custody"}', count: 4 }).length === 0,
);

/* --------------------------- 2) الاختبار الحي --------------------------- */
if (base) {
  console.log(`2) حيّ: ${base}/api/track`);

  const send = (event, props, extra = {}) =>
    fetch(`${base}/api/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // كوكي وعنوان مزروعان: يجب ألّا يصل أي منهما إلى المخزن
        Cookie: `sid=${PLANTED.session}; uid=${PLANTED.uuid}`,
        "X-Forwarded-For": PLANTED.ip,
        "X-Real-IP": PLANTED.ip6,
        "User-Agent": `PrivacyTest/1.0 (${PLANTED.email})`,
      },
      body: JSON.stringify({ event, props, ...extra }),
    });

  const valid = [
    ["source_visit", { source: "tiktok", episode: "ep12" }],
    ["tool_start", { tool: "tool-custody", fresh: "0" }],
    ["tool_step", { tool: "tool-custody", step: "1" }],
    ["tool_complete", { tool: "tool-custody", duration_bucket: "1-3m", source: "tiktok", episode: "ep12" }],
    ["tool_helpful", { tool: "tool-custody", value: "yes" }],
    ["client_error", { page: "/tools/[slug]", type: "error" }],
  ];
  for (const [event, props] of valid) {
    const response = await send(event, props);
    check(`يُقبل حدث صالح: ${event}`, response.status === 200, `HTTP ${response.status}`);
  }

  const hostile = [
    ["tool_start", { tool: "tool-custody", fresh: "1", ip: PLANTED.ip, sessionId: PLANTED.session }, 200],
    ["tool_start", { tool: PLANTED.session, fresh: "1" }, 400],
    ["tool_helpful", { tool: "tool-custody", value: PLANTED.text }, 400],
    ["tool_answer", { tool: "tool-custody", question: "q1", option: PLANTED.answer }, 400],
    ["source_visit", { source: "tiktok", episode: PLANTED.email }, 400],
    ["client_error", { page: PLANTED.ip, type: "error" }, 400],
    ["tool_complete", { tool: "tool-custody", duration_bucket: PLANTED.uuid }, 400],
  ];
  for (const [event, props, expected] of hostile) {
    const response = await send(event, props, { visitor: PLANTED.uuid, text: PLANTED.text });
    check(`حمولة خبيثة (${event}) تعيد ${expected}`, response.status === expected, `HTTP ${response.status}`);
  }

  // تزامن: 30 حدثًا في اللحظة نفسها يجب أن تُعدّ كلها دون إتلاف المخزن
  const storeFile = path.join(root, "data", "metrics.json");
  const countOf = async (event, propsJson) => {
    const all = JSON.parse((await readFile(storeFile, "utf-8")).replace(/^﻿/, ""));
    return all.find((row) => row.event === event && row.props_json === propsJson)?.count ?? 0;
  };
  const burstKey = '{"step":"2","tool":"tool-custody"}';
  const before = await countOf("tool_step", burstKey).catch(() => 0);
  const burst = await Promise.all(
    Array.from({ length: 30 }, () => send("tool_step", { tool: "tool-custody", step: "2" })),
  );
  check("30 حدثًا متزامنًا تُقبل كلها", burst.every((response) => response.status === 200));
  const after = await countOf("tool_step", burstKey).catch(() => -1);
  check("العدّاد زاد 30 بالضبط تحت التزامن", after - before === 30, `قبل ${before} بعد ${after}`);

  // سقف العدّاد العام: الاتصال الواحد لا يُحتسب له أكثر من 5 استخدامات للأداة في اليوم
  const capIp = `cap-test-${Date.now()}`;
  const sendFrom = (event, props) =>
    fetch(`${base}/api/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": capIp },
      body: JSON.stringify({ event, props }),
    });
  const freshKey = '{"fresh":"1","tool":"tool-contract-type"}';
  const staleKey = '{"fresh":"0","tool":"tool-contract-type"}';
  const extKey = '{"tool":"tool-inheritance"}';
  const cap = {
    fresh: await countOf("tool_start", freshKey).catch(() => 0),
    stale: await countOf("tool_start", staleKey).catch(() => 0),
    ext: await countOf("ext_tool_click", extKey).catch(() => 0),
  };
  for (let i = 0; i < 8; i += 1) {
    const response = await sendFrom("tool_start", { tool: "tool-contract-type", fresh: "1" });
    check("بدء فوق السقف يُقبل بلا خطأ", response.status === 200, `HTTP ${response.status}`);
  }
  for (let i = 0; i < 7; i += 1) await sendFrom("ext_tool_click", { tool: "tool-inheritance" });
  check(
    "8 استخدامات من اتصال واحد: يُحتسب 5 فقط في العدّاد العام",
    (await countOf("tool_start", freshKey)) - cap.fresh === 5,
  );
  check(
    "الثلاثة الزائدة تبقى في القمع بلا احتساب (fresh = 0)",
    (await countOf("tool_start", staleKey)) - cap.stale === 3,
  );
  check(
    "7 نقرات أداة خارجية من اتصال واحد: يُحتسب 5 فقط",
    (await countOf("ext_tool_click", extKey)) - cap.ext === 5,
  );
  const other = await fetch(`${base}/api/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `${capIp}-b` },
    body: JSON.stringify({ event: "tool_start", props: { tool: "tool-contract-type", fresh: "1" } }),
  });
  check("اتصال آخر لا يتأثر بسقف غيره", other.status === 200);
  check(
    "استخدام الاتصال الآخر يُحتسب",
    (await countOf("tool_start", freshKey)) - cap.fresh === 6,
  );

  // فحص المخزن الفعلي (ملف العدّ المحلي) صفًّا صفًّا
  const storePath = path.join(root, "data", "metrics.json");
  const raw = (await readFile(storePath, "utf-8")).replace(/^﻿/, "");
  const rows = JSON.parse(raw);
  check("المخزن يحتوي صفوفًا بعد الإرسال", Array.isArray(rows) && rows.length > 0);

  let violations = 0;
  for (const row of rows) {
    const problems = inspectRow(row);
    if (problems.length > 0) {
      violations += 1;
      console.log(`  ✗ صف مخالف: ${JSON.stringify(row)} → ${problems.join("؛ ")}`);
    }
  }
  check(`كل الصفوف المخزّنة سليمة (${rows.length} صفًّا)`, violations === 0);

  for (const [label, value] of Object.entries(PLANTED)) {
    check(`القيمة المزروعة «${label}» غير موجودة في المخزن`, !raw.includes(value));
  }
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort().join(",");
  check("أعمدة المخزن: count,date,event,props_json فقط", columns === "count,date,event,props_json", columns);
} else {
  console.log("2) الاختبار الحي تُخطّي (لم يُعطَ عنوان خادم).");
}

console.log(`\nالنتيجة: ${passed} ناجح، ${failed} فاشل`);
process.exitCode = failed === 0 ? 0 : 1;
