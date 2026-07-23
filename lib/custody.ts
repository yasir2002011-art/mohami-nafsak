import { formatHijri, hijriAge, todayHijri } from "@/lib/hijri";
import type {
  CandidateEvaluation,
  CandidateKey,
  CandidateState,
  CandidateStates,
  Child,
  ChildOutcome,
  CustodyResult,
  CustodyRuleConfig,
  ForfeitReason,
  Tri,
} from "@/types/custody";

/**
 * كاشف مستحق الحضانة — منطق خالص بلا واجهة.
 *
 * مبني على نظام الأحوال الشخصية، الفصل الثاني (الحضانة):
 *
 *  - المادة (127/1): الحضانة واجب الوالدين معًا ما دامت الزوجية قائمة، فإن
 *    افترقا فللأم، ثم الأب، ثم أم الأم، ثم أم الأب، ثم تقرر المحكمة.
 *  - المادة (125): شروط الحاضن — كمال الأهلية، القدرة على التربية والحفظ
 *    والرعاية، السلامة من الأمراض المعدية الخطيرة.
 *  - المادة (126): للمرأة ألا تكون متزوجة برجل أجنبي عن المحضون، وللرجل أن
 *    يقيم عنده من يصلح للحضانة من النساء.
 *  - المادة (128): يسقط الحق بتخلّف شروط (125) و(126)، أو الانتقال إلى مكان
 *    تفوت به مصلحة المحضون، أو السكوت عن المطالبة أكثر من سنة دون عذر.
 *  - المادة (131): عند عدم مطالبة أحد — الأم لمن لا يتجاوز العامين، والأب لمن
 *    تجاوزها.
 *  - المادة (132): إذا لم يوجد الوالدان ولم يقبلها مستحق، تختار المحكمة.
 *  - المادة (135): الاختيار عند إتمام الخامسة عشرة، وانتهاء الحضانة بإتمام
 *    الثامنة عشرة، واستمرارها لغير القادر على رعاية نفسه.
 *
 * ملاحظة مهمة: تخلّف أي شرط يُسقط الحق ولا يكتفى بتأخير صاحبه، لأن المادة
 * (128) نصّت على السقوط. غير أن سببين منها يجوز للمحكمة استثناؤهما لمصلحة
 * المحضون: زواج الحاضنة (126/1) والسكوت عن المطالبة (128/3).
 */

const isNo = (value: Tri) => value === "no";
const isUnsure = (value: Tri) => value === "unsure";

/* --------------------------- تقييم مرشّح واحد --------------------------- */

function evaluateCandidate(
  key: CandidateKey,
  state: CandidateState,
  config: CustodyRuleConfig,
  childAge: number,
): CandidateEvaluation {
  const entry = config.order.find((item) => item.key === key);
  const label = entry?.label ?? key;
  const isFemale = entry?.female ?? false;

  if (!state.exists) {
    return {
      key,
      label,
      status: "absent",
      forfeitReasons: [
        {
          text: config.reasons.gone,
          article: config.articles.order,
          exceptionPossible: false,
        },
      ],
      uncertainties: [],
    };
  }

  const forfeitReasons: ForfeitReason[] = [];
  const uncertainties: string[] = [];

  /** يفحص شرطًا ويسجّل السقوط أو عدم اليقين */
  const check = (
    value: Tri | undefined,
    reasonKey: string,
    article: string,
    exceptionPossible = false,
  ) => {
    if (value === undefined) return;
    if (isNo(value)) {
      forfeitReasons.push({
        text: config.reasons[reasonKey],
        article,
        exceptionPossible,
      });
    } else if (isUnsure(value)) {
      uncertainties.push(config.reasons[reasonKey]);
    }
  };

  // شروط المادة (125)
  check(state.capacity, "capacity", config.articles.conditions125);
  check(state.care, "care", config.articles.conditions125);
  check(state.diseaseFree, "disease", config.articles.conditions125);

  // شروط المادة (126) — بحسب كون الحاضن امرأة أو رجلًا
  if (isFemale) {
    /**
     * المادة (33) من اللائحة التنفيذية: إذا لم يتجاوز المحضون سن العامين فحضانته
     * للأم ولو تزوجت من رجل أجنبي عنه.
     *
     * الإعفاء مقصور على الأم وحدها دون الجدتين، وعلى شرط الزواج بأجنبي وحده،
     * لأن اللائحة نصّت على مراعاة المادة (125) فتبقى شروطها لازمة، وكذلك تبقى
     * أسباب السقوط الأخرى في المادة (128) على إعمالها.
     */
    const exemptFromStrangerMarriage =
      key === "mother" && childAge <= config.ageThresholds.motherStrangerExemption;

    if (!exemptFromStrangerMarriage) {
      // المادة (126/1): «ما لم تقتضِ مصلحة المحضون خلاف ذلك»
      check(
        state.notMarriedToStranger,
        "marriedStranger",
        config.articles.conditions126,
        true,
      );
    }
  } else {
    check(state.hasWomen, "noWomen", config.articles.conditions126);
  }

  // أسباب السقوط في المادة (128)
  check(state.noHarmfulRelocation, "harmfulRelocation", config.articles.forfeit);
  // المادة (128/3): «ما لم تقتضِ مصلحة المحضون خلاف ذلك»
  check(state.claimedInTime, "silentYear", config.articles.forfeit, true);

  return {
    key,
    label,
    status: forfeitReasons.length > 0 ? "forfeited" : "eligible",
    forfeitReasons,
    uncertainties,
  };
}

