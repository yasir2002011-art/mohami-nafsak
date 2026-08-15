import fs from "node:fs/promises";
import path from "node:path";
import type {
  Ad,
  AdminUser,
  Article,
  AuditLogEntry,
  AnalyticsEvent,
  DecisionEngine,
  ErrorReport,
  ExternalLink,
  Lawyer,
  LawyerAssignment,
  Referral,
  Section,
  SiteSettings,
  Tool,
  VideoItem,
} from "@/types";

/**
 * مخزن البيانات.
 *
 * كل الأسئلة والقواعد والنتائج والمصادر النظامية مخزّنة في ملفات JSON
 * داخل مجلد /data، منفصلة تمامًا عن كود الواجهة. يمكن تحديث شجرة القرار
 * أو إنشاء نسخة جديدة منها دون لمس تصميم الموقع.
 *
 * هذه الطبقة هي نقطة الفصل: عند الانتقال إلى قاعدة بيانات حقيقية
 * (Postgres مثلًا) يُعاد كتابة هذا الملف وحده دون تغيير بقية المشروع.
 *
 * ── الوضع السحابي ──
 * إذا ضُبط DATABASE_URL (قاعدة Postgres مثل Neon) تُحفَظ بيانات المحتوى
 * (المحامون، المقالات، الإعلانات، الإحالات، الإحصاءات، الإعدادات…) في
 * القاعدة، فتبقى محفوظة وتُدار من أي جهاز. وإن لم يُضبط، يعمل المخزن على
 * الملفات كما كان تمامًا.
 *
 * منطق الكواشف نفسه (محرّكات القرار في /data/engines ووحدات القواعد في
 * /data/modules) يبقى في الملفات ويُدار عبر النشر — لا يتغيّر هنا.
 */

const DATA_DIR = path.join(process.cwd(), "data");

/** رابط قاعدة البيانات السحابية — يقبل عدة أسماء شائعة على Vercel/Neon */
const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";

/** هل نعمل على قاعدة بيانات سحابية؟ */
export const hasDatabase = Boolean(DATABASE_URL);

/**
 * وضع العرض (قراءة فقط).
 *
 * الاستضافات بلا خادم مثل Vercel نظام ملفاتها للقراءة فقط، والكتابة فيها
 * تفشل أو لا تبقى بعد انتهاء الطلب. فبدل أن تنهار الصفحات بخطأ 500 نكتفي
 * بتجاهل الكتابة بهدوء، ونُظهر للمدير بيانًا واضحًا بأن التعديلات لا تُحفظ.
 *
 * عند تفعيل قاعدة بيانات سحابية (DATABASE_URL) يزول هذا القيد وتُحفظ
 * التعديلات فعلًا من أي جهاز.
 */
export const isReadOnlyStore =
  !hasDatabase &&
  (Boolean(process.env.VERCEL) || process.env.READ_ONLY_DATA === "1");

type Collections = {
  sections: Section;
  tools: Tool;
  lawyers: Lawyer;
  "lawyer-assignments": LawyerAssignment;
  ads: Ad;
  articles: Article;
  videos: VideoItem;
  links: ExternalLink;
  referrals: Referral;
  analytics: AnalyticsEvent;
  "error-reports": ErrorReport;
  "admin-users": AdminUser;
  "audit-log": AuditLogEntry;
};

type CollectionName = keyof Collections;

/* ----------------------- طبقة القاعدة السحابية ----------------------- */

/**
 * نموذج تخزين بسيط ومتين: كل مجموعة تُخزَّن كمصفوفة JSON واحدة في صف واحد
 * (نفس شكل ملف JSON تمامًا)، مفتاحه اسم المجموعة. هذا يطابق سلوك الملفات
 * الحالي بدقّة فلا يتغيّر شيء في بقية المشروع، ويكفي تمامًا لحجم المنصّة
 * (مدير واحد، كتابات غير متزامنة، وسجلّات مسقوفة).
 */

// نوع دالة الاستعلام من مشغّل Neon، بلا استيراد ثابت حتى لا يُحمَّل بلا داعٍ
type SqlClient = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, unknown>[]>;

