import type { HijriDate } from "@/lib/hijri";

/* ==========================================================================
   كاشف مستحق الحضانة — الأنواع
   مبني على نظام الأحوال الشخصية، الفصل الثاني (الحضانة): المواد 124–135
   ========================================================================== */

/** ترتيب الحاضنين وفق المادة (127) */
export type CandidateKey = "mother" | "father" | "matGM" | "patGM";

/** إجابة ثلاثية: نعم / لا / غير متأكد */
export type Tri = "yes" | "no" | "unsure";

export interface Child {
  id: string;
  /** الاسم اختياري تمامًا — يمكن الاكتفاء بـ«المحضون الأول» */
  name?: string;
  gender: "m" | "f";
  birth: HijriDate;
  /**
   * المادة (135/3): إذا كان المحضون مجنونًا أو معتوهًا أو مريضًا مرضًا مقعدًا
   * فتستمر الحضانة ولا تنتهي ببلوغ الثامنة عشرة.
   */
  incapacitated: boolean;
}

/**
 * حالة كل مرشّح للحضانة.
 *
 * الحقول تعكس شروط المادتين (125) و(126)، وأسباب السقوط في المادة (128).
 */
export interface CandidateState {
  /** موجود وليس متوفى ولا مفقودًا ولا غائبًا */
  exists: boolean;

  /* شروط المادة (125) — عامة لكل حاضن */
  capacity: Tri; // كمال الأهلية
  care: Tri; // القدرة على تربية المحضون وحفظه ورعايته
  diseaseFree: Tri; // السلامة من الأمراض المعدية الخطيرة

  /* شروط المادة (126) — بحسب كون الحاضن امرأة أو رجلًا */
  /** للمرأة: غير متزوجة برجل أجنبي عن المحضون */
  notMarriedToStranger?: Tri;
  /** للرجل: يقيم عنده من يصلح للحضانة من النساء */
  hasWomen?: Tri;

  /* أسباب السقوط في المادة (128) */
  /** لم ينتقل إلى مكان بقصد الإقامة تفوت به مصلحة المحضون */
  noHarmfulRelocation: Tri;
  /** لم يسكت عن المطالبة بالحضانة مدة تزيد على سنة دون عذر */
  claimedInTime: Tri;

  /** يطالب بالحضانة أو يقبلها */
  claims: Tri;
}

export type CandidateStates = Record<CandidateKey, CandidateState>;

/* ------------------------------- النتيجة ------------------------------- */

export type CandidateStatus = "eligible" | "forfeited" | "absent";

export interface ForfeitReason {
  text: string;
  /** المادة التي بُني عليها السقوط */
  article: string;
  /**
   * هل للمحكمة استثناء هذا السبب لمصلحة المحضون؟
   * (المادة 126/1 في زواج الحاضنة، والمادة 128/3 في السكوت عن المطالبة)
   */
  exceptionPossible: boolean;
}

export interface CandidateEvaluation {
  key: CandidateKey;
  label: string;
  status: CandidateStatus;
  /** أسباب السقوط مع مستندها النظامي */
  forfeitReasons: ForfeitReason[];
  /** إجابات «غير متأكد» تستوجب التحقق */
  uncertainties: string[];
}

export type CustodyOutcomeKind =
  /** تعيّن مستحق للحضانة وفق الترتيب */
  | "assigned"
  /** المادة (135/1): المحضون يختار الإقامة لدى أحد والديه */
  | "childChooses"
  /** المادة (135/2): انتهت الحضانة ببلوغ الثامنة عشرة */
  | "ended"
  /** المادة (131): لم يطلب أحد الحضانة فتُلزم بها الأم أو الأب */
  | "obligated"
  /** المادة (132) أو (127/1): يرجع الأمر إلى تقدير المحكمة */
  | "courtDiscretion";

export interface ChildOutcome {
  childId: string;
  childLabel: string;
  ageYears: number;
  kind: CustodyOutcomeKind;
  winnerKey?: CandidateKey;
  winnerLabel?: string;
  /** بيان سبب النتيجة */
  rationale: string[];
  /** المواد النظامية المستند إليها */
  articles: string[];
  /** من سقط حقه ولماذا */
  evaluations: CandidateEvaluation[];
  /** وجود إجابة «غير متأكد» مؤثرة */
  needsVerification: boolean;
  /** ملاحظات نظامية إضافية تخص هذا المحضون */
  notes: string[];
}

export interface CustodyResult {
  outcomes: ChildOutcome[];
  needsLawyer: boolean;
  todayHijriLabel: string;
}

/* ------------------------- إعدادات الوحدة (بيانات) ------------------------ */

export interface CustodyRuleConfig {
  id: string;
  name: string;
  jurisdiction: string;
  version: string;
  status: "draft" | "review" | "published" | "suspended";
  lastReviewedAt?: string;
  legalReviewer?: string;
  intro: string;
  /** ترتيب الحاضنين — المادة (127/1) */
  order: { key: CandidateKey; label: string; female: boolean }[];
  /** حدود الأعمار بالسنوات الهجرية */
  ageThresholds: {
    /** حد المادة (131): سن العامين عند عدم مطالبة أحد بالحضانة */
    noClaimSplit: number;
    /**
     * حد المادة (33) من اللائحة التنفيذية: إعفاء الأم من شرط عدم الزواج
     * بأجنبي عن المحضون ما لم يتجاوز العامين.
     */
    motherStrangerExemption: number;
    /** المادة (135/1): سن الاختيار */
    childChoice: number;
    /** المادة (135/2): انتهاء الحضانة */
    end: number;
  };
  reasons: Record<string, string>;
  articles: Record<string, string>;
  notes: Record<string, string>;
  changelog: { id: string; version: string; date: string; author: string; summary: string }[];
}
