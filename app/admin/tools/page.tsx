import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getAll } from "@/lib/store";
import { saveToolAction } from "@/app/admin/actions";
import { Card, Field, PageHeader, TextArea, Toggle } from "@/components/admin/Ui";

const KIND_LABELS: Record<string, string> = {
  engine: "محرك قرار",
  external: "خدمة خارجية",
  faq: "أسئلة وأجوبة",
};

export default async function AdminToolsPage() {
  if (!(await isAuthenticated())) redirect("/admin");

  const [tools, sections] = await Promise.all([getAll("tools"), getAll("sections")]);
  const sorted = [...tools].sort(
    (a, b) => a.sectionId.localeCompare(b.sectionId) || a.order - b.order,
  );

  return (
    <div>
      <PageHeader
        title="الأدوات"
        description="تفعيل الأدوات وإيقافها، وربط الأدوات الخارجية بروابط جهاتها الرسمية، والتحكم في ظهور إعلانات Google داخل كل أداة."
      />

      <div className="space-y-4">
        {sorted.map((tool) => {
          const section = sections.find((item) => item.id === tool.sectionId);

          return (
            <Card key={tool.id}>
              <form action={saveToolAction} className="space-y-4">
                <input type="hidden" name="id" value={tool.id} />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-extrabold text-slate-900">{tool.name}</h2>
                    <p className="text-xs text-slate-500">
                      {section?.name} · {KIND_LABELS[tool.kind]} · /tools/{tool.slug}
                    </p>
                  </div>
                  <span
                    className={`badge ${
                      tool.published ? "bg-emerald-100 text-emerald-800" : "bg-brand-50 text-slate-600"
                    }`}
                  >
                    {tool.published ? "منشورة" : "غير منشورة"}
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="اسم الأداة" name="name" defaultValue={tool.name} />
                  <Field
                    label="وصف مختصر"
                    name="shortDescription"
                    defaultValue={tool.shortDescription}
                  />
                </div>

                <TextArea label="الوصف الكامل" name="description" defaultValue={tool.description} />

                {tool.kind === "external" && (
                  <div className="grid gap-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                    <Field
                      label="رابط الجهة الرسمية"
                      name="externalUrl"
                      type="url"
                      defaultValue={tool.externalUrl}
                      placeholder="https://..."
                      hint="بمجرد إضافة الرابط وتفعيل النشر تصبح الأداة ظاهرة للجمهور."
                    />
                    <Field
                      label="اسم الجهة"
                      name="externalProvider"
                      defaultValue={tool.externalProvider}
                      placeholder="مثال: منصة قوى"
                    />
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Toggle
                    label="منشورة للجمهور"
                    name="published"
                    defaultChecked={tool.published}
                  />
                  <Toggle
                    label="السماح بإعلانات Google داخل الأداة"
                    name="allowGoogleAds"
                    defaultChecked={tool.allowGoogleAds}
                    hint="اتركه مغلقًا في الأدوات ذات النتائج الحساسة مثل الحضانة."
                  />
                </div>

                <button type="submit" className="btn-brand !py-2 text-sm">
                  حفظ
                </button>
              </form>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