/* ---------------------------- قرار محضون واحد ---------------------------- */

const ORDINALS = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"];

function decideForChild(
  child: Child,
  states: CandidateStates,
  config: CustodyRuleConfig,
  index: number,
  /** أسرة قائمة: زوجية قائمة ومسكن واحد → حضانة مشتركة بلا إعمال للترتيب */
  jointCustody: boolean,
): ChildOutcome {
  const age = hijriAge(child.birth);
  const childLabel = child.name?.trim()
    ? child.name.trim()
    : `المحضون ${ORDINALS[index] ?? index + 1}`;

  const evaluations = config.order.map((entry) =>
    evaluateCandidate(entry.key, states[entry.key], config, age),
  );

  /** هل أُعمل إعفاء المادة (33) من اللائحة فعلًا في هذه الحالة؟ */
  const motherExemptionApplied =
    age <= config.ageThresholds.motherStrangerExemption &&
    states.mother.exists &&
    states.mother.notMarriedToStranger === "no";

  const needsVerification = evaluations.some(
    (evaluation) => evaluation.uncertainties.length > 0,
  );

  const notes: string[] = [];
  const base = {
    childId: child.id,
    childLabel,
    ageYears: age,
    evaluations,
    needsVerification,
    notes,
  };

  /* أسرة قائمة (زوجية + مسكن واحد): الحضانة واجب الوالدين معًا — المادة (127/1) */
  if (jointCustody) {
    return {
      ...base,
      kind: "courtDiscretion",
      rationale: [config.reasons.marriedParents],
      articles: [config.articles.order],
    };
  }

  const eligible = evaluations.filter(
    (evaluation) => evaluation.status === "eligible",
  );

  /* المادة (135/2): انتهاء الحضانة ببلوغ الثامنة عشرة */
  if (age >= config.ageThresholds.end) {
    if (!child.incapacitated) {
      return {
        ...base,
        kind: "ended",
        rationale: [config.reasons.ended],
        articles: [config.articles.ageRules],
      };
    }
    // المادة (135/3): تستمر الحضانة وفق ترتيب المادة (127)
    notes.push(config.reasons.incapacitatedContinues);
  }

  /* المادة (135/1): الاختيار عند إتمام الخامسة عشرة */
  if (
    age >= config.ageThresholds.childChoice &&
    age < config.ageThresholds.end &&
    !child.incapacitated
  ) {
    const parentsAvailable = eligible.filter(
      (evaluation) => evaluation.key === "mother" || evaluation.key === "father",
    );

    if (parentsAvailable.length > 0) {
      notes.push(config.notes.courtMayDiffer);
      return {
        ...base,
        kind: "childChooses",
        rationale: [config.reasons.childChoice],
        articles: [config.articles.ageRules],
      };
    }
  }

  /* المادة (131): لم يطلب الحضانة أحد من مستحقيها */
  const anyClaims = evaluations.some((evaluation) => {
    const state = states[evaluation.key];
    return state.exists && state.claims !== "no";
  });

  if (!anyClaims) {
    const underLimit = age <= config.ageThresholds.noClaimSplit;
    const preference: CandidateKey[] = underLimit
      ? ["mother", "father"]
      : ["father", "mother"];

    const obligated = preference.find((key) => states[key].exists);

    if (obligated) {
      notes.push(config.notes.courtMayDiffer);
      return {
        ...base,
        kind: "obligated",
        winnerKey: obligated,
        winnerLabel: config.order.find((entry) => entry.key === obligated)?.label,
        rationale: [
          underLimit ? config.reasons.noClaimUnderTwo : config.reasons.noClaimOverTwo,
        ],
        articles: [config.articles.noClaim],
      };
    }

    // المادة (132): لم يوجد الوالدان ولم يقبل الحضانة مستحق لها
    return {
      ...base,
      kind: "courtDiscretion",
      rationale: [config.reasons.noParentsNoAcceptor],
      articles: [config.articles.courtChoice],
    };
  }

  /* الترتيب النظامي — المادة (127/1) */
  const claimants = eligible.filter(
    (evaluation) => states[evaluation.key].claims !== "no",
  );

  const winner = claimants[0];

  if (!winner) {
    const exceptionPossible = evaluations.some((evaluation) =>
      evaluation.forfeitReasons.some((reason) => reason.exceptionPossible),
    );

    const rationale = [config.reasons.allForfeited];
    if (exceptionPossible) rationale.push(config.reasons.exceptionNote);

    // إن لم يوجد الوالدان أصلًا فالمستند هو المادة (132)
    const parentsAbsent = !states.mother.exists && !states.father.exists;
    notes.push(config.notes.reapply);

    return {
      ...base,
      kind: "courtDiscretion",
      rationale,
      articles: [
        parentsAbsent ? config.articles.courtChoice : config.articles.forfeit,
        config.articles.order,
      ],
    };
  }

  /* بيان من سقط حقه ممّن هو أولى في الترتيب */
  const rationale: string[] = [];
  const winnerIndex = config.order.findIndex((entry) => entry.key === winner.key);

  for (let i = 0; i < winnerIndex; i += 1) {
    const skipped = evaluations.find((item) => item.key === config.order[i].key);
    if (skipped && skipped.forfeitReasons.length > 0) {
      rationale.push(
        `${skipped.label}: ${skipped.forfeitReasons.map((reason) => reason.text).join(" — ")}`,
      );
    }
  }

  // مطابقة التذكير والتأنيث في وصف المستحق
  const winnerIsFemale =
    config.order.find((entry) => entry.key === winner.key)?.female ?? false;
  rationale.push(
    `${winner.label} ${winnerIsFemale ? config.reasons.orderFirstF : config.reasons.orderFirstM}.`,
  );

  // بيان إعمال إعفاء المادة (33) من اللائحة عند تحققه للأم
  if (winner.key === "mother" && motherExemptionApplied) {
    rationale.push(config.reasons.motherUnderTwoStranger);
    notes.push(config.notes.motherUnderTwo);
  }

  /* ملاحظات إرشادية */
  notes.push(config.notes.courtMayDiffer);
  if (evaluations.some((evaluation) => evaluation.forfeitReasons.length > 0)) {
    notes.push(config.notes.reapply);
  }

  const articles = [
    config.articles.order,
    config.articles.conditions125,
    config.articles.conditions126,
  ];
  if (winnerIndex > 0) articles.push(config.articles.forfeit);
  if (winner.key === "mother" && motherExemptionApplied) {
    articles.push(config.articles.regulation33);
  }

  return {
    ...base,
    kind: "assigned",
    winnerKey: winner.key,
    winnerLabel: winner.label,
    rationale,
    articles,
  };
}

/* ------------------------------ نقطة الدخول ------------------------------ */

export function runCustodyChecker(
  children: Child[],
  states: CandidateStates,
  config: CustodyRuleConfig,
  jointCustody = false,
): CustodyResult {
  const outcomes = children.map((child, index) =>
    decideForChild(child, states, config, index, jointCustody),
  );

  return {
    outcomes,
    needsLawyer: outcomes.some((outcome) => outcome.needsVerification),
    todayHijriLabel: formatHijri(todayHijri()),
  };
}

/** حالة ابتدائية محايدة لمرشّح */
export function emptyCandidateState(isFemale: boolean): CandidateState {
  return {
    exists: true,
    capacity: "yes",
    care: "yes",
    diseaseFree: "yes",
    notMarriedToStranger: isFemale ? "yes" : undefined,
    hasWomen: isFemale ? undefined : "yes",
    noHarmfulRelocation: "yes",
    claimedInTime: "yes",
    claims: "yes",
  };
}

export function emptyStates(config: CustodyRuleConfig): CandidateStates {
  return config.order.reduce((accumulator, entry) => {
    accumulator[entry.key] = emptyCandidateState(entry.female);
    return accumulator;
  }, {} as CandidateStates);
}
