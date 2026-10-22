import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { WaitlistForm } from "@/components/waitlist-form";
import { Unbounded } from "next/font/google";
import "./waitlist.css";

const unbounded = Unbounded({ subsets: ["latin"], weight: ["200", "300", "600"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.usenorthstar.ai"),
  title: "Northstar — Join the waitlist",
  description: "Your creative studio. On one canvas. Create with AI, refine by hand, and work with your team. Join the Northstar early-access waitlist.",
  alternates: { canonical: "https://www.usenorthstar.ai/waitlist" },
  openGraph: { title: "Your creative studio. On one canvas.", description: "Create with AI. Refine by hand. Work together. Join the Northstar waitlist.", url: "https://www.usenorthstar.ai/waitlist", siteName: "Northstar", type: "website" },
  twitter: { card: "summary_large_image", title: "Northstar — Your creative studio. On one canvas.", description: "Join the early-access waitlist." },
};

export default function WaitlistPage() {
  return (
    <main className="waitlist-page">
      <div className="waitlist-background" aria-hidden="true">
        <div className="waitlist-background-art">
          <Image src="/topaz_enhance.png" alt="" fill priority quality={100} sizes="150vmax" />
        </div>
      </div>
      <section className={`waitlist-card ${unbounded.className}`} aria-labelledby="waitlist-heading">
        <h1 id="waitlist-heading"><span>Welcome to</span><strong>North Star AI</strong></h1>
        <p className="waitlist-intro">Your creative studio. On one canvas.</p>
        <WaitlistForm />
        <footer className="waitlist-footer"><Link href="/waitlist/privacy">Privacy</Link><span aria-hidden="true">·</span><Link href="/signin">Already have access? Sign in ↗</Link></footer>
      </section>
    </main>
  );
}
