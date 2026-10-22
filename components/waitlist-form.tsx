"use client";

import { useRef, useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const busy = useRef(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setError(""); setState("saving");
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams(window.location.search);
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website: form.get("website"), source: params.get("source") || params.get("utm_source") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We couldn’t save your place. Please try again.");
      setState("saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn’t save your place. Please try again.");
      setState("idle");
    } finally { busy.current = false; }
  }
  if (state === "saved") return <div className="waitlist-success" role="status" aria-live="polite"><span className="waitlist-check"><Check size={20} /></span><div><strong>You’re on the list.</strong><p>We’ll email you when early access is available.</p></div></div>;
  return <form onSubmit={submit} className="waitlist-form" aria-label="Join the Northstar waitlist">
    <label className="waitlist-sr-only" htmlFor="waitlist-email">Email address</label>
    <div className="waitlist-form-row">
      <input id="waitlist-email" type="email" name="email" autoComplete="email" required maxLength={254} placeholder="Your email address" value={email} onChange={e => setEmail(e.target.value)} disabled={state === "saving"} aria-describedby="waitlist-promise waitlist-error" aria-invalid={Boolean(error)} />
      <button type="submit" disabled={state === "saving"}>{state === "saving" ? <>Joining <Loader2 className="waitlist-spin" size={18} /></> : <>Join the waitlist <ArrowRight size={18} /></>}</button>
    </div>
    <div className="waitlist-trap" aria-hidden="true"><label htmlFor="waitlist-website">Website</label><input id="waitlist-website" name="website" tabIndex={-1} autoComplete="off" /></div>
    <p className="waitlist-error" id="waitlist-error" role={error ? "alert" : undefined}>{error}</p>
    <p id="waitlist-promise" className="waitlist-promise">Early access, a few people at a time.</p>
  </form>;
}
