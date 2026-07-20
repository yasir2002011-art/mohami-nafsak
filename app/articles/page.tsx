import Link from "next/link";
import type { Metadata } from "next";
import Icon from "@/components/Icon";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import AdSlot from "@/components/AdSlot";
import { getAll } from "@/lib/store";

export const metadata: Metadata = {
  title: "المقالات والأدلة",
  description: "مقالات وأدلة مبسّطة تشرح الإجراءات والحقوق النظامية.",
};

export default async function ArticlesPage() {
  const articles = (await getAll("articles"))
    .filter((article) => article.status === "published")
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

  return (
    <>
      <SiteHeader />

      <header className="relative overflow-hidden border-b border-slate-200">
        <div className="absolute inset-0 -z-10" style={{ background: "var(--gradient-hero)" }} />
        <div className="mx-auto max-w-5xl px-4 py-14 text-center">
          <h1 className="text-3xl font-black text-slate-900 sm:text-4xl">
            المقالات و<span className="text-gradient">الأدلة</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-slate-600">
            محتوى مبسّط يشرح لك الإجراءات والحقوق، بلغة واضحة ومصادر معلنة.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12">
        <AdSlot placement="article-sidebar" />

        {articles.length === 0 ? (
          <div className="card-soft flex flex-col items-center gap-3 p-12 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Icon name="scroll" className="h-7 w-7" />
            </span>
            <p className="font-bold text-slate-800">لا توجد مقالات منشورة بعد.</p>
            <p className="text-sm text-slate-600">أضِف مقالاتك من لوحة الإدارة.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <Link
                key={article.id}
                href={`/articles/${article.slug}`}
                className="card-soft card-hover flex flex-col p-6"
              >
                {article.tags[0] && (
                  <span className="badge mb-3 w-fit bg-brand-50 text-brand-700">
                    {article.tags[0]}
                  </span>
                )}
                <h2 className="text-base font-extrabold leading-relaxed text-slate-900">
                  {article.title}
                </h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">
                  {article.excerpt}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-extrabold text-brand-700">
                  اقرأ المقال
                  <Icon name="arrow" className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
