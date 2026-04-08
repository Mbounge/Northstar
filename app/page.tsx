// app/page.tsx
import Link from "next/link";
import { getReviewApps } from "@/lib/review-data";
import { Command, Plus, ArrowUpRight } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const gradeConfig: Record<string, { color: string; bg: string }> = {
  A: { color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
  B: { color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-50 dark:bg-blue-500/10" },
  C: { color: "text-amber-600 dark:text-amber-400",  bg: "bg-amber-50 dark:bg-amber-500/10" },
  D: { color: "text-orange-600 dark:text-orange-400",bg: "bg-orange-50 dark:bg-orange-500/10" },
  F: { color: "text-rose-600 dark:text-rose-400",    bg: "bg-rose-50 dark:bg-rose-500/10" },
};

function gradeStyle(grade: string) {
  const key = grade?.charAt(0).toUpperCase();
  return gradeConfig[key] ?? { color: "text-zinc-400 dark:text-zinc-500", bg: "bg-zinc-100 dark:bg-zinc-800/50" };
}

function GradePip({ label, grade }: { label: string; grade: string }) {
  if (!grade || grade === "N/A") return null;
  const { color, bg } = gradeStyle(grade);
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md ${bg}`}>
      <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{label}</span>
      <span className={`text-[13px] font-semibold font-mono ${color}`}>{grade}</span>
    </div>
  );
}

export default async function PortfolioPage() {
  const apps = await getReviewApps();

  return (
    <div className="min-h-screen bg-white dark:bg-[#080808] flex flex-col font-sans">

      {/* ── NAV ── */}
      <header className="h-12 border-b border-zinc-200 dark:border-zinc-800/60 px-6 flex items-center justify-between sticky top-0 z-50 bg-white/80 dark:bg-[#080808]/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-zinc-900 dark:bg-white rounded-md flex items-center justify-center">
            <Command className="w-3 h-3 text-white dark:text-zinc-900" />
          </div>
          <span className="text-[13px] font-medium text-zinc-900 dark:text-white tracking-tight">
            Competitor<span className="text-zinc-400 dark:text-zinc-500">OS</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800" />
          <Link
            href="/login"
            className="text-[12px] text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            Sign out
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-16">

        {/* ── HEADING ── */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.15em] mb-2">
              {apps.length} targets tracked
            </p>
            <h1 className="text-[28px] font-semibold text-zinc-900 dark:text-white tracking-tight leading-none">
              Active targets
            </h1>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[12px] font-medium rounded-lg hover:opacity-80 transition-opacity">
            <Plus className="w-3.5 h-3.5" />
            Add target
          </button>
        </div>

        {/* ── GRID ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-zinc-200 dark:bg-zinc-800/60 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800/60">
          {apps.map((app) => (
            <Link key={app.appName} href={`/${app.appName}`} className="group relative bg-white dark:bg-[#0d0d0d] hover:bg-zinc-50 dark:hover:bg-[#111] transition-colors duration-150 p-6 flex flex-col gap-5 min-h-[200px]">

              {/* Top row */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {app.iconUrl ? (
                    <img
                      src={app.iconUrl}
                      alt={app.appName}
                      className="rounded-xl object-cover border border-zinc-200 dark:border-zinc-800 block"
                      style={{ width: "40px", height: "40px", minWidth: "40px", minHeight: "40px" }}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">
                      {app.appName.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="text-[14px] font-semibold text-zinc-900 dark:text-white leading-tight">
                      {app.appName}
                    </p>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-tight">
                      {app.appType}
                    </p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 transition-colors shrink-0 mt-0.5" />
              </div>

              {/* Bottom row */}
              <div className="mt-auto flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {app.hasOnboarding && <GradePip label="Onb" grade={app.onboardingGrade} />}
                  {app.hasBrowsing && <GradePip label="App" grade={app.browsingGrade} />}
                </div>
                <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 tabular-nums">
                  {app.totalScreens} screens
                </span>
              </div>

            </Link>
          ))}

          {/* Add card */}
          <div className="bg-white dark:bg-[#0d0d0d] p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-[#111] transition-colors group min-h-[200px]">
            <div className="w-8 h-8 rounded-full border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center group-hover:border-zinc-400 dark:group-hover:border-zinc-500 transition-colors">
              <Plus className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-[12px] font-medium text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 transition-colors">
              Track new target
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}