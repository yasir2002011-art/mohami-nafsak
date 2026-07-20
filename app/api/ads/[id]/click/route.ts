import { NextResponse } from "next/server";
import { getAll, saveAll } from "@/lib/store";
import { track } from "@/lib/analytics";

/** تسجيل نقرة إعلان ثم التحويل إلى وجهته */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ads = await getAll("ads");
  const ad = ads.find((item) => item.id === id);

  if (!ad?.targetUrl) {
    return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
  }

  // التحويل إلى روابط http/https فقط — يمنع javascript: و data:
  if (!/^https?:\/\//i.test(ad.targetUrl)) {
    return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
  }

  ad.clicks += 1;
  await saveAll("ads", ads);
  await track("ad_click", { adId: ad.id, toolId: ad.toolId, sectionId: ad.sectionId });

  return NextResponse.redirect(ad.targetUrl);
}
