import type { ReactNode } from 'react';

/** Shared company-page device chrome for films and raw interactive app surfaces. */
export function AppPhoneFrame({ children, variant = 'film', width, height }: { children: ReactNode; variant?: 'film' | 'interactive'; width?: number; height?: number }) {
  return <div data-app-phone-frame={variant} style={width && height ? { width, height } : undefined} className={`group relative overflow-hidden bg-[#11121d] ${variant === 'film'
    ? 'rounded-[2.9rem] border-[7px] border-[#1b1a28] ring-1 ring-[#5a526d]/45 dark:border-[#080812] dark:ring-white/25 dark:shadow-[0_28px_75px_rgba(34,18,80,0.28)]'
    : 'shrink-0 rounded-[34px] border-[3px] border-[#0c0b17] ring-1 ring-[#5a526d]/45 dark:ring-white/25'}`}>
    {children}
  </div>;
}