let sqlClientPromise: Promise<SqlClient> | null = null;

async function getSql(): Promise<SqlClient> {
  if (!sqlClientPromise) {
    sqlClientPromise = (async () => {
      const { neon } = await import("@neondatabase/serverless");
      const sql = neon(DATABASE_URL) as unknown as SqlClient;
      // إنشاء الجدول مرة واحدة إن لم يكن موجودًا (عملية خفيفة وآمنة للتكرار)
      await sql`
        create table if not exists store_blobs (
          key text primary key,
          data jsonb not null,
          updated_at timestamptz not null default now()
        )
      `;
      return sql;
    })();
  }
  return sqlClientPromise;
}

/** قراءة مصفوفة/كائن من القاعدة، مع بذرها من ملف المشروع أول مرة */
async function dbGet<T>(key: string, fallback: T): Promise<T> {
  const sql = await getSql();
  const rows = await sql`select data from store_blobs where key = ${key}`;
  if (rows.length > 0) {
    return rows[0].data as T;
  }
  // لا يوجد صف بعد — نبذر من ملف المشروع (المحتوى الأولي المرفق) مرة واحدة
  const seed = await readFileJson<T>(key, fallback);
  await dbSet(key, seed);
  return seed;
}

async function dbSet(key: string, value: unknown): Promise<void> {
  const sql = await getSql();
  const json = JSON.stringify(value);
  await sql`
    insert into store_blobs (key, data, updated_at)
    values (${key}, ${json}::jsonb, now())
    on conflict (key) do update set data = excluded.data, updated_at = now()
  `;
}

/* ------------------------- طبقة الملفات (بديل) ------------------------- */

async function readFileJson<T>(relativePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, relativePath), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeFileJson(relativePath: string, value: unknown): Promise<void> {
  // في وضع العرض (بلا قاعدة، على استضافة للقراءة فقط) لا نحاول الكتابة أصلًا
  if (isReadOnlyStore) return;

  try {
    const target = path.join(DATA_DIR, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(value, null, 2), "utf-8");
  } catch (error) {
    // نظام ملفات للقراءة فقط — لا نُسقط الصفحة على المستخدم
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EROFS" || code === "EACCES" || code === "EPERM") return;
    throw error;
  }
}

/* ------------------------- قراءة/كتابة موحّدة ------------------------- */

/**
 * تقرأ من القاعدة إن كانت مفعّلة، وإلا من الملف.
 * المفتاح هو نفس مسار الملف (مثل "lawyers.json") ليتطابق البذر مع الملفات.
 */
async function blobGet<T>(relativePath: string, fallback: T): Promise<T> {
  if (hasDatabase) {
    try {
      return await dbGet<T>(relativePath, fallback);
    } catch {
      // إن تعذّر الوصول للقاعدة لا نُسقط الموقع — نرجع لمحتوى الملف المرفق
      return readFileJson<T>(relativePath, fallback);
    }
  }
  return readFileJson<T>(relativePath, fallback);
}

async function blobSet(relativePath: string, value: unknown): Promise<void> {
  if (hasDatabase) {
    await dbSet(relativePath, value);
    return;
  }
  await writeFileJson(relativePath, value);
}

/* ----------------------------- المجموعات ----------------------------- */

export async function getAll<K extends CollectionName>(name: K): Promise<Collections[K][]> {
  return blobGet<Collections[K][]>(`${name}.json`, []);
}

export async function saveAll<K extends CollectionName>(
  name: K,
  items: Collections[K][],
): Promise<void> {
  await blobSet(`${name}.json`, items);
}

export async function getById<K extends CollectionName>(
  name: K,
  id: string,
): Promise<Collections[K] | undefined> {
  const items = await getAll(name);
  return items.find((item) => (item as { id: string }).id === id);
}

export async function upsert<K extends CollectionName>(
  name: K,
  item: Collections[K],
): Promise<void> {
  const items = await getAll(name);
  const id = (item as { id: string }).id;
  const index = items.findIndex((existing) => (existing as { id: string }).id === id);
  if (index >= 0) {
    items[index] = item;
  } else {
    items.push(item);
  }
  await saveAll(name, items);
}

