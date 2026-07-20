import type {
  Condition,
  DecisionEngine,
  EngineQuestion,
  EngineResult,
  NextStep,
} from "@/types";

/**
 * مشغّل محرك القرار — منطق خالص بلا واجهة.
 *
 * القاعدة الحاكمة: النتيجة تُحسب من الشجرة المخزّنة فقط.
 * لا يوجد أي منطق قانوني مكتوب داخل مكوّنات الواجهة.
 */

export type AnswerValue = string | string[] | number;
export type Answers = Record<string, AnswerValue>;

/** هل تحقّق شرط ظهور السؤال؟ */
export function evaluateCondition(condition: Condition, answers: Answers): boolean {
  const answer = answers[condition.questionId];

  if (condition.operator === "answered") {
    return answer !== undefined && answer !== "" && !(Array.isArray(answer) && answer.length === 0);
  }

  if (answer === undefined) return false;

  switch (condition.operator) {
    case "equals":
      return String(answer) === String(condition.value);
    case "notEquals":
      return String(answer) !== String(condition.value);
    case "includes":
      return Array.isArray(answer) && answer.map(String).includes(String(condition.value));
    case "gt":
      return Number(answer) > Number(condition.value);
    case "lt":
      return Number(answer) < Number(condition.value);
    default:
      return false;
  }
}

export function isQuestionVisible(question: EngineQuestion, answers: Answers): boolean {
  if (!question.showIf || question.showIf.length === 0) return true;
  return question.showIf.every((condition) => evaluateCondition(condition, answers));
}

/** الخطوة التالية بناءً على إجابة سؤال معيّن */
export function resolveNext(
  question: EngineQuestion,
  answers: Answers,
): NextStep | undefined {
  const answer = answers[question.id];

  if (question.options && answer !== undefined) {
    const selectedIds = Array.isArray(answer) ? answer.map(String) : [String(answer)];
    // في الأسئلة متعددة الاختيار يُعتمد أول خيار يحدّد مسارًا
    for (const id of selectedIds) {
      const option = question.options.find((candidate) => candidate.id === id);
      if (option?.next) return option.next;
    }
  }

  return question.defaultNext;
}

export interface EngineStep {
  kind: "question" | "result" | "incomplete";
  question?: EngineQuestion;
  result?: EngineResult;
  /** عدد الأسئلة المُجابة حتى الآن — لشريط التقدّم */
  answeredCount: number;
  /** تقدير إجمالي خطوات المسار الحالي */
  estimatedTotal: number;
}

/**
 * يمشي في الشجرة من البداية حسب الإجابات الحالية ويعيد الخطوة الحالية.
 * التقييم من الصفر في كل مرة، فلا حالة مخفية ولا مسار مُخزَّن.
 */
export function runEngine(engine: DecisionEngine, answers: Answers): EngineStep {
  const firstQuestion = engine.questions[0];
  if (!firstQuestion) {
    return { kind: "incomplete", answeredCount: 0, estimatedTotal: 0 };
  }

  let current: EngineQuestion | undefined = firstQuestion;
  let answeredCount = 0;
  const visited = new Set<string>();

  while (current) {
    // حماية من الحلقات المفرغة في شجرة معطوبة
    if (visited.has(current.id)) {
      return { kind: "incomplete", answeredCount, estimatedTotal: engine.questions.length };
    }
    visited.add(current.id);

    // سؤال لا تتحقق شروط ظهوره: يُتخطى إلى مساره الافتراضي
    if (!isQuestionVisible(current, answers)) {
      const skipTo = current.defaultNext;
      if (!skipTo) {
        current = nextQuestionInOrder(engine, current.id);
        continue;
      }
      if (skipTo.type === "result") {
        return finishWithResult(engine, skipTo.id, answeredCount);
      }
      current = engine.questions.find((question) => question.id === skipTo.id);
      continue;
    }

    const answer = answers[current.id];
    const unanswered =
      answer === undefined ||
      answer === "" ||
      (Array.isArray(answer) && answer.length === 0);

    if (unanswered) {
      return {
        kind: "question",
        question: current,
        answeredCount,
        estimatedTotal: Math.max(engine.questions.length, answeredCount + 1),
      };
    }

    answeredCount += 1;
    const next = resolveNext(current, answers);

    if (!next) {
      current = nextQuestionInOrder(engine, current.id);
      continue;
    }

    if (next.type === "result") {
      return finishWithResult(engine, next.id, answeredCount);
    }

    current = engine.questions.find((question) => question.id === next.id);
  }

  return { kind: "incomplete", answeredCount, estimatedTotal: engine.questions.length };
}

function nextQuestionInOrder(
  engine: DecisionEngine,
  currentId: string,
): EngineQuestion | undefined {
  const index = engine.questions.findIndex((question) => question.id === currentId);
  return index >= 0 ? engine.questions[index + 1] : undefined;
}

function finishWithResult(
  engine: DecisionEngine,
  resultId: string,
  answeredCount: number,
): EngineStep {
  const result = engine.results.find((candidate) => candidate.id === resultId);
  if (!result) {
    return { kind: "incomplete", answeredCount, estimatedTotal: answeredCount };
  }
  return { kind: "result", result, answeredCount, estimatedTotal: answeredCount };
}

