import fs from "node:fs/promises";
import path from "node:path";

/**
 * مكتبة النصوص النظامية للمحامي الأسري الصوتي + الاسترجاع.
 *
 * النصوص مبنية بـ scripts/build-legal-corpus.mjs من البوابة القانونية لوزارة
 * العدل، مادة بمادة وبنصها المنشور. هذا الملف لا يكتب أي نص نظامي: يختار فقط
 * المواد المتعلقة بسؤال المتصل ليُجيب منها النموذج دون غيرها.
 *
 * الاسترجاع معجمي (BM25 مع تطبيع عربي وتجذيع خفيف) + حِزم موضوعية: سؤال في
 * «الحضانة» يجلب فصل الحضانة كاملًا لا المواد الأقرب لفظًا فقط. اختُير على
 * التضمين الدلالي (embeddings) لأنه لا يحتاج مفتاحًا ولا نداءً إضافيًا لكل
 * سؤال، ويمكن اختباره بحتميّة.
 *
 * ملف بلا أي اعتماد على مسارات المشروع عمدًا ليُختبر مباشرة بـ node.
 */

export interface CorpusSource {
  name: string;
  short: string;
  status: string;
  issuedHijri: string;
  instrument: string;
  url: string;
}

export interface Article {
  id: string;
  src: string;
  n: number;
  /** رقم المادة المنشور (قد يكون «224 مكرر») */
  no: string;
  label: string;
  section: string;
  path: string;
  text: string;
}

interface Corpus {
  generatedAt: string;
  sources: Record<string, CorpusSource>;
  articles: Article[];
}

export interface RetrievedArticle {
  id: string;
  cite: string;
  section: string;
  text: string;
  url: string;
}

/* --------------------------------- التحميل --------------------------------- */

let corpusPromise: Promise<Corpus> | null = null;

export function loadCorpus(): Promise<Corpus> {
  corpusPromise ??= fs
    .readFile(path.join(process.cwd(), "data", "legal", "corpus.json"), "utf-8")
    .then((raw) => JSON.parse(raw) as Corpus)
    .catch((error) => {
      corpusPromise = null;
      throw error;
    });
  return corpusPromise;
}

/* --------------------------------- التطبيع --------------------------------- */

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function normalize(input: string): string {
  return input
    .replace(/[ً-ٰٟـ‌‍‎‏]/g, "")
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^ء-ي0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  (
    "في من الي علي عن مع او ان اذا اذ ما ماذا لا لم لن قد هل كيف لماذا ليش ايش وش شو ويش متي اين وين " +
    "هذا هذه ذلك تلك هو هي هم هن انا انت نحن لي له لها لهم عند كل بعد قبل بين حتي ثم كان يكون تكون كانت " +
    "ابغي ابي ابغا اريد بغيت ودي اعرف اسال سؤال ممكن يمكن لو والله يعني طيب الحين الان بس مره جدا " +
    "عليه عليها عليهم منه منها فيه فيها به بها بهم هنا هناك الذي التي الذين كما غير اي ايه نعم"
  ).split(" "),
);

/**
 * الجموع والمثنّيات الشاذة تُرَدّ إلى مفردها قبل التجذيع، في الاستعلام وفي نص
 * المواد معًا: «البنتان» في المادة و«بنات» في سؤال المتصل يلتقيان عند «بنت».
 */
const IRREGULAR: Record<string, string> = {
  بنات: "بنت", بنتين: "بنت", بنتان: "بنت", بنتي: "بنت",
  اخوان: "اخ", اخوه: "اخ", اخوتي: "اخ", اخوين: "اخ", اخي: "اخ",
  اخوات: "اخت", اخواتي: "اخت", اختين: "اخت", اختان: "اخت",
  ابناء: "ابن", ابنان: "ابن", ابنين: "ابن", ابني: "ابن",
  اولاد: "ولد", عيال: "ولد", عيالي: "ولد", اولادي: "ولد", ولدان: "ولد", ولدين: "ولد",
  اطفال: "طفل", اطفالي: "طفل",
  ازواج: "زوج", زوجات: "زوج", زوجتي: "زوج", زوجي: "زوج",
  امهات: "ام", امي: "ام", ابوي: "اب", ابوه: "اب", ابويه: "اب", ابوين: "اب", ابي: "اب",
  ورثه: "وارث", ورثتي: "وارث", وراث: "وارث",
};