export async function remove<K extends CollectionName>(name: K, id: string): Promise<void> {
  const items = await getAll(name);
  await saveAll(
    name,
    items.filter((item) => (item as { id: string }).id !== id),
  );
}

/* --------------------------- محركات القرار --------------------------- */

/**
 * كل محرك في ملف مستقل داخل /data/engines، ما يجعل استيراده وتصديره
 * ومراجعته وإصداراته أمرًا مستقلًا عن بقية بيانات الموقع.
 *
 * محرّكات القرار هي منطق الكواشف نفسه، فتبقى في الملفات وتُدار عبر النشر،
 * ولا تُنقل إلى القاعدة.
 */
export async function listEngines(): Promise<DecisionEngine[]> {
  try {
    const files = await fs.readdir(path.join(DATA_DIR, "engines"));
    const engines = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map((file) => readFileJson<DecisionEngine | null>(`engines/${file}`, null)),
    );
    return engines.filter((engine): engine is DecisionEngine => engine !== null);
  } catch {
    return [];
  }
}

export async function getEngine(id: string): Promise<DecisionEngine | undefined> {
  const engines = await listEngines();
  return engines.find((engine) => engine.id === id);
}

export async function saveEngine(engine: DecisionEngine): Promise<void> {
  await writeFileJson(`engines/${engine.id}.json`, engine);
}

/**
 * أرشفة الإصدار الحالي قبل الكتابة فوقه، ليبقى الرجوع إلى إصدار سابق ممكنًا.
 */
export async function archiveEngineVersion(engine: DecisionEngine): Promise<void> {
  await writeFileJson(`engine-versions/${engine.id}--v${engine.version}.json`, engine);
}

export async function listEngineVersions(engineId: string): Promise<DecisionEngine[]> {
  try {
    const files = await fs.readdir(path.join(DATA_DIR, "engine-versions"));
    const versions = await Promise.all(
      files
        .filter((file) => file.startsWith(`${engineId}--v`))
        .map((file) => readFileJson<DecisionEngine | null>(`engine-versions/${file}`, null)),
    );
    return versions.filter((engine): engine is DecisionEngine => engine !== null);
  } catch {
    return [];
  }
}

/* --------------------------- الوحدات البرمجية --------------------------- */

/**
 * قواعد الوحدات البرمجية (مثل كاشف مستحق الحضانة).
 * الوحدة لها كود خاص بها، لكن نصوصها وحدودها وأسبابها ومواد استنادها
 * تبقى بيانات قابلة للتعديل من خارج الكود. وهي جزء من منطق الكواشف،
 * فتبقى في الملفات وتُدار عبر النشر.
 */
export async function getModuleConfig<T>(key: string): Promise<T | null> {
  return readFileJson<T | null>(`modules/${key}.json`, null);
}

export async function saveModuleConfig(key: string, config: unknown): Promise<void> {
  await writeFileJson(`modules/${key}.json`, config);
}

/* ------------------------------ الإعدادات ---------------------------- */

const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "محامي نفسك",
  tagline: "افهم موقفك النظامي قبل أن تتخذ قرارك",
  contactEmail: "",
  aiLayerEnabled: false,
  videosEnabled: false,
  googleAdsEnabled: false,
  storeUserAnswers: false,
  updatedAt: new Date(0).toISOString(),
};

export async function getSettings(): Promise<SiteSettings> {
  return blobGet<SiteSettings>("settings.json", DEFAULT_SETTINGS);
}

export async function saveSettings(settings: SiteSettings): Promise<void> {
  await blobSet("settings.json", settings);
}

/* ----------------------------- سجل التعديلات ----------------------------- */

export async function logAudit(entry: Omit<AuditLogEntry, "id" | "createdAt">): Promise<void> {
  const items = await getAll("audit-log");
  items.push({
    ...entry,
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  });
  // الاحتفاظ بآخر 5000 عملية فقط لتفادي تضخم السجل
  await saveAll("audit-log", items.slice(-5000));
}
