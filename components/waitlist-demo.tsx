"use client";

import { useEffect, useRef } from "react";

export function WaitlistDemo() {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const player = video.current;
    if (!player) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (motion.matches) player.pause();
      else void player.play().catch(() => { /* Native controls remain available when autoplay is blocked. */ });
    };
    sync();
    motion.addEventListener("change", sync);
    return () => motion.removeEventListener("change", sync);
  }, []);

  return <figure className="waitlist-demo" aria-label="Watch Northstar in action">
    <video ref={video} autoPlay muted playsInline loop controls preload="metadata"
      poster="/northstar/demo/northstar-demo-20261026.webp"
      width={1920} height={1080} aria-label="Northstar product demo">
      <source src="/northstar/demo/northstar-demo-20261026-720p.mp4" type="video/mp4" media="(max-width: 760px)" />
      <source src="/northstar/demo/northstar-demo-20261026.mp4" type="video/mp4" />
      <a href="/northstar/demo/northstar-demo-20261026.mp4">Watch the Northstar demo</a>
    </video>
    <figcaption className="waitlist-sr-only">See original campaign imagery, design edits, feedback, live teamwork and interactive creations on one canvas. This demo has no audio.</figcaption>
  </figure>;
}