/** اسم قرابة من حرفين يُسمح بنزع «ال» عنه (الأب، الأم، الأخ) */
const SHORT_KIN = new Set(["اب", "ام", "اخ"]);

/** تجذيع خفيف: إزالة أداة التعريف والسوابق واللواحق الشائعة */
export function stem(word: string): string {
  let w = word;
  if (/^[0-9]+$/.test(w)) return w;
  for (const prefix of ["وال", "بال", "كال", "فال", "لل", "ال"]) {
    if (!w.startsWith(prefix)) continue;
    const rest = w.slice(prefix.length);
    if (rest.length >= 3 || SHORT_KIN.has(rest)) w = rest;
    break;
  }
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (w.length > 4 && /^[وفبل]/.test(w) && !/^(ولد|ولي|وصي|وفا|وكال|وقف|وثق|وجب|وجد|وعد|فسخ|فرق|لعان|بين|بيع|بلغ|بنت)/.test(w)) {
    w = w.slice(1);
    if (IRREGULAR[w]) return IRREGULAR[w];
  }
  for (const suffix of ["ات", "ان", "ين", "ون", "ها", "هم", "هن", "كم", "نا", "يه", "ه", "ي", "ا"]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  return w;
}

export function tokenize(input: string): string[] {
  return normalize(input)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t))
    .map(stem)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/* ------------------------------ التوسعة والمواضيع ------------------------------ */

/**
 * الناس يسألون بلهجتهم («بغيت اطلق»، «ما يصرف علينا») والأنظمة تتكلم بلغة أخرى
 * («التطليق»، «النفقة»). لكل موضوع كلمات تدل عليه، ومفردات النظام التي تُضاف
 * إلى الاستعلام، والفصول التي تُجلب كاملة من نظام الأحوال الشخصية.
 *
 * وزن الكلمة الدالة: عادية = 2 (تكفي وحدها)، «~كلمة» = 1 (ضعيفة)، «^كلمة» = 0.5
 * (قرابة: «زوج» و«بنت» ترد في كل قضية أسرية فلا تفعّل موضوعًا إلا مجتمعةً)، «=كلمة» = مطابقة
 * تامة بلا تصريف (لأن «وصي» و«وصية» يتشابهان بعد التجذيع). الموضوع يتفعّل من
 * مجموع 2 فأكثر، والأعلى مجموعًا هو الموضوع الرئيس ويأخذ دفعة أكبر.
 */
interface Topic {
  name: string;
  triggers: string[];
  add: string[];
  sections: string[];
}

