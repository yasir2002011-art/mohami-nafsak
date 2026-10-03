import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import AdSlot from "@/components/AdSlot";
import Markdown from "@/components/Markdown";
import ArticleTelemetry from "@/components/ArticleTelemetry";
import { getAll } from "@/lib/store";

export async function generateStaticParams() {
  const articles = await getAll("articles");
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const articles = await getAll("articles");
  const article = articles.find((item) => item.slug === slug);
  return { title: article?.title ?? "مقال", description: article?.excerpt };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [articles, tools] = await Promise.all([getAll("articles"), getAll("tools")]);
  const article = articles.find(
    (item) => item.slug === slug && item.status === "published",
  );
  if (!article) notFound();

  const toolIdBySlug = Object.fromEntries(
    tools.filter((tool) => tool.published).map((tool) => [tool.slug, tool.id]),
  );

  return (
    <>
      <SiteHeader />

      <article className="mx-auto max-w-3xl px-4 py-12">
        <Link href="/articles" className="text-sm font-bold text-slate-500 hover:text-brand-700">
          المقالات ←
        </Link>

        <h1 className="mt-5 text-3xl font-black leading-snug text-slate-900 sm:text-4xl">
          {article.title}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>بقلم {article.author}</span>
          {article.legalReviewer && <span>· مراجعة قانونية: {article.legalReviewer}</span>}
          {article.lastReviewedAt && (
            <span>· آخر مراجعة: {article.lastReviewedAt.slice(0, 10)}</span>
          )}
        </div>

        <AdSlot placement="article-inline" />

        <div className="card-soft mt-8 p-6 sm:p-9" data-article-body>
          <Markdown source={article.body} />
        </div>
        <ArticleTelemetry article={article.slug} toolIdBySlug={toolIdBySlug} />

        <p className="mt-8 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-sm leading-relaxed text-amber-900">
          هذا المقال معلومات عامة ولا يُعد استشارة قانونية ولا ينشئ علاقة موكِّل بمحامٍ.
          الأنظمة واللوائح قد تتغيّر، فتحقّق من المصدر الرسمي أو راجع محاميًا مرخّصًا.
        </p>
      </article>

      <SiteFooter />
    </>
  );
}
