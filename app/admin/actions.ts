"use server";

import { revalidatePath } from "next/cache";
import {
  archiveEngineVersion,
  getAll,
  getEngine,
  getModuleConfig,
  getSettings,
  logAudit,
  remove,
  saveAll,
  saveEngine,
  saveModuleConfig,
  saveSettings,
  upsert,
} from "@/lib/store";
import { isAuthenticated } from "@/lib/auth";
import type {
  Ad,
  Article,
  Lawyer,
  LawyerAssignment,
  EngineStatus,
} from "@/types";

/**
 * كل إجراء هنا يتحقق من الجلسة أولًا ثم يسجّل العملية في سجل التعديلات.
 * لا يُستدعى أي منها من الواجهة العامة.
 */
async function guard() {
  if (!(await isAuthenticated())) {
    throw new Error("غير مصرّح");
  }
}

const id = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const bool = (form: FormData, key: string) => form.get(key) === "on";

/* -------------------------------- الأدوات -------------------------------- */

export async function saveToolAction(form: FormData) {
  await guard();
  const tools = await getAll("tools");
  const toolId = text(form, "id");
  const tool = tools.find((item) => item.id === toolId);
  if (!tool) throw new Error("الأداة غير موجودة");

  tool.name = text(form, "name") || tool.name;
  tool.shortDescription = text(form, "shortDescription");
  tool.description = text(form, "description");
  tool.externalUrl = text(form, "externalUrl");
  tool.externalProvider = text(form, "externalProvider");
  tool.published = bool(form, "published");
  tool.allowGoogleAds = bool(form, "allowGoogleAds");
  tool.updatedAt = new Date().toISOString();

  await saveAll("tools", tools);
  await logAudit({
    actor: "owner",
    action: "update",
    entity: "tool",
    entityId: tool.id,
    summary: `تعديل الأداة «${tool.name}»${tool.published ? " (منشورة)" : " (غير منشورة)"}`,
  });

  revalidatePath("/admin/tools");
  revalidatePath("/");
}

/* ---------------------------- محركات القرار ---------------------------- */

export async function updateEngineMetaAction(form: FormData) {
  await guard();
  const engine = await getEngine(text(form, "id"));
  if (!engine) throw new Error("المحرك غير موجود");

  const previousStatus = engine.status;
  const newStatus = text(form, "status") as EngineStatus;
  const newVersion = text(form, "version") || engine.version;

  // أرشفة الإصدار الحالي قبل تغييره حتى يبقى الرجوع ممكنًا
  if (newVersion !== engine.version) {
    await archiveEngineVersion(engine);
    engine.changelog.push({
      id: id("chg"),
      version: newVersion,
      date: new Date().toISOString().slice(0, 10),
      author: text(form, "legalReviewer") || "الإدارة",
      summary: text(form, "changeSummary") || `ترقية الإصدار من ${engine.version} إلى ${newVersion}`,
    });
  }

  engine.version = newVersion;
  engine.status = newStatus;
  engine.legalReviewer = text(form, "legalReviewer");
  engine.lastReviewedAt = text(form, "lastReviewedAt");
  engine.effectiveFrom = text(form, "effectiveFrom") || engine.effectiveFrom;
  engine.effectiveTo = text(form, "effectiveTo") || undefined;
  engine.intro = text(form, "intro") || engine.intro;

  await saveEngine(engine);
  await logAudit({
    actor: "owner",
    action: previousStatus !== newStatus && newStatus === "published" ? "publish" : "update",
    entity: "engine",
    entityId: engine.id,
    summary: `محرك «${engine.name}» — الإصدار ${engine.version}، الحالة ${newStatus}`,
  });

  revalidatePath(`/admin/engines/${engine.id}`);
  revalidatePath("/admin/engines");
}

