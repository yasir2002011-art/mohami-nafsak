/* ==========================================================================
   محامي نفسك — أنواع البيانات
   كل الكيانات مفصولة عن كود الواجهة، وتُخزَّن في ملفات JSON قابلة
   للاستيراد والتصدير والتعديل من لوحة الإدارة.
   ========================================================================== */

/* ------------------------------- الأقسام ------------------------------- */

export interface Section {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  /** لون الهوية للقسم: rose | violet | coral | mint | sky | amber */
  accent: AccentColor;
  order: number;
  published: boolean;
}

export type AccentColor = "rose" | "violet" | "coral" | "mint" | "sky" | "amber";

/* -------------------------------- الأدوات ------------------------------- */

export type ToolKind =
  /** أداة تعمل بمحرك قرار داخلي (أسئلة وفروع ونتائج) */
  | "engine"
  /**
   * وحدة برمجية مستقلة لأداة لا تكفيها شجرة الأسئلة الخطية
   * (حسابات، مخرجات متعددة، مصفوفة مرشّحين...) — قواعدها في data/modules
   */
  | "module"
  /** أداة تحوّل المستخدم إلى موقع/خدمة رسمية خارجية */
  | "external"
  /** صفحة أسئلة وأجوبة */
  | "faq";

export interface Tool {
  id: string;
  slug: string;
  sectionId: string;
  name: string;
  shortDescription: string;
  description: string;
  icon: string;
  kind: ToolKind;
  /** معرّف محرك القرار المرتبط (لأدوات kind = engine) */
  engineId?: string;
  /** مفتاح الوحدة البرمجية المرتبطة (لأدوات kind = module) */
  moduleKey?: string;
  /** رابط الجهة الخارجية (لأدوات kind = external) — يُملأ لاحقًا */
  externalUrl?: string;
  /** اسم الجهة صاحبة الرابط الخارجي */
  externalProvider?: string;
  /** أسئلة وأجوبة (لأدوات kind = faq) */
  faq?: FaqItem[];
  order: number;
  published: boolean;
  /** السماح بظهور إعلانات Google داخل هذه الأداة — يُمنع في صفحات النتائج الحساسة */
  allowGoogleAds: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  sourceUrl?: string;
  sourceName?: string;
  lastVerifiedAt?: string;
}

/* --------------------------- محركات القرار ---------------------------- */

export type EngineStatus = "draft" | "review" | "published" | "suspended";

export interface DecisionEngine {
  /** رقم تعريفي ثابت لا يتغير عبر الإصدارات */
  id: string;
  /** اسم الأداة/المحرك */
  name: string;
  /** المجال القانوني */
  legalDomain: string;
  /** النطاق النظامي */
  jurisdiction: string;
  /** رقم إصدار المحرك */
  version: string;
  status: EngineStatus;
  /** تاريخ بدء العمل بالإصدار */
  effectiveFrom: string;
  /** تاريخ انتهاء العمل بالإصدار (فارغ = ساري) */
  effectiveTo?: string;
  /** تاريخ آخر مراجعة قانونية */
  lastReviewedAt?: string;
  /** اسم المراجع القانوني */
  legalReviewer?: string;
  /** ملاحظة تظهر للمستخدم أعلى الأداة */
  intro: string;
  questions: EngineQuestion[];
  results: EngineResult[];
  sources: LegalSource[];
  changelog: ChangelogEntry[];
}

export interface EngineQuestion {
  id: string;
  /** نص السؤال */
  text: string;
  /** شرح إضافي اختياري */
  hint?: string;
  type: "single" | "multi" | "number" | "text" | "date";
  options?: EngineOption[];
  /** شروط ظهور السؤال — يظهر فقط إذا تحققت كلها */
  showIf?: Condition[];
  /** المسار التالي الافتراضي إن لم تحدده الإجابة */
  defaultNext?: NextStep;
  required: boolean;
}

export interface EngineOption {
  id: string;
  label: string;
  /** المسار التالي لهذه الإجابة */
  next?: NextStep;
}

/** المسار التالي: إما سؤال آخر أو نتيجة */
export interface NextStep {
  type: "question" | "result";
  id: string;
}

