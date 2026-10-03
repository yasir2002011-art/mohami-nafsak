"use client";

import { trackExternalClick } from "@/lib/track";

/**
 * رابط أداة خارجية يُحتسب استخدامًا عند النقر.
 * الحدث يُرسل بـ sendBeacon قبل الانتقال، ومرة واحدة لكل تبويب.
 */
export default function ExternalToolLink({
  toolId,
  href,
  className,
  children,
}: {
  toolId: string;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => trackExternalClick(toolId)}
    >
      {children}
    </a>
  );
}
