import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getAll } from "@/lib/store";
import { deleteArticleAction, saveArticleAction } from "@/app/admin/actions";
import {
  Card,
  Field,
  PageHeader,
  Select,
  StatusBadge,
  TextArea,
} from "@/components/admin/Ui";

export default async function AdminArticlesPage() {
  if (!(await isAuthenticated())) redirect("/admin");

  const [articles, sections] = await Promise.all([getAll("articles"), getAll("sections")]);

  const sectionOptions = [
    { value: "", label: "بلا قسم" },
    ...sections.map((section) => ({ value: section.id, label: section.name })),
  ];

  const statusOptions = [
    { value: "draft", label: "مسودة" },
    { value: "review", label: "تحت المراجعة القانونية" },
    { value: "published", label: "منشور" },
  ];

  return (
    <div className="space-y-7">
      <PageHeader
        title="المقالات"
        description="سير النشر: كاتب المحتوى ← مراجعة قانونية ← اعتماد ← نشر. المقال لا يظهر للجمهور إلا بحالة «منشور»."
      />

      <Card>
        <h2 className="font-extrabold text-slate-900">مقال جديد</h2>
        <form action={saveArticleAction} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="العنوان" name="title" required />
            <Field
              label="الرابط (slug)"
              name="slug"
              placeholder="huquq-alhadana"
              hint="أحرف إنجليزية وشرطات فقط."
            />
            <Field label="الكاتب" name="author" defaultValue="فريق محامي نفسك" />
            <Field label="المراجع القانوني" name="legalReviewer" />
            <Field label="تاريخ آخر مراجعة" name="lastReviewedAt" type="date" />
            <Select label="القسم" name="sectionId" options={sectionOptions} />
            <Select label="الحالة" name="status" options={statusOptions} />
            <Field label="الوسوم" name="tags" placeholder="حضانة، إجراءات" hint="افصل بفاصلة «،»" />
          </div>

          <TextArea label="المقتطف" name="excerpt" rows={2} />
          <TextArea
            label="المحتوى"
            name="body"
            rows={10}
            hint="يدعم Markdown مبسّط: ## عنوان، **غامق**، - قائمة، [نص](رابط)"
          />

          <button type="submit" className="btn-brand !py-2 text-sm">
            حفظ المقال
          </button>
        </form>
      </Card>

      {articles.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-extrabold text-slate-900">المقالات ({articles.length})</h2>

          {articles.map((article) => (
            <Card key={article.id}>
              <details>
                <summary className="cursor-pointer">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-extrabold text-slate-900">{article.title}</span>
                      <span className="mr-2 text-xs text-slate-400">/{article.slug}</span>
                    </span>
                    <StatusBadge status={article.status} />
                  </span>
                </summary>

                <form action={saveArticleAction} className="mt-4 space-y-4">
                  <input type="hidden" name="id" value={article.id} />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="العنوان" name="title" defaultValue={article.title} />
                    <Field label="الرابط (slug)" name="slug" defaultValue={article.slug} />
                    <Field label="الكاتب" name="author" defaultValue={article.author} />
                    <Field
                      label="المراجع القانوني"
                      name="legalReviewer"
                      defaultValue={article.legalReviewer}
                    />
                    <Field
                      label="تاريخ آخر مراجعة"
                      name="lastReviewedAt"
                      type="date"
                      defaultValue={article.lastReviewedAt?.slice(0, 10)}
                    />
                    <Select
                      label="القسم"
                      name="sectionId"
                      defaultValue={article.sectionId}
                      options={sectionOptions}
                    />
                    <Select
                      label="الحالة"
                      name="status"
                      defaultValue={article.status}
                      options={statusOptions}
                    />
                    <Field
                      label="الوسوم"
                      name="tags"
                      defaultValue={article.tags.join("، ")}
                    />
                  </div>

                  <TextArea label="المقتطف" name="excerpt" defaultValue={article.excerpt} rows={2} />
                  <TextArea label="المحتوى" name="body" defaultValue={article.body} rows={12} />

                  <div className="flex gap-2">
                    <button type="submit" className="btn-brand !py-2 text-sm">
                      حفظ التعديلات
                    </button>
                  </div>
                </form>

                <form action={deleteArticleAction} className="mt-2">
                  <input type="hidden" name="id" value={article.id} />
                  <button type="submit" className="text-xs font-bold text-rose-600 hover:underline">
                    حذف المقال نهائيًا
                  </button>
                </form>
              </details>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
