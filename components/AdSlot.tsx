import { getAll, getSettings } from "@/lib/store";
import type { Ad, AdPlacement } from "@/types";

/**
 * مساحة إعلانية.
 *
 * قواعد ثابتة مطبّقة هنا وليست اختيارية:
 * 1. كل إعلان يحمل علامة «إعلان» أو «محتوى مدفوع» ظاهرة.
 * 2. إعلانات Google لا تظهر إطلاقًا في صفحات النتائج (allowGoogleAds = false).
 * 3. الإعلان معزول بصريًا حتى لا يبدو جزءًا من النتيجة القانونية.
 */

function isLive(ad: Ad): boolean {
  if (!ad.active) return false;
  const now = Date.now();
  if (ad.startDate && new Date(ad.startDate).getTime() > now) return false;
  if (ad.endDate && new Date(ad.endDate).getTime() < now) return false;
  return true;
}

export default async function AdSlot({
  placement,
  toolId,
  sectionId,
  allowGoogleAds = true,
}: {
  placement: AdPlacement;
  toolId?: string;
  sectionId?: string;
  /** يُمرَّر false في صفحات النتائج الحساسة */
  allowGoogleAds?: boolean;
}) {
  const [ads, settings] = await Promise.all([getAll("ads"), getSettings()]);

  const candidates = ads.filter((ad) => {
    if (!isLive(ad)) return false;
    if (ad.placement !== placement) return false;
    if (ad.type === "google" && (!allowGoogleAds || !settings.googleAdsEnabled)) return false;
    if (ad.toolId && ad.toolId !== toolId) return false;
    if (ad.sectionId && ad.sectionId !== sectionId) return false;
    return true;
  });

  const ad = candidates[0];
  if (!ad) return null;

  return (
    <aside
      className="my-6 overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-white/60 no-print"
      aria-label="محتوى إعلاني"
    >
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-1.5">
        <span className="text-[11px] font-extrabold tracking-wide text-slate-600">
          {ad.type === "google" ? "إعلان" : "محتوى مدفوع"}
        </span>
        <span className="text-[11px] text-slate-400">{ad.advertiserName}</span>
      </div>

      <div className="p-4">
        {ad.targetUrl ? (
          <a
            href={`/api/ads/${ad.id}/click`}
            target="_blank"
            rel="noopener noreferrer nofollow sponsored"
            className="block"
          >
            <AdBody ad={ad} />
          </a>
        ) : (
          <AdBody ad={ad} />
        )}
      </div>
    </aside>
  );
}

function AdBody({ ad }: { ad: Ad }) {
  if (ad.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={ad.imageUrl} alt={ad.advertiserName} className="w-full rounded-xl" />;
  }
  return (
    <p className="text-sm font-bold text-slate-800">{ad.advertiserName}</p>
  );
}