export interface Condition {
  questionId: string;
  operator: "equals" | "notEquals" | "includes" | "gt" | "lt" | "answered";
  value?: string | number;
}

export interface EngineResult {
  id: string;
  title: string;
  /** ملخص النتيجة بلغة مبسطة */
  summary: string;
  tone: "positive" | "caution" | "warning" | "neutral";
  /** أسباب النتيجة */
  reasons: string[];
  /** الوقائع الناقصة التي قد تغيّر النتيجة */
  missingFacts: string[];
  /** الخطوات العملية المقترحة */
  nextActions: string[];
  /** الحالات التي تستدعي مراجعة محامٍ */
  whenToSeeLawyer: string[];
  /** معرّفات المصادر النظامية المرتبطة بهذه النتيجة */
  sourceIds: string[];
  /** تنبيه عاجل: مهلة اعتراض أو استئناف أو إجراء مستعجل */
  urgentNotice?: string;
}

export interface LegalSource {
  id: string;
  /** اسم النظام أو اللائحة */
  regulation: string;
  /** رقم المادة */
  article?: string;
  /** نص المادة أو ملخصها */
  text?: string;
  /** رابط المصدر الرسمي */
  url?: string;
  /** تاريخ إصدار أو تحديث القاعدة */
  issuedAt?: string;
  /** تاريخ آخر مراجعة قانونية لهذا المصدر */
  lastReviewedAt?: string;
  /** هل تم التحقق من رقم المادة والنص؟ */
  verified: boolean;
}

export interface ChangelogEntry {
  id: string;
  version: string;
  date: string;
  author: string;
  summary: string;
}

/* ------------------------------- المحامون ------------------------------ */

export interface Lawyer {
  id: string;
  name: string;
  photoUrl?: string;
  logoUrl?: string;
  licenseNumber: string;
  licenseExpiryDate?: string;
  city: string;
  region: string;
  specialties: string[];
  whatsapp?: string;
  phone?: string;
  email?: string;
  website?: string;
  bio: string;
  /** حالة التحقق من الترخيص */
  verificationStatus: "verified" | "pending" | "unverified";
  lastVerifiedAt?: string;
  /** فعّال أو موقوف — الإيقاف لا يحذف البيانات */
  active: boolean;
  createdAt: string;
}

/**
 * ربط المحامي بالأدوات والنتائج والمناطق.
 * علاقة متعدد-إلى-متعدد: المحامي الواحد بعدة أدوات، والأداة بعدة محامين.
 */
export interface LawyerAssignment {
  id: string;
  lawyerId: string;
  /** فارغ = كل الأدوات */
  toolId?: string;
  /** فارغ = كل النتائج داخل الأداة */
  resultId?: string;
  /** فارغ = كل المناطق */
  region?: string;
  city?: string;
  /** نوع القضية / التخصص */
  caseType?: string;
  /** مُعلن مدفوع أم ترشيح غير مدفوع — يجب التمييز بوضوح للمستخدم */
  placement: "sponsored" | "recommended";
  /** مدة الظهور الإعلانية */
  startDate?: string;
  endDate?: string;
  /** ترتيب الظهور — الأصغر أولًا */
  priority: number;
  active: boolean;
}

/* ------------------------------- الإعلانات ------------------------------ */

export type AdType = "google" | "lawyer" | "sponsor";
export type AdPlacement =
  | "home-top"
  | "home-mid"
  | "section-top"
  | "tool-intro"
  | "article-inline"
  | "article-sidebar"
  | "footer";

export interface Ad {
  id: string;
  advertiserName: string;
  type: AdType;
  imageUrl?: string;
  html?: string;
  targetUrl?: string;
  placement: AdPlacement;
  /** الأداة أو القسم المرتبط — فارغ = عام */
  toolId?: string;
  sectionId?: string;
  startDate?: string;
  endDate?: string;
  impressions: number;
  clicks: number;
  /** الميزانية أو قيمة الاتفاق */
  budget?: number;
  notes?: string;
  active: boolean;
}

/* ------------------------------- المحتوى ------------------------------- */

