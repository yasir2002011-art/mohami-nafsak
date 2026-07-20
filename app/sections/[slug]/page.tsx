import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Icon, { ACCENT_CLASSES } from "@/components/Icon";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import AdSlot from "@/components/AdSlot";
import { getAll } from "@/lib/store";

export async function generateStaticParams() {
  const sections = await getAll("sections");
  return sections.map((section) => ({ slug: section.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sections = await getAll("sections");
  const section = sections.find((item) => item.slug === slug);
  return {
    title: section?.name ?? "قسم",
    description: section?.description,
  };
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [sections, tools, links] = await Promise.all([
    getAll("sections"),
    getAll("tools"),
    getAll("links"),
  ]);

  const section = sections.find((item) => item.slug === slug && item.published);
  if (!section) notFound();

  const accent = ACCENT_CLASSES[section.accent];
  const sectionTools = tools
    .filter((tool) => tool.sectionId === section.id && tool.published)
    .sort((a, b) => a.order - b.order);
  const upcoming = tools.filter((tool) => tool.sectionId === section.id && !tool.published);
  const sectionLinks = links.filter((link) => link.sectionId === section.id && link.active);

  return (
    <>
      <SiteHeader />

      <header className="relative overflow-hidden border-b border-slate-200">
        <div className="absolute inset-0 -z-10" style={{ background: "var(--gradient-hero)" }} />
        <div className="mx-auto max-w-5xl px-4 py-14">
          <Link href="/" className="text-sm font-bold text-slate-500 hover:text-brand-700">
            الرئيسية ←
          </Link>

          <div className="mt-5 flex items-start gap-4">
            <span
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br ${accent.grad} text-white shadow-lg`}
            >
              <Icon name={section.icon} className="h-8 w-8" />
            </span>
            <div>
              <h1 className="text-3xl font-black text-slate-900 sm:text-4xl">{section.name}</h1>
              <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-600">
                {section.description}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12">
        <AdSlot placement="section-top" sectionId={section.id} />

        {sectionTools.length === 0 && upcoming.length === 0 && (
          <EmptyState message="هذا القسم قيد التجهيز، وسيُضاف محتواه قريبًا." />
        )}

        {sectionTools.length > 0 && (
          <section>
            <h2 className="text-xl font-extrabold text-slate-900">الأدوات المتاحة</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {sectionTools.map((tool) => (
                <Link
                  key={tool.id}
                  href={`/tools/${tool.slug}`}
                  className="card-soft card-hover group flex items-start gap-4 p-6"
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${accent.bg} ${accent.text}`}
                  >
                    <Icon name={tool.icon} className="h-6 w-6" />
                  </span>
                  <div>
                    <h3 className="font-extrabold text-slate-900">{tool.name}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                      {tool.shortDescription}
                    </p>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-extrabold text-brand-700">
                      ابدأ
                      <Icon name="arrow" className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {upcoming.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-extrabold text-slate-900">قيد الإضافة</h2>
            <p className="mt-1.5 text-sm text-slate-500">
              هذه الأدوات مُعدّة وبانتظار ربطها بمصادرها الرسمية.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {upcoming.map((tool) => (
                <div
                  key={tool.id}
                  className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/50 p-4"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
                    <Icon name={tool.icon} className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-700">{tool.name}</p>
                    <p className="text-xs text-slate-500">{tool.shortDescription}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {sectionLinks.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-extrabold text-slate-900">جهات وخدمات رسمية</h2>
            <div className="mt-5 space-y-3">
              {sectionLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card-soft card-hover flex items-center justify-between gap-4 p-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{link.entityName}</span>
                      <span
                        className={`badge ${
                          link.entityType === "official"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-brand-50 text-brand-700"
                        }`}
                      >
                        {link.entityType === "official" ? "جهة رسمية" : "جهة خاصة"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{link.serviceDescription}</p>
                  </div>
                  <Icon name="arrow" className="h-5 w-5 shrink-0 rotate-180 text-brand-600" />
                </a>
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-500">
              المنصة ليست مسؤولة عن محتوى المواقع الخارجية أو استمرار عمل روابطها.
            </p>
          </section>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="card-soft flex flex-col items-center gap-3 p-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-slate-500">
        <Icon name="clock" className="h-7 w-7" />
      </span>
      <p className="font-bold text-slate-800">{message}</p>
    </div>
  );
}