const TOPICS: Topic[] = [
  {
    name: "الطلاق",
    triggers: ["طلاق", "طلق", "اطلق", "تطليق", "مطلق", "طلقه", "طلقني", "رجعه", "مراجعه", "طالق", "طلقها"],
    add: ["طلاق", "تطليق", "رجعه", "بينونه", "توثيق"],
    sections: ["الطلاق", "أحكام عامة للفرقة"],
  },
  {
    name: "الخلع",
    triggers: ["خلع", "اخلع", "تخلع", "تخالع", "افتدي", "خالعني"],
    add: ["خلع", "عوض", "مهر"],
    sections: ["الخلع"],
  },
  {
    name: "الفسخ",
    triggers: ["فسخ", "تفريق", "هجر", "اعسار", "عنين", "ضرر", "اضرار", "يضربني", "ضربني", "يضرب", "يهددني", "يعنفني", "عنف", "~غيبه", "~عيب", "~شقاق"],
    add: ["فسخ", "ضرر", "تفريق"],
    sections: ["فسخ عقد الزواج"],
  },
  {
    name: "العدة",
    triggers: ["عده", "عدتها", "اعتداد", "معتده", "ارمله", "~وفاه", "~حداد"],
    add: ["عده", "اعتداد"],
    sections: ["العدة"],
  },
  {
    name: "الحضانة",
    triggers: ["حضانه", "حضن", "حاضن", "حاضنه", "محضون", "زياره", "رؤيه", "استضافه", "~طفل", "~ولد", "~سفر", "~انتقال", "~تسليم", "~يمنعني", "~اشوف", "~اشوفها", "~اشوفهم", "~يشوف", "^بنت", "^ابن"],
    add: ["حضانه", "محضون", "حاضن", "زياره", "رؤيه", "استضافه", "مصلحه"],
    sections: ["الحضانة"],
  },
  {
    name: "النفقة",
    triggers: ["نفقه", "نفقتي", "نفقتهم", "مصروف", "ينفق", "يصرف", "انفاق", "مصاريف", "كسوه", "اعاله", "~سكن", "~صندوق"],
    add: ["نفقه", "انفاق", "سكن", "كسوه", "زوجه", "ولد", "اقارب"],
    sections: ["النفقة"],
  },
  {
    name: "النسب",
    triggers: ["نسب", "لعان", "بصمه", "وراثيه", "~ينكر", "~نفي", "~نكران", "~تحليل", "~ابوه", "~فراش"],
    add: ["نسب", "فراش", "اقرار", "لعان", "خبره", "بصمه"],
    sections: ["النسب", "ميراث المفقود والحمل ومنفي النسب"],
  },
  {
    name: "المهر",
    triggers: ["مهر", "صداق", "دوطه", "~قائمه", "~شبكه", "~ذهب"],
    add: ["مهر", "صداق", "قبض"],
    sections: ["حقوق الزوجين"],
  },
  {
    name: "الزواج",
    triggers: ["زواج", "تزوج", "تزوجت", "اتزوج", "يتزوج", "تتزوج", "تزوجها", "عقد", "نكاح", "خطبه", "خاطب", "مخطوبه", "تعدد", "محرم", "كفاءه", "~ولي", "~ولايه", "~شهود", "~قاصر", "~اذن"],
    add: ["زواج", "عقد", "ولي", "شهود", "خطبه", "شروط"],
    sections: ["الخطبة", "أحكام عامة للزواج", "أركان عقد الزواج وشروطه", "حقوق الزوجين"],
  },
  {
    name: "الإرث",
    triggers: [
      "ارث", "ورث", "ميراث", "تركه", "وارث", "ورثه", "ترث", "يرث", "ورثت", "توريث", "حجب", "عصبه", "فروض", "عول",
      "ذوي ارحام", "تخارج", "موروث", "مورث", "ورثتي", "~توفي", "~توفيت", "~مات", "~ماتت", "~خلف", "~خلفت", "~متوفي", "~توفى", "^اخ", "^اخت", "^بنت", "^ابن", "^زوج", "^جد", "^جده", "^اب", "^ام",
      "~نصيب", "~حصه", "~سهم", "~ثلث", "~ربع", "~ثمن", "~سدس", "~نصف",
    ],
    add: ["ارث", "تركه", "وارث", "فرض", "نصيب", "حجب", "تعصيب", "ورثه"],
    sections: [
      "أحكام عامة للتركة والإرث",
      "ميراث أصحاب الفروض",
      "الحجب والتعصيب والعول والرد",
      "ميراث ذوي الأرحام",
      "ميراث المفقود والحمل ومنفي النسب",
      "التخارج في التركة",
    ],
  },
  {
    name: "الوصية",
    triggers: ["وصيه", "=اوصي", "=اوصت", "=اوصيت", "موصي", "وصيتي", "~ثلث"],
    add: ["وصيه", "موصي", "ثلث", "ورثه"],
    sections: ["أحكام عامة للوصية", "أركان الوصية وشروطها", "مبطلات الوصية"],
  },
  {
    name: "الوصاية",
    triggers: ["=وصي", "وصايه", "سفيه", "مفقود", "غائب", "حجر", "~قاصر", "~غياب", "~ولايه"],
    add: ["وصي", "ولي", "قاصر", "غائب", "مفقود", "مال"],
    sections: [
      "أحكام عامة للوصاية والولاية",
      "الوصي",
      "الولي المعين من المحكمة",
      "تصرفات الوصي والولي المعين من المحكمة",
      "الغائب والمفقود",
    ],
  },
  {
    name: "الإثبات",
    triggers: ["اثبات", "اثبت", "دليل", "ادله", "شاهد", "شهاده", "بينه", "يمين", "تحليف", "اقرار", "قرينه", "قرائن", "رسائل", "واتساب", "تسجيل", "محادثه", "خبير", "خبره", "الكتروني", "~مستند", "~كتابه", "~شهود", "~ينكر", "~ورقه"],
    add: ["اثبات", "دليل", "شهاده", "اقرار", "يمين", "قرينه", "كتابه", "رقمي"],
    sections: [],
  },
  {
    name: "الدعوى",
    triggers: ["دعوي", "ارفع", "محكمه", "قاضي", "صحيفه", "تبليغ", "اختصاص", "استئناف", "اعتراض", "تظلم", "ناجز", "تنفيذ", "مدعي", "وكاله", "~جلسه", "~مهله", "~موعد", "~حكم", "~حضور", "~صلح"],
    add: ["دعوي", "محكمه", "صحيفه", "تبليغ", "اختصاص", "جلسه", "اعتراض", "استئناف"],
    sections: [],
  },
];

