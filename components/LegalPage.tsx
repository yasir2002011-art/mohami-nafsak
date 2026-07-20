import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import Markdown from "@/components/Markdown";

export default function LegalPage({
  title,
  subtitle,
  body,
}: {
  title: string;
  subtitle: string;
  body: string;
}) {
  return (
    <>
      <SiteHeader />

      <header className="relative overflow-hidden border-b border-slate-200">
        <div className="absolute inset-0 -z-10" style={{ background: "var(--gradient-hero)" }} />
        <div className="mx-auto max-w-3xl px-4 py-14 text-center">
          <h1 className="text-3xl font-black text-slate-900 sm:text-4xl">{title}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-600">
            {subtitle}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12">
        <div className="card-soft p-6 sm:p-9">
          <Markdown source={body} />
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
