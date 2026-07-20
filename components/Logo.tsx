/**
 * شعار «محامي نفسك».
 *
 * الرمز: درع يدل على الحماية النظامية، وبداخله ميزان يدل على العدل،
 * وكفّتاه مفتوحتان لأعلى إشارةً إلى وضوح الميزان أمام المستخدم.
 */
export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <span
      className={`brand-gradient inline-flex items-center justify-center rounded-xl text-white ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[62%] w-[62%]"
      >
        {/* الدرع */}
        <path d="M16 3.6 6.6 7v7.6c0 5.6 3.9 10.3 9.4 11.8 5.5-1.5 9.4-6.2 9.4-11.8V7L16 3.6Z" />
        {/* عمود الميزان وعارضته */}
        <path d="M16 10.4v8.2M11.2 12.1h9.6" />
        {/* الكفّتان */}
        <path d="M9 12.1 7.2 15.6a2.2 2.2 0 0 0 3.6 0L9 12.1Z" />
        <path d="M23 12.1l-1.8 3.5a2.2 2.2 0 0 0 3.6 0L23 12.1Z" />
        {/* القاعدة */}
        <path d="M13.4 18.9h5.2" />
      </svg>
    </span>
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
      <span className="text-lg font-extrabold text-brand-800">محامي نفسك</span>
      {subtitle && (
        <span className="text-[11px] font-medium text-brand-400">{subtitle}</span>
      )}
    </span>
  );
}

export default function Logo({
  subtitle,
  markClassName = "h-10 w-10",
}: {
  subtitle?: string | null;
  markClassName?: string;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className={markClassName} />
      <LogoWordmark subtitle={subtitle} />
    </span>
  );
}
