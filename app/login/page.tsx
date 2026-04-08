// app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Command, ArrowRight, Loader2, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate auth delay, then route to the Portfolio page
    setTimeout(() => {
      router.push("/");
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#050505] flex flex-col justify-center relative overflow-hidden transition-colors duration-300 font-sans">
      
      {/* ── BACKGROUND MESH & GRID ── */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
      <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-zinc-400 dark:bg-zinc-600 opacity-[0.15] blur-[100px]" />

      <div className="relative z-10 max-w-[380px] w-full mx-auto px-6">
        
        {/* ── BRANDING ── */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm rounded-xl flex items-center justify-center mb-5">
            <Command className="w-5 h-5 text-zinc-900 dark:text-white" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white tracking-tight mb-2">
            CompetitorOS
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            Automated surveillance and structural teardowns.
          </p>
        </div>

        {/* ── LOGIN CARD ── */}
        <div className="bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)]">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-[0.1em] font-bold text-zinc-500 dark:text-zinc-400 ml-1">
                Work Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@fund.com"
                className="w-full bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-[13px] text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-white transition-all shadow-sm"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-all flex items-center justify-center gap-2 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>Authenticate <ArrowRight className="w-3.5 h-3.5" /></>
              )}
            </button>
          </form>
        </div>

        {/* ── FOOTER STATUS ── */}
        <div className="mt-8 text-center">
          <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 flex items-center justify-center gap-1.5 uppercase tracking-widest">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Secure Connection
          </p>
        </div>

      </div>
    </div>
  );
}