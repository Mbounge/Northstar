// components/business-viewer.tsx
"use client";

import { useState } from "react";
import { Linkedin, Briefcase, X, Loader2, ImageIcon, Globe, Check, Code, ShieldCheck, Gift } from "lucide-react";
import { BusinessJob, RosterPerson } from "@/lib/data";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

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

interface BusinessViewerProps {
  jobs: BusinessJob[];
  roster: RosterPerson[];
  companyId: string;
  snapshotId: string;
  tenantId: string;
  businessScreenshots?: string[]; // List of screenshot filenames from Storage
}

export function BusinessViewer({ 
  jobs = [], 
  roster = [], 
  companyId, 
  snapshotId,
  tenantId,
  businessScreenshots = []
}: BusinessViewerProps) {
  const [selectedJob, setSelectedJob] = useState<BusinessJob | null>(null);

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  // ─── FUZZY SCREENSHOT MATCHER ───
  const getJobScreenshot = (job: BusinessJob) => {
    if (!job || !businessScreenshots || businessScreenshots.length === 0) return null;
    
    // Normalise the job title (remove spaces, symbols, and lowercase)
    const cleanTitle = job.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    const matchedFile = businessScreenshots.find(f => {
      const cleanFilename = f.toLowerCase().replace(/[^a-z0-9]/g, '');
      return cleanFilename.includes(cleanTitle);
    });
    
    return matchedFile ? `business/screenshots/${matchedFile}` : null;
  };

  const getJobImagePath = (rawPath: string) => {
    if (!rawPath) return "";
    const filename = rawPath.split("/").pop();
    const safeCompanyId = companyId.toLowerCase();
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data/${tenantId}/${safeCompanyId}/snapshots/${snapshotId}/business/screenshots/${filename}`;
  };

  const activeScreenshot = getJobScreenshot(selectedJob as BusinessJob);
  const intel = selectedJob?.intelligence || {};

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
                <div 
                  key={i} 
                  onClick={() => setSelectedJob(job)}
                  className="flex items-center justify-between py-4 border-b border-black/5 dark:border-white/10 last:border-0 group cursor-pointer hover:bg-white/30 dark:hover:bg-white/5 -mx-2 px-2 rounded-xl transition-colors"
                >
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

      {/* ── UPGRADED DOUBLE-PANE JOB DETAILS MODAL ── */}
      {selectedJob && (
        <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
          <DialogContent 
            className="w-full p-0 overflow-hidden bg-white dark:bg-[#0d0d0d] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] [&>button]:hidden animate-in fade-in zoom-in-95 duration-200"
            style={{ maxWidth: '1152px', width: '90vw' }} // FORCED INLINE STYLE BYPASS
          >
            <VisuallyHidden><DialogTitle>{selectedJob.title}</DialogTitle></VisuallyHidden>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center shrink-0">
                  <Briefcase className="w-5 h-5 text-[#0066FF]" />
                </div>
                <div>
                  <h3 className="font-bold text-[16px] text-zinc-900 dark:text-white leading-tight">{selectedJob.title}</h3>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" /> Full-Page Job Listing Capture
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Double-Pane Split View */}
            <div className="flex-1 flex min-h-0 overflow-hidden bg-zinc-50 dark:bg-black/20">
              
              {/* Left Pane (38% width): Extracted Technical Intelligence */}
              <div className="w-[38%] border-r border-zinc-200 dark:border-zinc-800 p-8 overflow-y-auto space-y-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                
                {/* Tech Stack */}
                {intel.tech_stack && intel.tech_stack.length > 0 && (
                  <div className="bg-white/50 dark:bg-white/[0.02] border border-zinc-200/60 dark:border-white/[0.04] p-5 rounded-xl space-y-3.5 shadow-sm">
                    <h4 className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Code className="w-3.5 h-3.5 text-[#0066FF]" /> Tech Stack
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {intel.tech_stack.map((tech: string, idx: number) => (
                        <span key={idx} className="px-3 py-1 text-[11.5px] font-medium bg-[#0066FF]/10 text-[#0066FF] border border-[#0066FF]/20 rounded-md">
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key Responsibilities */}
                {intel.key_responsibilities && intel.key_responsibilities.length > 0 && (
                  <div className="bg-white/50 dark:bg-white/[0.02] border border-zinc-200/60 dark:border-white/[0.04] p-5 rounded-xl space-y-3.5 shadow-sm">
                    <h4 className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Key Responsibilities
                    </h4>
                    <ul className="space-y-2.5">
                      {intel.key_responsibilities.map((resp: string, idx: number) => (
                        <li key={idx} className="text-[13px] text-zinc-700 dark:text-zinc-300 leading-relaxed flex gap-2.5 items-start">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-2.5" />
                          <span>{resp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Perks & Benefits */}
                {intel.perks && intel.perks.length > 0 && (
                  <div className="bg-white/50 dark:bg-white/[0.02] border border-zinc-200/60 dark:border-white/[0.04] p-5 rounded-xl space-y-3.5 shadow-sm">
                    <h4 className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Gift className="w-3.5 h-3.5 text-purple-500" /> Perks & Benefits
                    </h4>
                    <ul className="space-y-2.5">
                      {intel.perks.map((perk: string, idx: number) => (
                        <li key={idx} className="text-[13px] text-zinc-700 dark:text-zinc-300 leading-relaxed flex gap-2.5 items-start">
                          <Check className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                          <span>{perk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!intel.tech_stack && !intel.key_responsibilities && !intel.perks && (
                  <div className="py-12 text-center text-[12.5px] text-zinc-500 italic">
                    Analyzing roles and technical parameters in background...
                  </div>
                )}

              </div>

              {/* Right Pane (62% width): Large, Scrollable Full-Page Screenshot */}
              <div className="flex-1 p-8 overflow-y-auto select-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {activeScreenshot ? (
                  <div className="relative border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl overflow-hidden bg-white dark:bg-zinc-950">
                    <img 
                      src={getJobImagePath(activeScreenshot)} 
                      alt={selectedJob.title} 
                      className="w-full h-auto object-cover object-top block"
                    />
                  </div>
                ) : (
                  <div className="py-24 text-center flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500">
                    <ImageIcon className="w-10 h-10 opacity-40 mb-3" />
                    <p className="text-[14px]">No screenshot captured for this role.</p>
                  </div>
                )}
              </div>

            </div>

            {/* Footer with External Link */}
            {selectedJob.url && (
              <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end shrink-0">
                <a
                  href={selectedJob.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#0066FF] hover:underline"
                >
                  View Job Post on Company Site
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}