const PREFIXES = ["وال", "بال", "كال", "فال", "لل", "ال", "و", "ب", "ل", "ف"];

function surfaceVariants(token: string): string[] {
  const out = [token];
  for (const prefix of PREFIXES) {
    if (token.startsWith(prefix) && token.length - prefix.length >= 2) out.push(token.slice(prefix.length));
  }
  return out;
}

/** يعيد [موضع الكلمة المطابقة في السؤال، وزنها] أو null. العبارة المركّبة موضعها -1 */
function triggerMatch(raw: string, tokens: string[][], normalizedQuery: string): [number, number] | null {
  const kin = raw.startsWith("^");
  const weak = raw.startsWith("~");
  const exact = raw.startsWith("=");
  const trigger = normalize(raw.replace(/^[~=^]/, ""));
  const weight = kin ? 0.5 : weak ? 1 : 2;
  if (trigger.includes(" ")) return normalizedQuery.includes(trigger) ? [-1, weight] : null;
  const triggerStem = stem(trigger);
  for (let i = 0; i < tokens.length; i += 1) {
    for (const variant of tokens[i]) {
      if (variant === trigger || (!exact && stem(variant) === triggerStem)) return [i, weight];
    }
  }
  return null;
}

interface Detected {
  expansion: string[];
  /** فصل ← دفعة الترتيب (الموضوع الرئيس أكبر) */
  boosts: Map<string, number>;
  topics: string[];
}

function detectTopics(text: string): Detected {
  const normalized = normalize(text);
  const tokens = normalized.split(" ").filter(Boolean).map(surfaceVariants);

  const active: { topic: Topic; score: number }[] = [];
  for (const topic of TOPICS) {
    // كل كلمة في السؤال تُحسب مرة واحدة للموضوع (بأعلى وزن)، فلا تتراكم «زوج» و«زوجة» معًا
    const byToken = new Map<number, number>();
    for (const trigger of topic.triggers) {
      const hit = triggerMatch(trigger, tokens, normalized);
      if (hit) byToken.set(hit[0], Math.max(byToken.get(hit[0]) ?? 0, hit[1]));
    }
    const score = [...byToken.values()].reduce((sum, w) => sum + w, 0);
    if (score >= 2) active.push({ topic, score });
  }
  active.sort((a, b) => b.score - a.score);

  const expansion: string[] = [];
  const boosts = new Map<string, number>();
  active.forEach(({ topic }, position) => {
    expansion.push(...topic.add.map((word) => stem(normalize(word))));
    const boost = position === 0 ? 0.7 : 0.3;
    for (const section of topic.sections) boosts.set(section, Math.max(boosts.get(section) ?? 0, boost));
  });
  return { expansion, boosts, topics: active.map((a) => a.topic.name) };
}

/* ----------------------------------- BM25 ----------------------------------- */

interface Index {
  docs: { article: Article; tf: Map<string, number>; length: number }[];
  idf: Map<string, number>;
  avgLength: number;
  corpus: Corpus;
}

let indexPromise: Promise<Index> | null = null;

