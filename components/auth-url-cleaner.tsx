"use client";

import { useEffect } from "react";

const AUTH_QUERY_KEYS = [
  "error",
  "error_code",
  "error_description",
  "code",
  "state",
];

export function AuthUrlCleaner() {
  useEffect(() => {
    const url = new URL(window.location.href);

    const hasAuthNoise = AUTH_QUERY_KEYS.some((key) =>
      url.searchParams.has(key)
    );

    if (!hasAuthNoise) return;

    for (const key of AUTH_QUERY_KEYS) {
      url.searchParams.delete(key);
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;

    window.history.replaceState(null, "", nextUrl || "/");
  }, []);

  return null;
}