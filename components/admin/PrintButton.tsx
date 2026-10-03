"use client";

/** زر طباعة — يفتح نافذة الطباعة، ومنها «حفظ بصيغة PDF» */
export default function PrintButton({ label = "طباعة / حفظ PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-brand !py-2 text-sm">
      {label}
    </button>
  );
}
