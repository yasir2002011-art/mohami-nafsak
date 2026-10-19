/**
 * يبني مكتبة النصوص النظامية للمحامي الأسري الصوتي من مصدرها الرسمي:
 * البوابة القانونية لوزارة العدل (laws.moj.gov.sa).
 *
 * الناتج: data/legal/corpus.json — مادة بمادة، بنصها كما نُشر، دون أي تلخيص أو
 * إعادة صياغة. لا يُكتب نص نظامي في هذا المشروع من الذاكرة أبدًا.
 *
 * التشغيل (يحتاج اتصالًا بالإنترنت):
 *   node scripts/build-legal-corpus.mjs
 *
 * لإضافة نظام: أضف سطرًا إلى SOURCES بمعرّف الصفحة (Serial) من رابطها في البوابة.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const API = "https://laws-gateway.moj.gov.sa/apis/legislations/v1/statute/get-Statute-gateway-Detail";

/** المصادر: المفتاح يظهر في الاستشهاد، والاسم القصير يُنطق في الصوت */
const SOURCES = [
  { key: "pss", serial: "xt6PShke0baUTC0OdfS9AQ", short: "نظام الأحوال الشخصية" },
  { key: "pss-reg", serial: "41zDyO33ty4qZnGWAhpbNg", short: "اللائحة التنفيذية لنظام الأحوال الشخصية" },
  { key: "evidence", serial: "UbB0wpvasVhoTAgmYKUA7A", short: "نظام الإثبات" },
  { key: "evidence-guide", serial: "1HJz6pOFltJ9oYXPvYkWSw", short: "الأدلة الإجرائية لنظام الإثبات" },
  { key: "pleading", serial: "sSe-gyvwrajdndY5P08WZg", short: "نظام المرافعات الشرعية" },
];

const strip = (html) =>
  String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&rlm;|&lrm;|‏|‎/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

/* ترتيب «المادة السادسة والسبعون بعد المائة» → 176، للتحقق من تسلسل الترقيم فقط */
const norm = (s) => s.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
const UNITS = ["", "الاولي", "الثانيه", "الثالثه", "الرابعه", "الخامسه", "السادسه", "السابعه", "الثامنه", "التاسعه"];
const TENS = { العشرون: 20, الثلاثون: 30, الاربعون: 40, الخمسون: 50, الستون: 60, السبعون: 70, الثمانون: 80, التسعون: 90 };
function ordinalToNumber(label) {
  let s = norm(label.replace(/^المادة\s*/, ""));
  let hundreds = 0;
  if (/بعد المائتين$/.test(s)) {
    hundreds = 200;
    s = s.replace(/\s*بعد المائتين$/, "");
  } else if (/بعد المائه$/.test(s)) {
    hundreds = 100;
    s = s.replace(/\s*بعد المائه$/, "");
  } else if (s === "المائه") return 100;
  else if (s === "المائتان" || s === "المائتين") return 200;
  if (s === "العاشره" || s === "العاشر") return hundreds + 10;
  const teen = s.match(/^(\S+) عشر(?:ه)?$/);
  if (teen) {
    const u = UNITS.indexOf(teen[1].replace(/^الحاديه$/, "الاولي").replace(/^الحادي$/, "الاولي"));
    const alt = ["", "الحاديه", "الثانيه", "الثالثه", "الرابعه", "الخامسه", "السادسه", "السابعه", "الثامنه", "التاسعه"].indexOf(teen[1]);
    const idx = alt > 0 ? alt : u;
    if (idx > 0) return hundreds + 10 + idx;
  }
  if (TENS[s]) return hundreds + TENS[s];
  const both = s.match(/^(\S+) و?(ال\S+)$/);
  if (both) {
    const unitWord = both[1].replace(/^الحاديه$/, "الاولي");
    const u = UNITS.indexOf(unitWord);
    const t = TENS[both[2].replace(/^وال/, "ال")];
    if (u > 0 && t) return hundreds + t + u;
  }
  const u = UNITS.indexOf(s.replace(/^الحاديه$/, "الاولي"));
  if (u > 0) return hundreds + u;
  return null;
}

async function fetchStatute(serial) {
  const response = await fetch(`${API}?Serial=${serial}&identityNumber=`, {
    headers: { "User-Agent": "Mozilla/5.0", Origin: "https://laws.moj.gov.sa", Referer: "https://laws.moj.gov.sa/" },
  });
  if (!response.ok) throw new Error(`${serial}: HTTP ${response.status}`);
  const data = await response.json();
  if (!data?.success || !data.model) throw new Error(`${serial}: لا نموذج في الرد`);
  return data.model;
}

const sources = {};
const articles = [];
let warnings = 0;

for (const source of SOURCES) {
  const model = await fetchStatute(source.serial);
  sources[source.key] = {
    name: model.name,
    short: source.short,
    status: model.legalStatueName,
    issuedHijri: String(model.issuanceDate ?? "").slice(0, 10),
    instrument: model.issuanceDepartmentTool ?? "",
    url: `https://laws.moj.gov.sa/ar/legislation/${source.serial}`,
  };

  let index = 0;
  (function walk(nodes, trail) {
    for (const node of nodes ?? []) {
      if (node.type === 1 && node.text) {
        index += 1;
        let label = String(node.sequence ?? "").trim();
        const bis = /مكرر/.test(label);
        let parsed = ordinalToNumber(label.replace(/s*-?مكرر-?s*$/, ""));
        // خطأ طباعي في المصدر: «الثانية والثلاثون» في موضع 132 والصواب «بعد المائة»
        if (parsed !== null && parsed + 100 === index && !/بعد/.test(label)) {
          label = `${label} بعد المائة`;
          parsed += 100;
          console.log(`  ~ ${source.key}: صُحّح عنوان المادة في الترتيب ${index} إلى «${label}» (خطأ طباعي في المصدر)`);
        }
        // «مكرر» يزيح الترتيب التسلسلي بعدها؛ المعتمد رقم المادة المنشور لا ترتيبها
        const offset = articles.filter((a) => a.src === source.key && /مكرر/.test(a.label)).length;
        if (parsed !== null && parsed !== index - offset && !bis) {
          warnings += 1;
          console.log(`  ! ${source.key}: ${label} = ${parsed} لكن ترتيبها ${index}`);
        }
        articles.push({
          id: `${source.key}-${index}`,
          src: source.key,
          n: index,
          no: parsed === null ? String(index) : `${parsed}${bis ? " مكرر" : ""}`,
          label,
          section: trail.length ? trail[trail.length - 1] : "",
          path: trail.join(" › "),
          text: strip(node.text),
        });
      } else if (node.type !== 1) {
        const title = [String(node.sequence ?? "").trim(), String(node.name ?? "").trim()].filter(Boolean);
        // العنوان يُكتب «الحضانة»، لا «الفصل الثاني الحضانة»
        walk(node.items, [...trail, String(node.name ?? "").trim() || title.join(" ")]);
      } else {
        walk(node.items, trail);
      }
    }
  })(model.statuteStructure, []);

  console.log(`${source.key}: ${articles.filter((a) => a.src === source.key).length} مادة — ${model.name}`);
}

const corpus = { generatedAt: new Date().toISOString().slice(0, 10), sources, articles };
await mkdir(path.join(root, "data", "legal"), { recursive: true });
await writeFile(path.join(root, "data", "legal", "corpus.json"), JSON.stringify(corpus), "utf-8");
console.log(`المجموع: ${articles.length} مادة، تحذيرات الترقيم: ${warnings}`);
