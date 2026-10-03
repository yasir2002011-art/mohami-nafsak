import Link from "next/link";
import Icon, { ACCENT_CLASSES } from "@/components/Icon";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import AdSlot from "@/components/AdSlot";
import { getAll } from "@/lib/store";

export default async function HomePage() {
  const [sections, tools, articles] = await Promise.all([
    getAll("sections"),
    getAll("tools"),
    getAll("articles"),
  ]);

  const liveSections = sections.filter((section) => section.published).sort((a, b) => a.order - b.order);
  const liveTools = tools.filter((tool) => tool.published);
  const latestArticles = articles
    .filter((article) => article.status === "published")
    .slice(0, 3);

  return (
    <>
      <SiteHeader />

      {/* ------------------------------ الواجهة ------------------------------ */}
      {/* حبر بتدرج خفيف ونقش هندسي إسلامي بشفافية 6% (الصنف hero-ink في globals.css) */}
      <section className="hero-ink overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 py-16 lg:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-gold-400/50 px-4 py-1.5 text-xs font-bold text-gold-400">
              <Icon name="shield" className="h-4 w-4" />
              منصة سعودية · كل نتيجة بمادتها النظامية
            </span>

            <h1 className="mt-6 text-[2.125rem] font-bold leading-[1.25] text-white lg:text-[3.25rem]">
              كواشف نظامية
              <br />
              <span className="text-gold-400">توجّهك إلى موقفك النظامي</span>
            </h1>

            <p className="measure mx-auto mt-6 text-[1.0625rem] leading-[1.8] text-white/80 lg:text-lg">
              أسئلة قصيرة ومحددة، ثم نتيجة استرشادية مع المادة النظامية التي بُنيت عليها،
              وسبب النتيجة، والوقائع التي قد تغيّرها. وإن لم تكفِ المعطيات قلنا ذلك صراحة.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="#sections" className="btn-gold">
                تصفّح الأقسام
                <Icon name="arrow" className="h-4 w-4" />
              </Link>
              <Link href="/articles" className="btn-outline-light">
                اقرأ المقالات
              </Link>
            </div>

            {/* مطمئنات الخصوصية: ثلاث نقاط بعلامة تحقق ذهبية في دائرة */}
            <ul className="mx-auto mt-12 grid max-w-3xl gap-4 sm:grid-cols-3">
              {["بلا حساب وبلا اسم", "إجاباتك لا تُحفظ", "كل نتيجة بمصدرها"].map((text) => (
                <li
                  key={text}
                  className="flex items-center justify-center gap-2.5 text-sm font-semibold text-white/90"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold-400 text-gold-400">
                    <Icon name="check" className="h-3.5 w-3.5" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4">
        <AdSlot placement="home-top" />

        {/* ------------------------------ الأقسام ------------------------------ */}
        <section id="sections" className="scroll-mt-24 pt-16 lg:pt-24">
          <SectionHeading
            eyebrow="ابدأ من هنا"
            title="اختر القسم الذي يخصّ مسألتك"
            subtitle="كل قسم يحتوي على أدوات وأسئلة وأجوبة وروابط الجهات الرسمية."
          />

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {liveSections.map((section) => {
              const accent = ACCENT_CLASSES[section.accent];
              const count = liveTools.filter((tool) => tool.sectionId === section.id).length;

              return (
                <Link
                  key={section.id}
                  href={`/sections/${section.slug}`}
                  className="card-soft card-hover group flex flex-col p-6"
                >
                  <span
                    className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${accent.bg} ${accent.text}`}
                  >
                    <Icon name={section.icon} className="h-7 w-7" />
                  </span>

                  <h3 className="text-lg font-bold text-slate-900">{section.name}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">
                    {section.description}
                  </p>

                  <div className="mt-5 flex items-center justify-between">
                    <span className={`badge ${accent.bg} ${accent.text}`}>
                      {count > 0 ? `${count} أداة متاحة` : "قريبًا"}
                    </span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-200 text-brand-700 transition-colors duration-200 group-hover:border-gold-400 group-hover:bg-gold-100">
                      <Icon name="arrow" className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ------------------------------ الأدوات ------------------------------ */}
        {liveTools.length > 0 && (
          <section className="pt-16 lg:pt-24">
            <SectionHeading
              eyebrow="جاهزة الآن"
              title="الأدوات المتاحة"
              subtitle="أدوات تفاعلية تسألك ثم توضّح لك المسار المناسب لحالتك."
            />

            {/* حبوب الأقسام داخل حاوية فاتحة — كل حبة رابط لصفحة القسم القائمة */}
            <div className="mt-8 flex justify-center">
              <nav className="pill-tabs" aria-label="الأقسام">
                {liveSections.map((section) => (
                  <Link key={section.id} href={`/sections/${section.slug}`} className="pill">
                    {section.name}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {liveTools.map((tool) => {
                const section = sections.find((item) => item.id === tool.sectionId);
                const accent = ACCENT_CLASSES[section?.accent ?? "rose"];

                return (
                  <Link
                    key={tool.id}
                    href={`/tools/${tool.slug}`}
                    className="card-soft card-hover group flex items-start gap-4 p-6"
                  >
                    <span
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${accent.bg} ${accent.text}`}
                    >
                      <Icon name={tool.icon} className="h-6 w-6" />
                    </span>
                    <div className="flex-1">
                      <h3 className="text-base font-bold text-slate-900">{tool.name}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                        {tool.shortDescription}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {section && (
                          <span className="badge border border-brand-200 text-slate-600">
                            {section.name}
                          </span>
                        )}
                        <span className="badge bg-gold-100 text-brand-900">مجانية</span>
                      </div>
                      <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-700">
                        ابدأ الأداة
                        <Icon name="arrow" className="h-4 w-4" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <AdSlot placement="home-mid" />

        {/* ------------------------------ كيف تعمل ------------------------------ */}
        <section className="pt-16 lg:pt-24">
          <SectionHeading
            eyebrow="كيف تعمل المنصة"
            title="ثلاث خطوات فقط"
            subtitle="بلا تسجيل، وبلا مشاركة بيانات، وبلا وعود بنتائج."
          />

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              {
                step: "١",
                title: "أجب عن أسئلة قصيرة",
                text: "أسئلة محددة عن وضعك، بلا اسم ولا رقم قضية ولا مستندات.",
              },
              {
                step: "٢",
                title: "اطّلع على مسارك",
                text: "نتيجة واضحة مع أسبابها، والوقائع التي قد تغيّرها، ومصادرها النظامية.",
              },
              {
                step: "٣",
                title: "قرّر خطوتك التالية",
                text: "أكمل بنفسك، أو تواصل مع محامٍ مرخّص — بموافقتك وحدك.",
              },
            ].map((item) => (
              <div key={item.step} className="card-soft relative p-6 pt-10">
                <span className="absolute -top-5 right-6 flex h-11 w-11 items-center justify-center rounded-full border border-gold-400 bg-gold-100 text-lg font-bold text-brand-900">
                  {item.step}
                </span>
                <h3 className="text-lg font-bold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------ المقالات ------------------------------ */}
        {latestArticles.length > 0 && (
          <section className="pt-16 lg:pt-24">
            <SectionHeading eyebrow="المكتبة" title="مقالات وأدلة" subtitle="محتوى مبسّط يشرح لك الإجراءات والحقوق." />

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {latestArticles.map((article) => (
                <Link
                  key={article.id}
                  href={`/articles/${article.slug}`}
                  className="card-soft card-hover flex flex-col p-6"
                >
                  <h3 className="text-base font-extrabold leading-relaxed text-slate-900">
                    {article.title}
                  </h3>
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
          </section>
        )}

        {/* ------------------------------ التنبيه ------------------------------ */}
        <section className="pt-16 lg:pt-24">
          <div className="card-soft overflow-hidden p-8 sm:p-10">
            <div className="flex flex-col items-start gap-6 sm:flex-row">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <Icon name="alert" className="h-7 w-7" />
              </span>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">
                  ما الذي لا تقدّمه هذه المنصة؟
                </h2>
                <ul className="mt-4 grid gap-2.5 text-sm leading-relaxed text-slate-600 sm:grid-cols-2">
                  {[
                    "لا تصدر حكمًا قضائيًا ولا تتنبأ بنتيجة دعواك.",
                    "لا تعطي نسبة نجاح ولا ضمانًا بالفوز.",
                    "لا تنشئ علاقة موكِّل بمحامٍ.",
                    "لا تغني عن استشارة محامٍ مرخّص في المسائل المعقّدة.",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href="/disclaimer" className="btn-ghost mt-6 !py-2 text-sm">
                  اقرأ إخلاء المسؤولية كاملًا
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="text-center">
      <span className="text-xs font-bold tracking-widest text-gold-700">{eyebrow}</span>
      <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h2>
      <p className="measure mx-auto mt-3 text-[1.0625rem] leading-[1.8] text-slate-500">{subtitle}</p>
    </div>
  );
}
