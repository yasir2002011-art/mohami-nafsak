import { getAll, saveAll } from "@/lib/store";
import type { AnalyticsEvent, AnalyticsEventType } from "@/types";

/**
 * إحصاءات مجهولة الهوية.
 *
 * لا نسجّل عنوان IP، ولا معرّف مستخدم، ولا أي إجابة من إجابات القضية.
 * نسجّل فقط: نوع الحدث + معرّف الأداة/السؤال/النتيجة + الوقت.
 * الأرقام تظهر في لوحة الإدارة فقط.
 */

export async function track(
  type: AnalyticsEventType,
  payload: Partial<Omit<AnalyticsEvent, "id" | "type" | "createdAt">> = {},
): Promise<void> {
  const events = await getAll("analytics");
  events.push({
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    createdAt: new Date().toISOString(),
    ...payload,
  });
  // سقف للاحتفاظ يمنع تضخم الملف — الأقدم يُحذف أولًا
  await saveAll("analytics", events.slice(-20000));
}

export interface ToolFunnel {
  toolId: string;
  views: number;
  starts: number;
  completions: number;
  /** السؤال الذي ينسحب عنده أكبر عدد من المستخدمين */
  dropOffQuestionId?: string;
  dropOffCount: number;
  completionRate: number;
}

export function buildToolFunnels(events: AnalyticsEvent[]): ToolFunnel[] {
  const byTool = new Map<string, ToolFunnel & { questionHits: Map<string, number> }>();

  const ensure = (toolId: string) => {
    let entry = byTool.get(toolId);
    if (!entry) {
      entry = {
        toolId,
        views: 0,
        starts: 0,
        completions: 0,
        dropOffCount: 0,
        completionRate: 0,
        questionHits: new Map(),
      };
      byTool.set(toolId, entry);
    }
    return entry;
  };

  for (const event of events) {
    if (!event.toolId) continue;
    const entry = ensure(event.toolId);

    if (event.type === "tool_view") entry.views += 1;
    if (event.type === "tool_start") entry.starts += 1;
    if (event.type === "tool_complete") entry.completions += 1;
    if (event.type === "tool_abandon" && event.questionId) {
      entry.questionHits.set(
        event.questionId,
        (entry.questionHits.get(event.questionId) ?? 0) + 1,
      );
    }
  }

  return [...byTool.values()].map((entry) => {
    let dropOffQuestionId: string | undefined;
    let dropOffCount = 0;
    for (const [questionId, count] of entry.questionHits) {
      if (count > dropOffCount) {
        dropOffCount = count;
        dropOffQuestionId = questionId;
      }
    }
    return {
      toolId: entry.toolId,
      views: entry.views,
      starts: entry.starts,
      completions: entry.completions,
      dropOffQuestionId,
      dropOffCount,
      completionRate: entry.starts > 0 ? Math.round((entry.completions / entry.starts) * 100) : 0,
    };
  });
}

export function countBy<T extends string>(
  events: AnalyticsEvent[],
  type: AnalyticsEventType,
  key: (event: AnalyticsEvent) => T | undefined,
): { key: T; count: number }[] {
  const counts = new Map<T, number>();
  for (const event of events) {
    if (event.type !== type) continue;
    const value = key(event);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}
