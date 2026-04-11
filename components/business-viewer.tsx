// components/business-viewer.tsx
"use client";

import { Linkedin, Briefcase } from "lucide-react";
import { BusinessJob, RosterPerson } from "@/lib/data";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold tracking-[0.15em] uppercase text-zinc-600 dark:text-zinc-400 mb-4">
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white/40 dark:bg-black/30 backdrop-blur-2xl border border-white/60 dark:border-white/10 rounded-[24px] p-6 shadow-xl transition-all duration-300">
      {children}
    </div>
  );
}

export function BusinessViewer({ 
  jobs = [], 
  roster = [], 
  companyId, 
  snapshotId 
}: { 
  jobs: BusinessJob[], 
  roster: RosterPerson[],
  companyId?: string,
  snapshotId?: string
}) {
  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12 font-sans animate-in fade-in duration-300">
      
      {/* ── METRICS ROW ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <SectionLabel>Headcount Tracked</SectionLabel>
          <div className="text-4xl font-bold text-zinc-900 dark:text-white font-mono">{roster.length}</div>
        </Card>
        <Card>
          <SectionLabel>Open Positions</SectionLabel>
          <div className="text-4xl font-bold text-zinc-900 dark:text-white font-mono">{jobs.length}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* ── KEY PERSONNEL ── */}
        <div>
          <SectionLabel>Key Personnel</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {roster.map((person, i) => (
              <div key={i} className="flex items-center gap-4 p-4 bg-white/50 dark:bg-white/5 backdrop-blur-md border border-white/60 dark:border-white/10 rounded-2xl group hover:bg-white/70 dark:hover:bg-white/10 transition-colors shadow-sm">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40 border border-white/80 dark:border-white/20 flex items-center justify-center text-sm font-bold text-blue-700 dark:text-blue-300 shrink-0 shadow-inner">
                  {getInitials(person.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold text-zinc-900 dark:text-white truncate">
                    {person.name}
                  </div>
                  <div className="text-[11px] text-zinc-600 dark:text-zinc-400 font-mono truncate uppercase tracking-wider mt-1 font-semibold">
                    {person.role}
                  </div>
                </div>
                {person.socials?.linkedin && (
                  <a href={person.socials.linkedin} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    <Linkedin className="w-5 h-5" />
                  </a>
                )}
              </div>
            ))}
            {roster.length === 0 && <p className="text-[14px] font-mono text-zinc-500 italic bg-white/40 dark:bg-white/5 backdrop-blur-md border border-white/60 dark:border-white/10 p-6 rounded-2xl">No personnel data extracted.</p>}
          </div>
        </div>

        {/* ── OPEN ROLES ── */}
        <div>
          <SectionLabel>Hiring Velocity & Roles</SectionLabel>
          <Card>
            <div className="space-y-2">
              {jobs.map((job, i) => (
                <div key={i} className="flex items-center justify-between py-4 border-b border-black/5 dark:border-white/10 last:border-0 group cursor-pointer hover:bg-white/30 dark:hover:bg-white/5 -mx-2 px-2 rounded-xl transition-colors">
                  <div className="flex items-center gap-4 min-w-0">
                    <Briefcase className="w-4 h-4 text-zinc-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors shrink-0" />
                    <span className="text-[14px] font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors truncate">
                      {job.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <span className="px-3 py-1.5 rounded-lg bg-white/60 dark:bg-white/10 border border-white/80 dark:border-white/20 text-zinc-600 dark:text-zinc-300 text-[10px] uppercase tracking-wider font-bold shadow-sm backdrop-blur-md">
                      Remote / Hybrid
                    </span>
                  </div>
                </div>
              ))}
              {jobs.length === 0 && <p className="text-[14px] font-mono text-zinc-500 italic">No job openings detected.</p>}
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}