/** تحديث مصدر نظامي داخل محرك (رقم المادة، النص، الرابط، حالة التحقق) */
export async function updateSourceAction(form: FormData) {
  await guard();
  const engine = await getEngine(text(form, "engineId"));
  if (!engine) throw new Error("المحرك غير موجود");

  const source = engine.sources.find((item) => item.id === text(form, "sourceId"));
  if (!source) throw new Error("المصدر غير موجود");

  source.regulation = text(form, "regulation") || source.regulation;
  source.article = text(form, "article");
  source.text = text(form, "text");
  source.url = text(form, "url");
  source.issuedAt = text(form, "issuedAt");
  source.lastReviewedAt = text(form, "lastReviewedAt");
  source.verified = bool(form, "verified");

  await saveEngine(engine);
  await logAudit({
    actor: "owner",
    action: "update",
    entity: "engine-source",
    entityId: `${engine.id}/${source.id}`,
    summary: `تحديث مصدر «${source.regulation}» في محرك «${engine.name}»`,
  });

  revalidatePath(`/admin/engines/${engine.id}`);
}

/** استيراد محرك كامل من JSON — الأسئلة والفروع والنتائج والمصادر */
export async function importEngineAction(form: FormData) {
  await guard();
  const raw = text(form, "json");
  const parsed = JSON.parse(raw);

  if (!parsed?.id || !Array.isArray(parsed.questions) || !Array.isArray(parsed.results)) {
    throw new Error("ملف المحرك غير صالح: يجب أن يحتوي id و questions و results");
  }

  const existing = await getEngine(parsed.id);
  if (existing) {
    await archiveEngineVersion(existing);
  }

  await saveEngine(parsed);
  await logAudit({
    actor: "owner",
    action: existing ? "update" : "create",
    entity: "engine",
    entityId: parsed.id,
    summary: `${existing ? "استبدال" : "استيراد"} محرك «${parsed.name}» عبر ملف JSON`,
  });

  revalidatePath("/admin/engines");
}

/* --------------------------- الوحدات البرمجية --------------------------- */

/**
 * بيانات حوكمة الوحدة (الإصدار والحالة والمراجعة القانونية).
 * الوحدة لها كود خاص، لكن حوكمتها تُدار من هنا كما تُدار المحركات.
 */
export async function updateModuleMetaAction(form: FormData) {
  await guard();
  const key = text(form, "moduleKey");
  const config = await getModuleConfig<Record<string, unknown>>(key);
  if (!config) throw new Error("الوحدة غير موجودة");

  const previousVersion = String(config.version ?? "");
  const newVersion = text(form, "version") || previousVersion;
  const newStatus = text(form, "status");

  if (newVersion !== previousVersion) {
    const changelog = Array.isArray(config.changelog) ? config.changelog : [];
    changelog.push({
      id: id("chg"),
      version: newVersion,
      date: new Date().toISOString().slice(0, 10),
      author: text(form, "legalReviewer") || "الإدارة",
      summary:
        text(form, "changeSummary") ||
        `ترقية إصدار الوحدة من ${previousVersion} إلى ${newVersion}`,
    });
    config.changelog = changelog;
  }

  config.version = newVersion;
  config.status = newStatus;
  config.legalReviewer = text(form, "legalReviewer");
  config.lastReviewedAt = text(form, "lastReviewedAt");
  config.intro = text(form, "intro") || config.intro;

  await saveModuleConfig(key, config);
  await logAudit({
    actor: "owner",
    action: newStatus === "published" ? "publish" : "update",
    entity: "module",
    entityId: key,
    summary: `وحدة «${config.name}» — الإصدار ${newVersion}، الحالة ${newStatus}`,
  });

  revalidatePath("/admin/engines");
  revalidatePath("/tools/custody");
}

/* -------------------------------- المحامون ------------------------------- */