async function buildIndex(): Promise<Index> {
  const corpus = await loadCorpus();
  const docs = corpus.articles.map((article) => {
    // عنوان الفصل يُحسب مرتين: سؤال في «الحضانة» يقترب من مواد فصلها
    const tokens = [...tokenize(article.text), ...tokenize(article.section), ...tokenize(article.section)];
    const tf = new Map<string, number>();
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
    return { article, tf, length: tokens.length };
  });
  const df = new Map<string, number>();
  for (const doc of docs) for (const term of doc.tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  const idf = new Map<string, number>();
  for (const [term, count] of df) idf.set(term, Math.log(1 + (docs.length - count + 0.5) / (count + 0.5)));
  const avgLength = docs.reduce((sum, doc) => sum + doc.length, 0) / docs.length;
  return { docs, idf, avgLength, corpus };
}

function getIndex(): Promise<Index> {
  indexPromise ??= buildIndex().catch((error) => {
    indexPromise = null;
    throw error;
  });
  return indexPromise;
}

const K1 = 1.4;
const B = 0.75;

/* --------------------------------- الاسترجاع --------------------------------- */

export interface RetrieveOptions {
  /** أقصى عدد مواد */
  maxArticles?: number;
  /** أقصى مجموع حروف النصوص المرسلة للنموذج */
  maxChars?: number;
}

/** أولوية المصدر عند التساوي: النظام أولًا ثم لائحته ثم الإثبات والمرافعات */
const SOURCE_RANK: Record<string, number> = { pss: 0, "pss-reg": 1, evidence: 2, "evidence-guide": 3, pleading: 4 };

/**
 * يختار المواد الأقرب لسؤال المتصل. `history` نصوص أسئلته السابقة: المتابعة
 * القصيرة («وماذا لو سافرت به؟») تُفهم بسياقها فيدخل في الاستعلام بوزن أقل.
 */
/** المواضيع المكتشفة في سؤال — للاختبار والتشخيص */
export function topicsOf(question: string): string[] {
  return detectTopics(question).topics;
}

export async function retrieveArticles(
  question: string,
  history: string[] = [],
  options: RetrieveOptions = {},
): Promise<RetrievedArticle[]> {
  const { maxArticles = 45, maxChars = 22000 } = options;
  const index = await getIndex();

  const weights = new Map<string, number>();
  const bump = (term: string, weight: number) => weights.set(term, Math.max(weights.get(term) ?? 0, weight));

  const mainStems = tokenize(question);
  for (const term of mainStems) bump(term, 1);
  for (const previous of history.slice(-2)) for (const term of tokenize(previous)) bump(term, 0.4);

  const topicsNow = detectTopics(question);
  // موضوع السؤال الحالي أولًا؛ وإن لم يُكتشف فيه موضوع فالمتابعة ترث موضوع السابق
  const topics = topicsNow.topics.length > 0 ? topicsNow : detectTopics(history.slice(-2).join(" "));
  for (const term of topics.expansion) bump(term, 0.35);

  const scored = index.docs.map((doc) => {
    let score = 0;
    for (const [term, weight] of weights) {
      const f = doc.tf.get(term);
      if (!f) continue;
      const idf = index.idf.get(term) ?? 0;
      score += weight * idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * doc.length) / index.avgLength)));
    }
    return { article: doc.article, score };
  });

  const max = Math.max(...scored.map((s) => s.score), 0.0001);
  const packBoost = (a: Article) =>
    a.src === "pss" || a.src === "pss-reg" ? (topics.boosts.get(a.section) ?? 0) : 0;

  // حزمة الفصول: تدخل كلها (مرتبة بصلتها) ثم يُكمَّل بأعلى الدرجات من بقية المصادر
  const ranked = scored
    .map((s) => ({ ...s, final: s.score / max + packBoost(s.article) }))
    .filter((s) => s.score > 0 || packBoost(s.article) > 0)
    .sort((a, b) => b.final - a.final || SOURCE_RANK[a.article.src] - SOURCE_RANK[b.article.src]);

  const picked: Article[] = [];
  let chars = 0;
  for (const entry of ranked) {
    if (picked.length >= maxArticles) break;
    const cost = entry.article.text.length + 80;
    if (chars + cost > maxChars && picked.length > 0) continue;
    picked.push(entry.article);
    chars += cost;
  }

  // العرض بترتيب المصدر ثم رقم المادة ليسهل على النموذج قراءتها
  picked.sort((a, b) => SOURCE_RANK[a.src] - SOURCE_RANK[b.src] || a.n - b.n);
  return picked.map((a) => toRetrieved(a, index.corpus));
}

function toRetrieved(article: Article, corpus: Corpus): RetrievedArticle {
  const source = corpus.sources[article.src];
  return {
    id: article.id,
    cite: `المادة (${article.no}) من ${source.short}`,
    section: article.section,
    text: article.text,
    url: source.url,
  };
}

/** المواد المنشورة بأرقامها لمصدر ما — يُستخدم للتحقق من أرقام المواد في إجابة النموذج */
export async function articleNumbers(ids: string[]): Promise<Set<string>> {
  const corpus = await loadCorpus();
  const byId = new Map(corpus.articles.map((a) => [a.id, a]));
  const out = new Set<string>();
  for (const id of ids) {
    const a = byId.get(id);
    if (a) out.add(a.no.replace(/\s*مكرر$/, ""));
  }
  return out;
}

export async function sourceCatalog(): Promise<Record<string, CorpusSource>> {
  return (await loadCorpus()).sources;
}