export type ContentStatus = "draft" | "review" | "published";

export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  /** المحتوى بصيغة Markdown مبسّط */
  body: string;
  coverImageUrl?: string;
  sectionId?: string;
  toolId?: string;
  author: string;
  legalReviewer?: string;
  status: ContentStatus;
  publishedAt?: string;
  lastReviewedAt?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface VideoItem {
  id: string;
  title: string;
  sectionId?: string;
  toolId?: string;
  presenter: string;
  durationSeconds?: number;
  url: string;
  sourceUrl?: string;
  /** نص مكتوب للفيديو */
  transcript?: string;
  lastReviewedAt?: string;
  /** يُوقف الفيديو إذا تغيّر الإجراء النظامي */
  active: boolean;
}

export interface ExternalLink {
  id: string;
  entityName: string;
  entityType: "official" | "private";
  serviceDescription: string;
  url: string;
  sectionId?: string;
  lastVerifiedAt?: string;
  active: boolean;
}

/* -------------------------- الإحالات والعملاء -------------------------- */

export type ReferralStatus = "new" | "contacted" | "not-suitable" | "converted";

export interface Referral {
  id: string;
  lawyerId: string;
  toolId?: string;
  resultId?: string;
  /** الحد الأدنى من المعلومات فقط — لا تفاصيل قضية */
  topicLabel: string;
  /** هل وافق المستخدم صراحةً على مشاركة ملخص؟ */
  consentGiven: boolean;
  /** الملخص المشارك (فقط عند الموافقة الصريحة) */
  sharedSummary?: string;
  region?: string;
  city?: string;
  status: ReferralStatus;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

/* ------------------------------ الإحصاءات ------------------------------ */

export type AnalyticsEventType =
  | "tool_view"
  | "tool_start"
  | "tool_question"
  | "tool_complete"
  | "tool_abandon"
  | "result_copy"
  | "result_satisfied"
  | "result_unsatisfied"
  | "lawyer_click"
  | "referral_created"
  | "ad_impression"
  | "ad_click"
  | "article_view";

/** حدث مجهول الهوية — لا يحتوي أي بيانات شخصية أو تفاصيل قضية */
export interface AnalyticsEvent {
  id: string;
  type: AnalyticsEventType;
  toolId?: string;
  sectionId?: string;
  questionId?: string;
  resultId?: string;
  lawyerId?: string;
  adId?: string;
  articleId?: string;
  createdAt: string;
}

/* ------------------------- بلاغات الأخطاء -------------------------- */

export interface ErrorReport {
  id: string;
  toolId?: string;
  engineId?: string;
  articleId?: string;
  kind: "legal-update" | "wrong-result" | "broken-link" | "unsatisfied-result" | "other";
  message: string;
  /** بريد اختياري للرد */
  contactEmail?: string;
  status: "new" | "reviewing" | "resolved" | "rejected";
  createdAt: string;
}

/* ------------------------ المستخدمون والصلاحيات ------------------------ */

export type AdminRole = "owner" | "manager" | "legal-editor" | "ads-manager";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  twoFactorEnabled: boolean;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

/** سجل يوضح من أضاف أو عدّل أو نشر أو حذف */
export interface AuditLogEntry {
  id: string;
  actor: string;
  action: "create" | "update" | "publish" | "unpublish" | "delete" | "login" | "restore";
  entity: string;
  entityId: string;
  summary: string;
  createdAt: string;
}

/* ------------------------------ الإعدادات ------------------------------ */

export interface SiteSettings {
  siteName: string;
  tagline: string;
  contactEmail: string;
  /** تشغيل/إيقاف طبقة الذكاء الاصطناعي دون تعطيل محركات القرار */
  aiLayerEnabled: boolean;
  /** تشغيل/إيقاف قسم الفيديوهات في الواجهة العامة */
  videosEnabled: boolean;
  /** تشغيل/إيقاف إعلانات Google في الصفحات المسموح بها */
  googleAdsEnabled: boolean;
  /** حفظ إجابات المستخدم بعد ظهور النتيجة (افتراضيًا: مغلق) */
  storeUserAnswers: boolean;
  updatedAt: string;
}