export async function saveLawyerAction(form: FormData) {
  await guard();
  const lawyerId = text(form, "id") || id("law");
  const existing = await getAll("lawyers").then((items) =>
    items.find((item) => item.id === lawyerId),
  );

  const lawyer: Lawyer = {
    id: lawyerId,
    name: text(form, "name"),
    photoUrl: text(form, "photoUrl"),
    logoUrl: text(form, "logoUrl"),
    licenseNumber: text(form, "licenseNumber"),
    licenseExpiryDate: text(form, "licenseExpiryDate"),
    city: text(form, "city"),
    region: text(form, "region"),
    specialties: text(form, "specialties")
      .split("،")
      .map((item) => item.trim())
      .filter(Boolean),
    whatsapp: text(form, "whatsapp"),
    phone: text(form, "phone"),
    email: text(form, "email"),
    website: text(form, "website"),
    bio: text(form, "bio"),
    verificationStatus:
      (text(form, "verificationStatus") as Lawyer["verificationStatus"]) || "pending",
    lastVerifiedAt: text(form, "lastVerifiedAt"),
    active: bool(form, "active"),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  await upsert("lawyers", lawyer);
  await logAudit({
    actor: "owner",
    action: existing ? "update" : "create",
    entity: "lawyer",
    entityId: lawyer.id,
    summary: `${existing ? "تعديل" : "إضافة"} المحامي «${lawyer.name}»`,
  });

  revalidatePath("/admin/lawyers");
}

/** إيقاف المحامي دون حذف بياناته */
export async function toggleLawyerAction(form: FormData) {
  await guard();
  const lawyers = await getAll("lawyers");
  const lawyer = lawyers.find((item) => item.id === text(form, "id"));
  if (!lawyer) return;

  lawyer.active = !lawyer.active;
  await saveAll("lawyers", lawyers);
  await logAudit({
    actor: "owner",
    action: lawyer.active ? "publish" : "unpublish",
    entity: "lawyer",
    entityId: lawyer.id,
    summary: `${lawyer.active ? "تفعيل" : "إيقاف"} المحامي «${lawyer.name}» (البيانات محفوظة)`,
  });

  revalidatePath("/admin/lawyers");
}

/** ربط محامٍ بأداة/نتيجة/منطقة — علاقة متعدد إلى متعدد */
export async function saveAssignmentAction(form: FormData) {
  await guard();
  const assignment: LawyerAssignment = {
    id: text(form, "id") || id("asg"),
    lawyerId: text(form, "lawyerId"),
    toolId: text(form, "toolId") || undefined,
    resultId: text(form, "resultId") || undefined,
    region: text(form, "region") || undefined,
    city: text(form, "city") || undefined,
    caseType: text(form, "caseType") || undefined,
    placement: (text(form, "placement") as LawyerAssignment["placement"]) || "recommended",
    startDate: text(form, "startDate") || undefined,
    endDate: text(form, "endDate") || undefined,
    priority: Number(text(form, "priority") || 100),
    active: bool(form, "active"),
  };

  await upsert("lawyer-assignments", assignment);
  await logAudit({
    actor: "owner",
    action: "update",
    entity: "lawyer-assignment",
    entityId: assignment.id,
    summary: `ربط محامٍ بأداة (${assignment.placement === "sponsored" ? "معلن" : "ترشيح غير مدفوع"})`,
  });

  revalidatePath("/admin/lawyers");
}

export async function deleteAssignmentAction(form: FormData) {
  await guard();
  const assignmentId = text(form, "id");
  await remove("lawyer-assignments", assignmentId);
  await logAudit({
    actor: "owner",
    action: "delete",
    entity: "lawyer-assignment",
    entityId: assignmentId,
    summary: "حذف ربط محامٍ بأداة",
  });
  revalidatePath("/admin/lawyers");
}

/* -------------------------------- المقالات ------------------------------- */

export async function saveArticleAction(form: FormData) {
  await guard();
  const articleId = text(form, "id") || id("art");
  const articles = await getAll("articles");
  const existing = articles.find((item) => item.id === articleId);
  const status = (text(form, "status") as Article["status"]) || "draft";

  const article: Article = {
    id: articleId,
    slug: text(form, "slug") || articleId,
    title: text(form, "title"),
    excerpt: text(form, "excerpt"),
    body: String(form.get("body") ?? ""),
    coverImageUrl: text(form, "coverImageUrl"),
    sectionId: text(form, "sectionId") || undefined,
    toolId: text(form, "toolId") || undefined,
    author: text(form, "author") || "فريق محامي نفسك",
    legalReviewer: text(form, "legalReviewer"),
    status,
    publishedAt:
      status === "published"
        ? existing?.publishedAt ?? new Date().toISOString()
        : existing?.publishedAt,
    lastReviewedAt: text(form, "lastReviewedAt"),
    tags: text(form, "tags")
      .split("،")
      .map((tag) => tag.trim())
      .filter(Boolean),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await upsert("articles", article);
  await logAudit({
    actor: "owner",
    action: status === "published" ? "publish" : existing ? "update" : "create",
    entity: "article",
    entityId: article.id,
    summary: `${existing ? "تعديل" : "إنشاء"} مقال «${article.title}» — الحالة: ${status}`,
  });

  revalidatePath("/admin/articles");
  revalidatePath("/articles");
}

export async function deleteArticleAction(form: FormData) {
  await guard();
  const articleId = text(form, "id");
  await remove("articles", articleId);
  await logAudit({
    actor: "owner",
    action: "delete",
    entity: "article",
    entityId: articleId,
    summary: "حذف مقال",
  });
  revalidatePath("/admin/articles");
  revalidatePath("/articles");
}

/* ------------------------------- الإعلانات ------------------------------- */

export async function saveAdAction(form: FormData) {
  await guard();
  const adId = text(form, "id") || id("ad");
  const ads = await getAll("ads");
  const existing = ads.find((item) => item.id === adId);

  const ad: Ad = {
    id: adId,
    advertiserName: text(form, "advertiserName"),
    type: (text(form, "type") as Ad["type"]) || "sponsor",
    imageUrl: text(form, "imageUrl"),
    targetUrl: text(form, "targetUrl"),
    placement: (text(form, "placement") as Ad["placement"]) || "home-top",
    toolId: text(form, "toolId") || undefined,
    sectionId: text(form, "sectionId") || undefined,
    startDate: text(form, "startDate") || undefined,
    endDate: text(form, "endDate") || undefined,
    impressions: existing?.impressions ?? 0,
    clicks: existing?.clicks ?? 0,
    budget: Number(text(form, "budget")) || undefined,
    notes: text(form, "notes"),
    active: bool(form, "active"),
  };

  await upsert("ads", ad);
  await logAudit({
    actor: "owner",
    action: existing ? "update" : "create",
    entity: "ad",
    entityId: ad.id,
    summary: `${existing ? "تعديل" : "إضافة"} إعلان «${ad.advertiserName}» في ${ad.placement}`,
  });

  revalidatePath("/admin/ads");
}

export async function deleteAdAction(form: FormData) {
  await guard();
  const adId = text(form, "id");
  await remove("ads", adId);
  await logAudit({
    actor: "owner",
    action: "delete",
    entity: "ad",
    entityId: adId,
    summary: "حذف إعلان",
  });
  revalidatePath("/admin/ads");
}

/* -------------------------------- الإحالات ------------------------------- */

export async function updateReferralStatusAction(form: FormData) {
  await guard();
  const referrals = await getAll("referrals");
  const referral = referrals.find((item) => item.id === text(form, "id"));
  if (!referral) return;

  referral.status = text(form, "status") as typeof referral.status;
  referral.notes = text(form, "notes");
  referral.updatedAt = new Date().toISOString();

  await saveAll("referrals", referrals);
  revalidatePath("/admin/referrals");
}

/* -------------------------------- البلاغات ------------------------------- */

export async function updateReportStatusAction(form: FormData) {
  await guard();
  const reports = await getAll("error-reports");
  const report = reports.find((item) => item.id === text(form, "id"));
  if (!report) return;

  report.status = text(form, "status") as typeof report.status;
  await saveAll("error-reports", reports);
  await logAudit({
    actor: "owner",
    action: "update",
    entity: "error-report",
    entityId: report.id,
    summary: `تحديث حالة بلاغ إلى ${report.status}`,
  });
  revalidatePath("/admin/reports");
}

/* ------------------------------- الإعدادات ------------------------------- */

export async function saveSettingsAction(form: FormData) {
  await guard();
  const settings = await getSettings();

  await saveSettings({
    ...settings,
    siteName: text(form, "siteName") || settings.siteName,
    tagline: text(form, "tagline"),
    contactEmail: text(form, "contactEmail"),
    aiLayerEnabled: bool(form, "aiLayerEnabled"),
    videosEnabled: bool(form, "videosEnabled"),
    googleAdsEnabled: bool(form, "googleAdsEnabled"),
    storeUserAnswers: bool(form, "storeUserAnswers"),
    updatedAt: new Date().toISOString(),
  });

  await logAudit({
    actor: "owner",
    action: "update",
    entity: "settings",
    entityId: "site",
    summary: "تحديث إعدادات المنصة",
  });

  revalidatePath("/admin/settings");
  revalidatePath("/");
}
