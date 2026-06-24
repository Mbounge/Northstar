//components/visit-recorder.tsx

"use client";

import { useEffect, useRef } from "react";

export function VisitRecorder({ appName }: { appName: string }) {
  const didSendRef = useRef(false);

  useEffect(() => {
    if (!appName || didSendRef.current) return;

    didSendRef.current = true;

    const payload = JSON.stringify({ appName });
    const blob = new Blob([payload], { type: "application/json" });

    const sendWithFetch = () => {
      fetch("/api/visits", {
        method: "POST",
        body: payload,
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => {
        // This should never affect the page UX.
        // Visit tracking is intentionally fire-and-forget.
      });
    };

    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const queued = navigator.sendBeacon("/api/visits", blob);

      if (!queued) {
        sendWithFetch();
      }

      return;
    }

    sendWithFetch();
  }, [appName]);

  return null;
}