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
 */

const DATA_DIR = path.join(process.cwd(), "data");

/**
 * وضع العرض (قراءة فقط).
 *
 * الاستضافات بلا خادم مثل Vercel نظام ملفاتها للقراءة فقط، والكتابة فيها
 * تفشل أو لا تبقى بعد انتهاء الطلب. فبدل أن تنهار الصفحات بخطأ 500 نكتفي
 * بتجاهل الكتابة بهدوء، ونُظهر للمدير بيانًا واضحًا بأن التعديلات لا تُحفظ.
 *
 * عند الانتقال إلى استضافة بقرص دائم أو قاعدة بيانات يزول هذا القيد.
 */
export const isReadOnlyStore =
  Boolean(process.env.VERCEL) || process.env.READ_ONLY_DATA === "1";

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

async function readJson<T>(relativePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, relativePath), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(relativePath: string, value: unknown): Promise<void> {
  // في وضع العرض لا نحاول الكتابة أصلًا
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

/* ----------------------------- المجموعات ----------------------------- */

export async function getAll<K extends CollectionName>(name: K): Promise<Collections[K][]> {
  return readJson<Collections[K][]>(`${name}.json`, []);
}

export async function saveAll<K extends CollectionName>(
  name: K,
  items: Collections[K][],
): Promise<void> {
  await writeJson(`${name}.json`, items);
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
 */
export async function listEngines(): Promise<DecisionEngine[]> {
  try {
    const files = await fs.readdir(path.join(DATA_DIR, "engines"));
    const engines = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map((file) => readJson<DecisionEngine | null>(`engines/${file}`, null)),
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
  await writeJson(`engines/${engine.id}.json`, engine);
}

/**
 * أرشفة الإصدار الحالي قبل الكتابة فوقه، ليبقى الرجوع إلى إصدار سابق ممكنًا.
 */
export async function archiveEngineVersion(engine: DecisionEngine): Promise<void> {
  await writeJson(`engine-versions/${engine.id}--v${engine.version}.json`, engine);
}

export async function listEngineVersions(engineId: string): Promise<DecisionEngine[]> {
  try {
    const files = await fs.readdir(path.join(DATA_DIR, "engine-versions"));
    const versions = await Promise.all(
      files
        .filter((file) => file.startsWith(`${engineId}--v`))
        .map((file) => readJson<DecisionEngine | null>(`engine-versions/${file}`, null)),
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
 * تبقى بيانات قابلة للتعديل من خارج الكود.
 */
export async function getModuleConfig<T>(key: string): Promise<T | null> {
  return readJson<T | null>(`modules/${key}.json`, null);
}

export async function saveModuleConfig(key: string, config: unknown): Promise<void> {
  await writeJson(`modules/${key}.json`, config);
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
  return readJson<SiteSettings>("settings.json", DEFAULT_SETTINGS);
}

export async function saveSettings(settings: SiteSettings): Promise<void> {
  await writeJson("settings.json", settings);
}

/* ----------------------------- سجل التعديلات ----------------------------- */

export async function logAudit(entry: Omit<AuditLogEntry, "id" | "createdAt">): Promise<void> {
  const items = await getAll("audit-log");
  items.push({
    ...entry,
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  });
  // الاحتفاظ بآخر 5000 عملية فقط لتفادي تضخم الملف
  await saveAll("audit-log", items.slice(-5000));
}
