"use client";
/* eslint-disable @next/next/no-img-element -- App icons are served from the existing catalog and capture storage. */

import { useEffect, useState } from "react";

type Props = {
  appName: string;
  iconUrl?: string | null;
  fallbackUrl?: string | null;
  className?: string;
};

export function AdminAppIcon({ appName, iconUrl, fallbackUrl, className = "h-10 w-10 rounded-xl" }: Props) {
  const [source, setSource] = useState(iconUrl || fallbackUrl || "");

  useEffect(() => { setSource(iconUrl || fallbackUrl || ""); }, [iconUrl, fallbackUrl]);

  const advance = () => setSource((current) => current === iconUrl && fallbackUrl ? fallbackUrl : "");

  return <span className={`${className} relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-violet-500 to-indigo-600 font-bold text-white`} aria-label={`${appName} icon`}>
    {source ? <img src={source} alt="" onError={advance} className="h-full w-full object-cover" /> : appName.trim().charAt(0).toUpperCase() || "?"}
  </span>;
}
