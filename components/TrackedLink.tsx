"use client";

import Link from "next/link";
import { track } from "@/lib/track";

/** رابط داخلي يسجّل حدثًا من القوائم المغلقة عند النقر (عدّ مجمّع فقط) */
export default function TrackedLink({
  href,
  event,
  props,
  className,
  children,
}: {
  href: string;
  event: string;
  props: Record<string, string>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={className} onClick={() => track(event, props)}>
      {children}
    </Link>
  );
}
