// components/business-viewer.tsx
"use client";

import { Linkedin, Briefcase } from "lucide-react";
import { BusinessJob, RosterPerson } from "@/lib/data";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-zinc-500 dark:text-zinc-400 mb-4">
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <SectionLabel>Headcount Tracked</SectionLabel>
          <div className="text-3xl font-bold text-zinc-900 dark:text-white font-mono">{roster.length}</div>
        </Card>
        <Card>
          <SectionLabel>Open Positions</SectionLabel>
          <div className="text-3xl font-bold text-zinc-900 dark:text-white font-mono">{jobs.length}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* ── KEY PERSONNEL ── */}
        <div>
          <SectionLabel>Key Personnel</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {roster.map((person, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-zinc-50/50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800/80 rounded-lg group hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
                <div className="w-10 h-10 rounded-full bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500 dark:text-zinc-400 shrink-0 shadow-sm">
                  {getInitials(person.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-zinc-900 dark:text-white truncate">
                    {person.name}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono truncate uppercase tracking-wider mt-0.5">
                    {person.role}
                  </div>
                </div>
                {person.socials?.linkedin && (
                  <a href={person.socials.linkedin} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                    <Linkedin className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))}
            {roster.length === 0 && <p className="text-[13px] font-mono text-zinc-400 italic">No personnel data extracted.</p>}
          </div>
        </div>

        {/* ── OPEN ROLES ── */}
        <div>
          <SectionLabel>Hiring Velocity & Roles</SectionLabel>
          <Card>
            <div className="space-y-1">
              {jobs.map((job, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 group cursor-pointer">
                  <div className="flex items-center gap-3 min-w-0">
                    <Briefcase className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors shrink-0" />
                    <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors truncate">
                      {job.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <span className="px-2 py-1 rounded bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 text-[9px] uppercase tracking-wider font-bold">
                      Remote / Hybrid
                    </span>
                  </div>
                </div>
              ))}
              {jobs.length === 0 && <p className="text-[13px] font-mono text-zinc-400 italic">No job openings detected.</p>}
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}