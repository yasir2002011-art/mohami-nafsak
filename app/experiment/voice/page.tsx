import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ExperimentPanel from "@/components/experiment/ExperimentPanel";
import { experimentEnabled, gateOpen } from "@/lib/experiment/core";
import { livekitConfigured } from "@/lib/experiment/livekit";
import { whatsappConfigured } from "@/lib/experiment/whatsapp";

/**
 * الصفحة التجريبية المخفية «المحامي الاصطناعي».
 *
 * غير مرتبطة بأي رابط في الموقع، ممنوعة من الفهرسة، وخلف بوّابة بمفتاح.
 * بلا EXPERIMENT_VOICE=1 تعيد 404 كأنها غير موجودة. الأرقام لا تُعرض إلا بعد البوّابة.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "تجربة داخلية",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ExperimentVoicePage() {
  if (!experimentEnabled()) notFound();
  const open = await gateOpen();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="badge bg-amber-100 text-amber-900">تجربة داخلية — غير معلنة</p>
      <h1 className="mt-3 text-2xl font-extrabold text-slate-900">المحامي الاصطناعي</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        مساعد آلي لمنصة «محامي نفسك» يشرح النص النظامي العام والإجراء ويوجّه إلى الكاشف المناسب.
        لا يُصدر رأيًا في واقعة بعينها، وليس محاميًا.
      </p>
      <ExperimentPanel
        open={open}
        info={
          open
            ? {
                whatsappNumber: process.env.EXPERIMENT_WHATSAPP_NUMBER ?? "",
                inboundNumber: process.env.EXPERIMENT_INBOUND_NUMBER ?? "",
                whatsappReady: whatsappConfigured(),
                livekitReady: livekitConfigured(),
              }
            : null
        }
      />
    </main>
  );
}
