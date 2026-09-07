import React from "react";
import DateFields from "@/components/admin/DateFields";

export function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="mb-7">
      <h1 className="text-2xl font-black text-slate-900">{title}</h1>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p>
    </header>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`card-soft p-5 ${className}`}>{children}</div>;
}

export function Field({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
  hint,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  type?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      {type === "date" ? (
        // حقل تاريخ ثلاثي بدل حقل المتصفح الذي يعكس الحروف العربية في Chrome — انظر DateFields
        <DateFields
          id={name}
          name={name}
          defaultValue={defaultValue === undefined ? undefined : String(defaultValue)}
          required={required}
        />
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          defaultValue={defaultValue}
          placeholder={placeholder}
          required={required}
          className="field"
        />
      )}
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{hint}</p>}
    </div>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  rows = 3,
  hint,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows?: number;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="field"
      />
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{hint}</p>}
    </div>
  );
}

export function Select({
  label,
  name,
  defaultValue,
  options,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <select id={name} name={name} defaultValue={defaultValue} className="field">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{hint}</p>}
    </div>
  );
}

export function Toggle({
  label,
  name,
  defaultChecked,
  hint,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-slate-50 p-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 accent-brand-600"
      />
      <span>
        <span className="text-sm font-bold text-slate-800">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="card-soft p-10 text-center text-sm font-bold text-slate-500">
      {message}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published: "bg-emerald-100 text-emerald-800",
    draft: "bg-brand-50 text-brand-700",
    review: "bg-amber-100 text-amber-800",
    suspended: "bg-rose-100 text-rose-800",
    new: "bg-brand-50 text-brand-800",
    contacted: "bg-sky-100 text-sky-800",
    converted: "bg-emerald-100 text-emerald-800",
    "not-suitable": "bg-brand-50 text-slate-600",
    reviewing: "bg-amber-100 text-amber-800",
    resolved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-rose-100 text-rose-800",
  };

  const labels: Record<string, string> = {
    published: "منشور",
    draft: "مسودة",
    review: "تحت المراجعة",
    suspended: "موقوف",
    new: "جديدة",
    contacted: "تم التواصل",
    converted: "تحوّلت إلى عميل",
    "not-suitable": "غير مناسبة",
    reviewing: "قيد المراجعة",
    resolved: "تمت المعالجة",
    rejected: "مرفوض",
  };

  return (
    <span className={`badge ${styles[status] ?? "bg-brand-50 text-brand-700"}`}>
      {labels[status] ?? status}
    </span>
  );
}
