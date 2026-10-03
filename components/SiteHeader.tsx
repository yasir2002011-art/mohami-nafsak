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
    <>
      {/* شريط علوي زخرفي: 32px بلون الحبر وخط ذهبي أسفله */}
      <div className="top-bar no-print" aria-hidden="true" />

      {/* الرأس: يثبت عند التمرير بخلفية الحبر 95% */}
      <header className="sticky top-0 z-40 bg-brand-900/95 backdrop-blur-lg no-print">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" aria-label="محامي نفسك — الرئيسية">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 text-sm font-semibold text-white/80 lg:flex">
            {sections.map((section) => (
              <Link
                key={section.id}
                href={`/sections/${section.slug}`}
                className="rounded-full px-3 py-2 transition-colors duration-200 hover:bg-white/10 hover:text-white"
              >
                {shortName(section.name)}
              </Link>
            ))}
            <Link
              href="/articles"
              className="rounded-full px-3 py-2 transition-colors duration-200 hover:bg-white/10 hover:text-white"
            >
              المقالات
            </Link>
          </nav>

          <Link href="/#sections" className="btn-gold !px-5 !py-2 text-sm">
            ابدأ الآن
          </Link>
        </div>
      </header>
    </>
  );
}
