//app/review/page.tsx

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getReviewSessions } from "@/lib/review-data";
import { ArrowRight, ArrowLeft, Bot, ShieldAlert, CheckCircle2, ChevronRight, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

// Helper: Make the labels short and readable
function formatStepName(type: string) {
  const t = type.toUpperCase();
  if (t.includes('VERIFICATION')) return 'VERIFY';
  if (t.includes('PERMISSION')) return 'PERMISSION';
  if (t.includes('PAYWALL') || t.includes('PAYMENT')) return 'PAYWALL';
  if (t.includes('ONBOARDING') || t.includes('TUTORIAL') || t.includes('OVERLAY') || t.includes('POPUP') || t.includes('QUIZ')) return 'TUTORIAL';
  if (t.includes('FORM') || t.includes('DATE_PICKER')) return 'FORM';
  if (t.includes('HOME') || t.includes('FEED') || t.includes('SETTLED')) return 'HOME';
  if (t.includes('WELCOME') || t.includes('CONFIRMATION')) return 'WELCOME';
  if (t.includes('INTEREST') || t.includes('PROFILE')) return 'PROFILE';
  if (t.includes('AUTH') || t.includes('LOGIN') || t.includes('SIGNUP')) return 'AUTH';
  if (t.length > 10) return t.substring(0, 10);
  return t;
}

// Helper: Condense consecutive duplicate formatted screens
function condenseSequence(seq: string[]) {
  if (!seq || seq.length === 0) return[];
  const condensed =[];
  let lastFormatted = "";
  
  for (let i = 0; i < seq.length; i++) {
    if (seq[i] === "UNKNOWN" || seq[i] === "LOADING") continue;
    const formatted = formatStepName(seq[i]);
    
    // Only push if it's different from the PREVIOUS formatted badge
    if (formatted !== lastFormatted) {
      condensed.push({ raw: seq[i], formatted });
      lastFormatted = formatted;
    }
  }
  return condensed;
}

// Helper: Color mapping based on screen type
function getColorClass(type: string) {
  const t = type.toUpperCase();
  if (t.includes('FORM') || t.includes('LOGIN') || t.includes('AUTH') || t.includes('SIGNUP')) 
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  if (t.includes('ONBOARDING') || t.includes('TUTORIAL') || t.includes('INTEREST') || t.includes('PROFILE') || t.includes('QUIZ')) 
    return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
  if (t.includes('VERIFICATION') || t.includes('CAPTCHA')) 
    return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  if (t.includes('PAYMENT') || t.includes('PAYWALL') || t.includes('PLAN')) 
    return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  if (t.includes('PERMISSION') || t.includes('TOOLTIP') || t.includes('OVERLAY') || t.includes('POPUP')) 
    return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  if (t.includes('HOME') || t.includes('FEED') || t.includes('WELCOME') || t.includes('CONFIRMATION') || t.includes('SETTLED')) 
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  
  return 'bg-zinc-800/50 text-zinc-400 border-zinc-700/50';
}

// Helper: Color mapping for Friction Grade
function getGradeColor(grade: string) {
  if (grade === 'A') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  if (grade === 'B') return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
  if (grade === 'C') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  if (grade === 'D') return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
  if (grade === 'F') return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
  return 'bg-zinc-800 text-zinc-300 border-zinc-700';
}

export default async function ReviewIndexPage() {
  const sessions = await getReviewSessions();

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex flex-col gap-6">
          <Link 
            href="/" 
            className="inline-flex items-center text-sm font-medium text-zinc-400 hover:text-white transition-colors w-fit group bg-zinc-900/50 px-3 py-1.5 rounded-md border border-zinc-800/50 hover:bg-zinc-800"
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Portfolio
          </Link>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Bot className="text-blue-500 w-8 h-8" />
                Agent Review Center
              </h1>
              <p className="text-zinc-400 mt-2">Validate automated onboarding runs and view extracted intelligence.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sessions.map((session) => {
            const isSuccess = session.status.includes("COMPLETED");
            const condensedTimeline = condenseSequence(session.screenSequence);

            // Ensure URI encoding in case folder name has spaces
            const safeUrl = `/review/${encodeURIComponent(session.sessionId)}`;

            return (
              <Link key={session.sessionId} href={safeUrl}>
                <Card className="bg-zinc-900/40 border-zinc-800/80 hover:border-blue-500/50 hover:bg-zinc-900/80 transition-all duration-300 h-full flex flex-col overflow-hidden group p-0">
                  
                  {/* Top Content Section */}
                  <div className="p-6 pb-4 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <Badge variant="outline" className={isSuccess ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10" : "text-amber-400 border-amber-500/20 bg-amber-500/10"}>
                        {isSuccess ? <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> : <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />}
                        {session.status.split('_')[0]}
                      </Badge>
                      <Badge variant="outline" className={cn("font-mono font-bold border", getGradeColor(session.frictionGrade))}>
                        Grade: {session.frictionGrade}
                      </Badge>
                    </div>

                    <div>
                      <h2 className="text-2xl font-bold text-white group-hover:text-blue-400 transition-colors tracking-tight">
                        {session.appName}
                      </h2>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">{session.category}</span>
                        <span className="text-zinc-700">•</span>
                        <span className="text-xs font-mono text-zinc-400">{session.totalSteps} Agent Steps</span>
                      </div>
                    </div>

                    {/* MACRO TIMELINE VISUALIZATION */}
                    <div className="mt-8 flex-1">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
                        <Activity className="w-3 h-3" />
                        Flow Timeline
                      </div>
                      
                      {condensedTimeline.length > 0 ? (
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                          {condensedTimeline.map((step, i) => (
                            <div key={i} className="flex items-center gap-1.5 shrink-0">
                              <div 
                                className={cn("text-[10px] px-2.5 py-1 rounded-md font-mono font-medium shadow-sm border", getColorClass(step.raw))} 
                                title={step.raw}
                              >
                                {step.formatted}
                              </div>
                              {i < condensedTimeline.length - 1 && (
                                <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-600 font-mono italic bg-zinc-950 p-3 rounded-md border border-zinc-800/50 inline-block">
                          No timeline data extracted.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bottom Action Footer */}
                  <div className="px-6 py-4 bg-zinc-950/60 border-t border-zinc-800/50 flex justify-between items-center group-hover:bg-blue-950/20 transition-colors mt-auto">
                    <span className="text-[10px] font-mono text-zinc-600 truncate max-w-[200px]" title={session.sessionId}>
                      {session.sessionId}
                    </span>
                    <span className="flex items-center text-sm font-medium text-blue-400 group-hover:translate-x-1 transition-transform">
                      Review Session <ArrowRight className="w-4 h-4 ml-1.5" />
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