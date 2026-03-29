// app/review/page.tsx
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getReviewApps } from "@/lib/review-data";
import { ArrowRight, ArrowLeft, Smartphone, ShieldAlert, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

function getGradeColor(grade: string) {
  if (grade === 'A') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  if (grade === 'B') return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
  if (grade === 'C') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  if (grade === 'D') return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
  if (grade === 'F') return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
  return 'bg-zinc-800 text-zinc-400 border-zinc-700';
}

export default async function ReviewIndexPage() {
  const apps = await getReviewApps();

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex flex-col gap-6">
          <Link href="/" className="inline-flex items-center text-sm font-medium text-zinc-400 hover:text-white transition-colors w-fit group bg-zinc-900/50 px-3 py-1.5 rounded-md border border-zinc-800/50 hover:bg-zinc-800">
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Portfolio
          </Link>

          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Smartphone className="text-blue-500 w-8 h-8" />
              Unified Intelligence Center
            </h1>
            <p className="text-zinc-400 mt-2">Validate automated onboarding runs and full app teardowns in one place.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {apps.map((app) => {
            const safeUrl = `/review/${encodeURIComponent(app.appName)}`;

            return (
              <Link key={app.appName} href={safeUrl}>
                <Card className="bg-zinc-900/40 border-zinc-800/80 hover:border-blue-500/50 hover:bg-zinc-900/80 transition-all duration-300 h-full flex flex-col overflow-hidden group p-0">
                  <div className="p-6 pb-4 flex-1 flex flex-col">
                    
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex gap-2">
                        {app.hasOnboarding && (
                          <Badge variant="outline" className={cn("font-mono font-bold border", getGradeColor(app.onboardingGrade))}>
                            Onboarding: {app.onboardingGrade}
                          </Badge>
                        )}
                        {app.hasBrowsing && (
                          <Badge variant="outline" className={cn("font-mono font-bold border", getGradeColor(app.browsingGrade))}>
                            Teardown: {app.browsingGrade}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div>
                      <h2 className="text-2xl font-bold text-white group-hover:text-blue-400 transition-colors tracking-tight">
                        {app.appName}
                      </h2>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">{app.category}</span>
                        <span className="text-zinc-700">•</span>
                        <span className="text-xs font-mono text-zinc-400">{app.totalScreens} Screens Analyzed</span>
                      </div>
                    </div>
                    
                  </div>

                  <div className="px-6 py-4 bg-zinc-950/60 border-t border-zinc-800/50 flex justify-between items-center group-hover:bg-blue-950/20 transition-colors mt-auto">
                    <span className="text-[10px] font-mono text-zinc-600 truncate max-w-[200px]">{app.appName}</span>
                    <span className="flex items-center text-sm font-medium text-blue-400 group-hover:translate-x-1 transition-transform">
                      View Unified Dashboard <ArrowRight className="w-4 h-4 ml-1.5" />
                    </span>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>

      </div>
    </div>
  );
}