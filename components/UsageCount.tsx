import { usesLabel } from "@/lib/metrics";

/**
 * عدّاد الاستخدام العام على الأداة: «استُخدمت X مرة».
 * لا يظهر قبل بلوغ الحد الأدنى، ولا للأداة التي أُخفي عدّادها من اللوحة.
 * الرقم عدّ فعلي يبدأ من صفر — لا قيمة ابتدائية يدوية في أي مكان.
 */
export default function UsageCount({
  uses,
  min,
  hidden,
  className = "",
}: {
  uses: number;
  min: number;
  hidden?: boolean;
  className?: string;
}) {
  if (hidden || uses <= 0 || uses < min) return null;
  return <p className={`text-xs text-slate-500 ${className}`}>{usesLabel(uses)}</p>;
}
