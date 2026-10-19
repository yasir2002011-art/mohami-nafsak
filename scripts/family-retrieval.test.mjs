/**
 * اختبار استرجاع المواد للمحامي الأسري الصوتي.
 *
 * لكل سؤال (بلهجة الناس) المواد التي يجب أن تصل إلى النموذج. إن غابت مادة
 * جوهرية فالنموذج لن يجد مصدرًا للجواب أو سيجيب من غيره — وهذا هو الخطر الذي
 * يحمي منه هذا الاختبار.
 *
 *   node scripts/family-retrieval.test.mjs          (ملخص)
 *   node scripts/family-retrieval.test.mjs -v       (يطبع المواد المختارة)
 */
import { retrieveArticles } from "../lib/family-law.ts";

const verbose = process.argv.includes("-v");
let failed = 0;
let passed = 0;

/** [السؤال، [أسئلة سابقة]، المواد المطلوبة (معرّف المصدر-رقم)، أقصى مجموع حروف متوقع] */
const cases = [
  ["بغيت اطلق زوجتي وش الاجراءات", [], ["pss-77"]],
  ["زوجي ما يصرف علي وعلى عيالي هل اقدر اطالب بنفقه", [], ["pss-44"]],
  ["من يستحق حضانة الاطفال بعد الطلاق", [], ["pss-124", "pss-125"]],
  ["طليقي يمنعني اشوف بنتي", [], ["pss-124"]],
  ["ابغى اخلع زوجي وش يلزمني", [], ["pss-95"]],
  ["تعلق وماله نفقه كم مدة العده بعد الوفاه", [], []],
  ["توفي ابوي وخلف زوجه وثلاث بنات واخوان ما نصيب كل واحد", [], ["pss-210", "pss-215", "pss-229"]],
  ["هل ترث البنت اذا كان معها اخوان", [], []],
  ["ابوي اوصى بثلث ماله لشخص غريب هل تصح الوصيه", [], []],
  ["كيف اثبت ان زوجي تزوج علي بالرسائل", [], []],
  ["هل رسائل الواتساب تعتبر دليل في المحكمه", [], []],
  ["كم مدة رفع الدعوى وين اقدم الدعوى وكيف يتم التبليغ", [], []],
  ["ما هي شروط عقد الزواج وهل لازم ولي", [], ["pss-13"]],
  ["عمري ١٦ هل اقدر اتزوج", [], ["pss-9"]],
  ["ابغى اثبت نسب طفلي وزوجي ينكره", [], []],
  ["وماذا لو سافرت به خارج البلاد", ["من يستحق حضانة ابني بعد الطلاق"], ["pss-124"]],
];

for (const [question, history, required] of cases) {
  const result = await retrieveArticles(question, history);
  const ids = new Set(result.map((r) => r.id));
  const missing = required.filter((id) => !ids.has(id));
  const chars = result.reduce((sum, r) => sum + r.text.length, 0);
  const ok = missing.length === 0 && result.length > 0 && chars <= 22000;
  if (ok) passed += 1;
  else {
    failed += 1;
    console.log(`  ✗ ${question} — ناقص: ${missing.join(", ") || "—"} | ${result.length} مادة، ${chars} حرفًا`);
  }
  if (verbose) {
    console.log(`\n» ${question}${history.length ? `  (سياق: ${history.join(" / ")})` : ""}`);
    for (const r of result) console.log(`   ${r.id.padEnd(16)} ${r.cite.slice(0, 60)} | ${r.section} | ${r.text.slice(0, 50).replace(/\n/g, " ")}`);
  }
}

console.log(`\nالنتيجة: ${passed} ناجح، ${failed} فاشل`);
process.exitCode = failed === 0 ? 0 : 1;
