import Link from "next/link";
import Logo from "@/components/Logo";
import { getAll } from "@/lib/store";

/** اسم مختصر للقائمة العلوية: «القسم الإجرائي» ← «الإجرائي» */
function shortName(name: string): string {
  return name.replace(/^(ال)?قسم\s+/, "");
}

export default async function SiteHeader() {
  const sections = (await getAll("sections"))
    .filter((section) => section.published)
    .sort((a, b) => a.order - b.order);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-lg no-print">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 text-sm font-bold text-slate-600 lg:flex">
          {sections.map((section) => (
            <Link
              key={section.id}
              href={`/sections/${section.slug}`}
              className="rounded-full px-3 py-2 transition hover:bg-brand-50 hover:text-brand-800"
            >
              {shortName(section.name)}
            </Link>
          ))}
          <Link
            href="/articles"
            className="rounded-full px-3 py-2 transition hover:bg-brand-50 hover:text-brand-800"
          >
            المقالات
          </Link>
        </nav>

        <Link href="/#sections" className="btn-brand !px-5 !py-2 text-sm">
          ابدأ الآن
        </Link>
      </div>
    </header>
  );
}
