//components/prefetch-card-link.tsx

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

interface PrefetchCardLinkProps {
  href: string;
  className?: string;
  children: ReactNode;
}

export function PrefetchCardLink({
  href,
  className,
  children,
}: PrefetchCardLinkProps) {
  const router = useRouter();

  const prefetch = () => {
    router.prefetch(href);
  };

  return (
    <Link
      href={href}
      prefetch
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onPointerDown={prefetch}
      className={className}
    >
      {children}
    </Link>
  );
}