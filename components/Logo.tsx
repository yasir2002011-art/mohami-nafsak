import Image from "next/image";

/**
 * شعار «محامي نفسك».
 *
 * الرمز: درع ذهبي بداخله ميزان تمسك عموده قبضة — المستخدم يمسك ميزان العدل بيده.
 * الأصول في ‎/public/brand‎ (مشتقة من ‎/brand/option-3‎). الشعار غني بطبيعته،
 * فيُعرض دائمًا على خلفية الحبر الداكنة (الرأس والتذييل).
 */
export function LogoMark({ className = "h-11 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/brand/mark.png"
      alt=""
      aria-hidden="true"
      width={147}
      height={176}
      className={className}
      priority
    />
  );
}

export function LogoWordmark({
  subtitle = "منصة معرفة نظامية",
  className = "",
}: {
  subtitle?: string | null;
  className?: string;
}) {
  return (
    <span className={`flex flex-col leading-tight ${className}`}>
      <span className="font-logo text-lg font-bold text-white">محامي نفسك</span>
      {subtitle && <span className="text-[11px] font-medium text-white/60">{subtitle}</span>}
    </span>
  );
}

/** الشعار الكامل باسمه (للتذييل) */
export function LogoFull({ className = "h-auto w-[140px]" }: { className?: string }) {
  return (
    <Image src="/brand/logo.png" alt="محامي نفسك" width={420} height={504} className={className} />
  );
}

export default function Logo({
  subtitle,
  markClassName = "h-11 w-auto",
}: {
  subtitle?: string | null;
  markClassName?: string;
}) {
  return (
    <span className="flex items-center gap-3">
      <LogoMark className={markClassName} />
      <LogoWordmark subtitle={subtitle} />
    </span>
  );
}
