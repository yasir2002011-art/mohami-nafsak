import type { AccentColor } from "@/types";

/** أيقونات خطية بسيطة — بلا مكتبات خارجية */
const PATHS: Record<string, string> = {
  gavel: "M12 3v6m0 0-4 4m4-4 4 4M5 21h14M7 17h10l-1-4H8l-1 4Z",
  heart:
    "M12 20s-7-4.5-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5C19 15.5 12 20 12 20Z",
  briefcase:
    "M4 8h16v11H4V8Zm5 0V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 13h16",
  shield: "M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6l-7-3Z",
  chart: "M4 20V10m5 10V4m5 16v-7m5 7V8",
  calculator: "M6 3h12v18H6V3Zm2 4h8M8 11h2m3 0h3M8 15h2m3 0h3",
  scroll: "M6 4h12v16H6V4Zm3 4h6M9 12h6M9 16h4",
  document: "M7 3h7l4 4v14H7V3Zm7 0v4h4",
  question: "M9 9a3 3 0 1 1 4 2.8c-.8.4-1 1-1 1.7v.5M12 17.5h.01",
  scale: "M12 4v16M6 8h12M6 8 3 14h6L6 8Zm12 0-3 6h6l-3-6ZM8 20h8",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5v-9Z",
  users: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 8v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1m14-8a3 3 0 1 0 0-6",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z",
  check: "M4 12.5 9 17.5 20 6.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",
  alert: "M12 8v5m0 3h.01M10.3 3.9 2.6 17.3A2 2 0 0 0 4.3 20.3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  arrow: "M15 6l-6 6 6 6",
};

/**
 * ألوان الأقسام.
 * كلها ضمن الهوية القانونية: الكحلي أساس، ومعه زمردي وسماوي وذهبي هادئ
 * للتمييز بين الأقسام دون خروج عن الطابع المهني.
 */
export const ACCENT_CLASSES: Record<
  AccentColor,
  { bg: string; text: string; ring: string; grad: string }
> = {
  rose: {
    bg: "bg-brand-50",
    text: "text-brand-800",
    ring: "ring-brand-200",
    grad: "from-brand-700 to-brand-500",
  },
  violet: {
    bg: "bg-brand-50",
    text: "text-brand-700",
    ring: "ring-brand-200",
    grad: "from-brand-800 to-brand-600",
  },
  coral: {
    bg: "bg-gold-100",
    text: "text-gold-700",
    ring: "ring-gold-200",
    grad: "from-gold-600 to-gold-400",
  },
  mint: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
    grad: "from-emerald-700 to-emerald-500",
  },
  sky: {
    bg: "bg-sky-50",
    text: "text-sky-700",
    ring: "ring-sky-200",
    grad: "from-sky-700 to-sky-500",
  },
  amber: {
    bg: "bg-gold-100",
    text: "text-gold-700",
    ring: "ring-gold-200",
    grad: "from-gold-600 to-gold-400",
  },
};

export default function Icon({
  name,
  className = "w-6 h-6",
}: {
  name: string;
  className?: string;
}) {
  const path = PATHS[name] ?? PATHS.sparkle;
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}