/** الأسئلة التي أُجيب عنها فعلًا في المسار الحالي — لعرضها كخطوات سابقة */
export function answeredTrail(
  engine: DecisionEngine,
  answers: Answers,
): { question: EngineQuestion; label: string }[] {
  const trail: { question: EngineQuestion; label: string }[] = [];
  let current: EngineQuestion | undefined = engine.questions[0];
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);

    if (!isQuestionVisible(current, answers)) {
      const skipTo = current.defaultNext;
      if (!skipTo) {
        current = nextQuestionInOrder(engine, current.id);
        continue;
      }
      if (skipTo.type === "result") break;
      current = engine.questions.find((question) => question.id === skipTo.id);
      continue;
    }

    const answer = answers[current.id];
    if (answer === undefined || answer === "") break;

    trail.push({ question: current, label: describeAnswer(current, answer) });

    const next = resolveNext(current, answers);
    if (!next) {
      current = nextQuestionInOrder(engine, current.id);
      continue;
    }
    if (next.type === "result") break;
    current = engine.questions.find((question) => question.id === next.id);
  }

  return trail;
}

export function describeAnswer(question: EngineQuestion, answer: AnswerValue): string {
  if (question.options) {
    const ids = Array.isArray(answer) ? answer.map(String) : [String(answer)];
    const labels = ids
      .map((id) => question.options?.find((option) => option.id === id)?.label)
      .filter(Boolean);
    if (labels.length > 0) return labels.join("، ");
  }
  return Array.isArray(answer) ? answer.join("، ") : String(answer);
}

/** المصادر النظامية المرتبطة بنتيجة معيّنة */
export function sourcesForResult(engine: DecisionEngine, result: EngineResult) {
  return result.sourceIds
    .map((id) => engine.sources.find((source) => source.id === id))
    .filter((source): source is NonNullable<typeof source> => Boolean(source));
}

/** فحص سلامة الشجرة — يُستخدم في لوحة الإدارة قبل النشر */
export interface EngineIssue {
  severity: "error" | "warning";
  message: string;
}

export function validateEngine(engine: DecisionEngine): EngineIssue[] {
  const issues: EngineIssue[] = [];
  const questionIds = new Set(engine.questions.map((question) => question.id));
  const resultIds = new Set(engine.results.map((result) => result.id));
  const sourceIds = new Set(engine.sources.map((source) => source.id));

  if (engine.questions.length === 0) {
    issues.push({ severity: "error", message: "المحرك لا يحتوي على أي سؤال." });
  }
  if (engine.results.length === 0) {
    issues.push({ severity: "error", message: "المحرك لا يحتوي على أي نتيجة." });
  }

  const checkNext = (next: NextStep | undefined, where: string) => {
    if (!next) return;
    if (next.type === "question" && !questionIds.has(next.id)) {
      issues.push({ severity: "error", message: `${where}: يشير إلى سؤال غير موجود (${next.id}).` });
    }
    if (next.type === "result" && !resultIds.has(next.id)) {
      issues.push({ severity: "error", message: `${where}: يشير إلى نتيجة غير موجودة (${next.id}).` });
    }
  };

  for (const question of engine.questions) {
    checkNext(question.defaultNext, `السؤال «${question.text}»`);
    for (const option of question.options ?? []) {
      checkNext(option.next, `الخيار «${option.label}»`);
    }
    for (const condition of question.showIf ?? []) {
      if (!questionIds.has(condition.questionId)) {
        issues.push({
          severity: "error",
          message: `السؤال «${question.text}»: شرط ظهوره يعتمد على سؤال غير موجود.`,
        });
      }
    }
    if (!question.defaultNext && !question.options?.some((option) => option.next)) {
      issues.push({
        severity: "warning",
        message: `السؤال «${question.text}»: لا يحدد أي مسار تالٍ.`,
      });
    }
  }

  // نتائج لا يمكن الوصول إليها من أي فرع
  const reachable = new Set<string>();
  for (const question of engine.questions) {
    if (question.defaultNext?.type === "result") reachable.add(question.defaultNext.id);
    for (const option of question.options ?? []) {
      if (option.next?.type === "result") reachable.add(option.next.id);
    }
  }
  for (const result of engine.results) {
    if (!reachable.has(result.id)) {
      issues.push({
        severity: "warning",
        message: `النتيجة «${result.title}» غير قابلة للوصول من أي فرع.`,
      });
    }
    for (const id of result.sourceIds) {
      if (!sourceIds.has(id)) {
        issues.push({
          severity: "error",
          message: `النتيجة «${result.title}»: تشير إلى مصدر غير موجود (${id}).`,
        });
      }
    }
    if (result.sourceIds.length === 0) {
      issues.push({
        severity: "warning",
        message: `النتيجة «${result.title}»: بلا مصدر نظامي.`,
      });
    }
  }

  const unverified = engine.sources.filter((source) => !source.verified);
  if (unverified.length > 0) {
    issues.push({
      severity: "warning",
      message: `${unverified.length} مصدر نظامي لم يُتحقق منه بعد (رقم المادة/النص/الرابط).`,
    });
  }

  if (!engine.lastReviewedAt || !engine.legalReviewer) {
    issues.push({
      severity: "warning",
      message: "لم تُسجَّل مراجعة قانونية (المراجع أو تاريخ المراجعة ناقص).",
    });
  }

  return issues;
}
