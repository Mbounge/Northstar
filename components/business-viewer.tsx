//components/business-viewer.tsx

"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Briefcase, Users, Linkedin, Twitter, ExternalLink, TrendingUp, Building2, Search, Crown, Image as ImageIcon, FileText, X, CheckCircle2, Code, Gift, List, Globe, Monitor, Link as LinkIcon, ChevronRight, ArrowDownToLine } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import Image from "next/image";
import { BusinessManifest, RosterPerson, BusinessJob, BusinessPage } from "@/lib/data";

// --- HELPERS ---

const categorizeJob = (title: string) => {
  const t = title.toLowerCase();
  if (t.includes("engineer") || t.includes("developer") || t.includes("data") || t.includes("tech") || t.includes("fullstack") || t.includes("software")) return "Engineering";
  if (t.includes("sales") || t.includes("account") || t.includes("sdr") || t.includes("revenue")) return "Sales";
  if (t.includes("marketing") || t.includes("brand") || t.includes("content") || t.includes("social")) return "Marketing";
  if (t.includes("product") || t.includes("design") || t.includes("ux") || t.includes("ui")) return "Product";
  if (t.includes("hr") || t.includes("people") || t.includes("recruiter") || t.includes("talent")) return "HR";
  return "Operations";
};

const getCategoryColor = (cat: string) => {
  switch(cat) {
    case "Engineering": return "text-emerald-400 border-emerald-500/20 bg-emerald-500/10";
    case "Sales": return "text-blue-400 border-blue-500/20 bg-blue-500/10";
    case "Product": return "text-purple-400 border-purple-500/20 bg-purple-500/10";
    case "Marketing": return "text-orange-400 border-orange-500/20 bg-orange-500/10";
    default: return "text-zinc-400 border-zinc-700 bg-zinc-800";
  }
};

const isDecisionMaker = (person: RosterPerson) => {
  const text = (person.name + " " + person.role).toLowerCase();
  const keywords = [
    "ceo", "chief executive", "cto", "chief technology", "cfo", "chief financial",
    "cmo", "chief marketing", "coo", "chief operating", "cso", "chief strategy",
    "cpo", "chief product", "president", "founder", "co-founder", "vp", "vice president",
    "head of", "director", "executive", "board", "chairman", "owner", "propriétaire", "partner"
  ];
  return keywords.some(k => text.includes(k));
};

const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

// --- SMART DATA ADAPTER ---
const normalizeData = (intelligence: any) => {
  if (!intelligence) return null;
  let data = intelligence;
  if (typeof intelligence === 'string') {
    try { data = JSON.parse(intelligence); } catch (e) { return null; }
  }
  return data;
};

// --- IMAGE MATCHING ---
const findJobScreenshots = (jobTitle: string, pages: BusinessPage[]) => {
  if (!pages || pages.length === 0) return [];

  // Match Python's sanitize_filename logic
  const normalizedTitle = jobTitle
    .replace(/[\\/*?:"<>|]/g, '-') 
    .trim()
    .replace(/ /g, '_'); 
  
  const targetPrefix = `Job_${normalizedTitle}`;
  const matches: string[] = [];

  pages.forEach(page => {
    if (page.name.startsWith(targetPrefix)) {
       matches.push(...page.screenshots);
    }
  });

  return matches.sort((a, b) => {
    if (a.includes("FULLPAGE")) return -1;
    if (b.includes("FULLPAGE")) return 1;
    return 0;
  });
};

interface BusinessViewerProps {
  jobs: BusinessManifest['jobs'];
  pages: BusinessManifest['pages']; 
  roster: RosterPerson[];
  companyId: string;
  snapshotId: string; // <--- Required for dynamic paths
}

export function BusinessViewer({ jobs, pages = [], roster, companyId, snapshotId }: BusinessViewerProps) {
  const [activeTab, setActiveTab] = useState("recon"); 
  const [selectedJob, setSelectedJob] = useState<BusinessJob | null>(null);
  const [selectedPage, setSelectedPage] = useState<BusinessPage | null>(null);

  // Dynamic Path Helper
  const getImagePath = (rawPath: string) => {
    if (!rawPath) return "";
    const filename = rawPath.split('/').pop();
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data/${companyId}/snapshots/${snapshotId}/business/screenshots/${filename}`;
  };
  
  const jobStats = useMemo(() => {
    const stats: Record<string, number> = {};
    jobs.forEach(job => {
      const cat = categorizeJob(job.title);
      stats[cat] = (stats[cat] || 0) + 1;
    });
    return Object.entries(stats)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [jobs]);

  const primaryFocus = jobStats.length > 0 ? jobStats[0].name : "None";

  const siteAssets = useMemo(() => {
    return pages.filter(p => !p.name.startsWith("Job_"));
  }, [pages]);

  // --- JOB DETAIL MODAL ---
  if (selectedJob) {
    const category = categorizeJob(selectedJob.title);
    const intel = normalizeData(selectedJob.intelligence);
    const screenshots = findJobScreenshots(selectedJob.title, pages);
    
    // Normalize keys
    const responsibilities = intel?.["Key Responsibilities"] || intel?.["key_responsibilities"] || [];
    const stack = intel?.["Tech Stack"] || intel?.["tech_stack"] || [];
    const perks = intel?.["Perks"] || intel?.["perks"] || [];
    
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8" onClick={() => setSelectedJob(null)}>
        <div className="w-[85vw] h-[85vh] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
          
          <button onClick={() => setSelectedJob(null)} className="absolute top-4 right-4 z-50 p-2 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shadow-xl"><X className="w-5 h-5" /></button>
          
          {/* Left: Screenshots */}
          <div className="w-1/2 h-full bg-black border-r border-zinc-800 flex flex-col overflow-hidden relative">
             <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 text-xs font-mono text-zinc-400 text-center shrink-0">
               {screenshots.length > 0 ? `${screenshots.length} Evidence Frames Captured` : "No Visual Evidence"}
             </div>
             {/* Native Scroll for reliability */}
             <div className="flex-1 overflow-y-auto p-8">
                {screenshots.length > 0 ? (
                  <div className="flex flex-col gap-8 items-center pb-20">
                    {screenshots.map((shot, idx) => (
                      <div key={idx} className="relative w-full shadow-2xl border border-zinc-800 rounded-lg overflow-hidden">
                        <Image src={getImagePath(shot)} alt={`Evidence ${idx}`} width={800} height={1000} className="w-full h-auto object-contain" unoptimized />
                        {shot.includes("FULLPAGE") && <div className="absolute top-2 right-2 bg-emerald-500/90 text-white text-[10px] px-2 py-1 rounded font-bold shadow-lg">FULL PAGE</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                    <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-6 border border-zinc-800"><ImageIcon className="w-10 h-10 text-zinc-700" /></div>
                    <h3 className="text-zinc-500 font-medium">No Direct Screenshot Matched</h3>
                    <p className="text-zinc-600 text-xs mt-2 max-w-xs mx-auto">Could not find files matching pattern: Job_{selectedJob.title.replace(/[\\/*?:"<>|]/g, '-').replace(/ /g, '_')}</p>
                  </div>
                )}
             </div>
          </div>

          {/* Right: Intel */}
          <div className="w-1/2 h-full flex flex-col bg-zinc-950 min-h-0">
            <div className="px-8 py-8 border-b border-zinc-800 shrink-0 bg-zinc-950 pr-20">
              <div className="flex flex-col gap-4">
                <div><Badge variant="outline" className={`mb-3 ${getCategoryColor(category)}`}>{category} Department</Badge><h1 className="text-2xl font-bold text-white leading-tight">{selectedJob.title}</h1></div>
                <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono"><Building2 className="w-3 h-3" /><span>Remote / Hybrid</span><span className="text-zinc-700 mx-2">|</span><span>Detected via Careers Page</span></div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <div className="space-y-8 pb-32"> 
                {stack.length > 0 && (<div className="space-y-3"><h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2"><Code className="w-3.5 h-3.5" /> Tech Stack Identified</h4><div className="flex flex-wrap gap-2">{stack.map((tech: string, i: number) => (<Badge key={i} variant="secondary" className="bg-blue-500/10 text-blue-300 border-blue-500/20 hover:bg-blue-500/20">{tech}</Badge>))}</div></div>)}
                {responsibilities.length > 0 && (<div className="space-y-3"><h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2"><List className="w-3.5 h-3.5" /> Key Responsibilities</h4><ul className="space-y-2">{responsibilities.map((res: string, i: number) => (<li key={i} className="flex gap-3 text-sm text-zinc-300 leading-relaxed bg-zinc-900/30 p-3 rounded-lg border border-zinc-800/50"><div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />{res}</li>))}</ul></div>)}
                {perks.length > 0 && (<div className="space-y-3"><h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2"><Gift className="w-3.5 h-3.5" /> Benefits & Perks</h4><div className="grid grid-cols-1 gap-2">{perks.map((perk: string, i: number) => (<div key={i} className="flex items-center gap-2 text-xs text-zinc-400"><CheckCircle2 className="w-3 h-3 text-zinc-600" />{perk}</div>))}</div></div>)}
                {!intel && (<div className="p-5 bg-zinc-900/50 rounded-lg border border-zinc-800 text-sm text-zinc-500 italic">Raw analysis data not available.</div>)}
                
                {/* End Marker */}
                <div className="bg-zinc-900/80 border-t border-zinc-800 p-3 flex flex-col items-center gap-2 mt-8">
                   <div className="flex items-center gap-3 w-full justify-center opacity-40">
                     <div className="h-px w-12 bg-zinc-500"></div><ArrowDownToLine className="w-3 h-3 text-zinc-500" /><div className="h-px w-12 bg-zinc-500"></div>
                   </div>
                   <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-widest">End of Analysis</span>
                </div>

                <div className="pt-4 flex justify-end"><Button variant="outline" className="border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 hover:border-zinc-500 transition-all w-full h-12" onClick={() => window.open(selectedJob.url, '_blank')}>View Live Posting<ExternalLink className="ml-2 w-4 h-4" /></Button></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- SITE PAGE MODAL ---
  if (selectedPage) {
    const intel = normalizeData(selectedPage.intelligence);
    const keySections = intel?.["key_sections"] || [];
    const importantLinks = intel?.["important_links"] || [];
    const summary = intel?.["overall_summary"] || intel?.["sentiment_summary"];
    
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8" onClick={() => setSelectedPage(null)}>
        <div className="w-[85vw] h-[85vh] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
           <button onClick={() => setSelectedPage(null)} className="absolute top-4 right-4 z-50 p-2 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shadow-xl"><X className="w-5 h-5" /></button>
           
           <div className="w-1/2 h-full bg-black border-r border-zinc-800 flex flex-col overflow-hidden relative">
             <div className="flex-1 overflow-y-auto p-8">
                <div className="flex flex-col gap-8 items-center pb-20">
                  {selectedPage.screenshots.map((shot, idx) => (
                    <div key={idx} className="relative w-full shadow-2xl border border-zinc-800 rounded-lg overflow-hidden">
                      <Image src={getImagePath(shot)} alt={`Page ${idx}`} width={800} height={1000} className="w-full h-auto object-contain" unoptimized />
                    </div>
                  ))}
                </div>
             </div>
           </div>

           <div className="w-1/2 h-full flex flex-col bg-zinc-950 min-h-0">
             <div className="px-8 py-8 border-b border-zinc-800 shrink-0 bg-zinc-950 pr-20">
                <Badge variant="outline" className="mb-3 border-zinc-700 text-zinc-400">Site Reconnaissance</Badge>
                <h1 className="text-2xl font-bold text-white leading-tight">{selectedPage.name.replace(/_/g, ' ')}</h1>
                <p className="text-xs text-blue-400 font-mono mt-2 truncate">{selectedPage.url}</p>
             </div>
             
             <div className="flex-1 overflow-y-auto px-8 py-6">
                <div className="space-y-8 pb-32">
                   {summary && (<div className="space-y-3"><h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Executive Summary</h4><div className="p-5 bg-zinc-900/50 rounded-lg border border-zinc-800"><p className="text-sm text-zinc-200 leading-relaxed">{summary}</p></div></div>)}
                   {keySections.length > 0 && (<div className="space-y-3"><h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2"><List className="w-3.5 h-3.5" /> Key Sections Identified</h4><div className="grid grid-cols-1 gap-2">{keySections.map((sec: string, i: number) => (<div key={i} className="flex items-center gap-3 p-3 bg-zinc-900/30 rounded border border-zinc-800/50"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" /><span className="text-sm text-zinc-300">{sec}</span></div>))}</div></div>)}
                   {importantLinks.length > 0 && (<div className="space-y-3"><h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2"><LinkIcon className="w-3.5 h-3.5" /> Strategic Calls to Action</h4><div className="space-y-3">{importantLinks.map((link: any, i: number) => (<div key={i} className="group p-4 bg-zinc-900/30 rounded-lg border border-zinc-800 hover:border-zinc-600 transition-all"><div className="flex items-center justify-between mb-1"><span className="font-bold text-white text-sm">{link.text}</span><ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" /></div><p className="text-xs text-zinc-500">{link.reason}</p></div>))}</div></div>)}
                   
                   {!summary && keySections.length === 0 && (<div className="text-zinc-500 text-sm italic p-4 text-center">No specific intelligence metadata extracted.</div>)}

                    {/* End Marker */}
                    <div className="bg-zinc-900/80 border-t border-zinc-800 p-3 flex flex-col items-center gap-2 mt-8">
                       <div className="flex items-center gap-3 w-full justify-center opacity-40">
                         <div className="h-px w-12 bg-zinc-500"></div><ArrowDownToLine className="w-3 h-3 text-zinc-500" /><div className="h-px w-12 bg-zinc-500"></div>
                       </div>
                       <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-widest">End of Analysis</span>
                    </div>
                </div>
             </div>
           </div>
        </div>
      </div>
    );
  }

  // --- MAIN DASHBOARD VIEW ---
  return (
    <div className="h-full flex flex-col lg:flex-row gap-6 min-h-0">
      
      {/* --- LEFT: MAIN CONTENT AREA (Tabs) --- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden h-full">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-800 shrink-0">
            <TabsList className="bg-transparent h-auto p-0 gap-6">
              {/* REORDERED TABS */}
              <TabsTrigger value="recon" className="data-[state=active]:bg-transparent data-[state=active]:text-purple-400 data-[state=active]:border-b-2 data-[state=active]:border-purple-400 rounded-none px-0 py-3 text-zinc-400 hover:text-zinc-200 transition-colors">Site Intelligence</TabsTrigger>
              <TabsTrigger value="hiring" className="data-[state=active]:bg-transparent data-[state=active]:text-emerald-400 data-[state=active]:border-b-2 data-[state=active]:border-emerald-400 rounded-none px-0 py-3 text-zinc-400 hover:text-zinc-200 transition-colors">Hiring Strategy</TabsTrigger>
              <TabsTrigger value="org" className="data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:border-b-2 data-[state=active]:border-blue-400 rounded-none px-0 py-3 text-zinc-400 hover:text-zinc-200 transition-colors">Organization Chart</TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: SITE INTELLIGENCE */}
          <TabsContent value="recon" className="flex-1 mt-0 overflow-hidden">
             <ScrollArea className="h-full p-1">
               <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 pt-4 pb-20">
                  {siteAssets.map((page, i) => (
                    <Card key={i} className="bg-zinc-900/30 border-zinc-800 hover:border-purple-500/50 transition-all cursor-pointer group overflow-hidden" onClick={() => setSelectedPage(page)}>
                      <div className="h-48 relative bg-black border-b border-zinc-800">
                         {page.screenshots && page.screenshots.length > 0 ? (
                           <Image src={getImagePath(page.screenshots[0])} alt={page.name} fill className="object-cover opacity-80 group-hover:opacity-100 transition-opacity object-top" unoptimized />
                         ) : <div className="flex items-center justify-center h-full text-zinc-700">No Preview</div>}
                      </div>
                      <CardHeader className="p-4">
                        <CardTitle className="text-sm font-medium text-zinc-200 group-hover:text-purple-400 transition-colors truncate">{page.name.replace(/_/g, ' ')}</CardTitle>
                        <div className="flex items-center gap-2 mt-2">
                           <Badge variant="secondary" className="text-[10px] bg-zinc-950 text-zinc-500 border-zinc-800">{page.screenshots.length} Screens</Badge>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
               </div>
             </ScrollArea>
          </TabsContent>

          {/* TAB 2: HIRING */}
          <TabsContent value="hiring" className="flex-1 mt-0 overflow-hidden flex flex-col pt-4">
             <div className="flex-1 border border-zinc-800 rounded-xl bg-zinc-950 overflow-hidden flex flex-col min-h-0">
                <div className="grid grid-cols-12 gap-4 p-4 border-b border-zinc-800 bg-zinc-900/50 text-xs font-medium text-zinc-500 uppercase tracking-wider shrink-0">
                  <div className="col-span-6">Role Title</div>
                  <div className="col-span-3">Department</div>
                  <div className="col-span-3 text-right">Action</div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="flex flex-col">
                    {jobs.map((job, i) => {
                      const category = categorizeJob(job.title);
                      return (
                        <div key={i} className="grid grid-cols-12 gap-4 p-4 border-b border-zinc-800/50 hover:bg-zinc-900/30 transition-colors items-center group cursor-pointer" onClick={() => setSelectedJob(job)}>
                          <div className="col-span-6">
                            <div className="font-medium text-zinc-200 text-sm truncate" title={job.title}>{job.title}</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1"><Building2 className="w-3 h-3" /> Remote / Hybrid</div>
                          </div>
                          <div className="col-span-3"><Badge variant="outline" className={`text-[10px] h-5 ${getCategoryColor(category)}`}>{category}</Badge></div>
                          <div className="col-span-3 text-right"><Badge variant="secondary" className="bg-zinc-900 text-zinc-500 group-hover:text-white transition-colors">View Intel</Badge></div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
          </TabsContent>

          {/* TAB 3: ORG CHART */}
          <TabsContent value="org" className="flex-1 mt-0 overflow-hidden">
            <ScrollArea className="h-full p-1">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 pb-20 pt-4">
                {roster.map((person, i) => {
                  const isVIP = isDecisionMaker(person);
                  return (
                    <Card key={i} className={`bg-zinc-950 border transition-all group ${isVIP ? 'border-yellow-500/20 bg-yellow-500/5' : 'border-zinc-800 hover:border-zinc-700'}`}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 font-bold text-lg">{getInitials(person.name)}</div>
                          <div className="flex gap-1">{person.socials?.linkedin && <Linkedin className="w-4 h-4 text-blue-500 opacity-50 group-hover:opacity-100 transition-opacity" />}</div>
                        </div>
                        <h3 className="font-bold text-white truncate">{person.name}</h3>
                        <p className="text-xs text-zinc-400 truncate mb-4">{person.role}</p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary" className="bg-zinc-900 text-zinc-500 border-zinc-800 text-[10px]">{person.type}</Badge>
                          {isVIP && <Badge variant="outline" className="border-yellow-500/30 text-yellow-500 text-[10px] flex items-center gap-1"><Crown className="w-3 h-3" /> Decision Maker</Badge>}
                        </div>
                        {person.socials?.linkedin && (<Button variant="ghost" className="w-full mt-4 h-8 text-xs text-zinc-500 hover:text-white hover:bg-zinc-900" onClick={() => window.open(person.socials?.linkedin, '_blank')}>View Profile <ExternalLink className="ml-2 w-3 h-3" /></Button>)}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {/* --- RIGHT: SIDEBAR (Metrics Only) --- */}
      <div className="w-full lg:w-80 flex flex-col gap-4 shrink-0 overflow-y-auto pb-20 min-h-0">
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-zinc-900/30 border-zinc-800"><CardContent className="p-4"><div className="text-2xl font-bold text-white">{roster.length}</div><p className="text-[10px] text-zinc-500 uppercase">Headcount</p></CardContent></Card>
          <Card className="bg-zinc-900/30 border-zinc-800"><CardContent className="p-4"><div className="text-2xl font-bold text-white">{jobs.length}</div><p className="text-[10px] text-zinc-500 uppercase">Open Roles</p></CardContent></Card>
        </div>
        <Card className="bg-zinc-900/20 border-zinc-800 shrink-0">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Hiring Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={jobStats} layout="vertical" margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a' }} itemStyle={{ color: '#fff' }} cursor={{fill: '#27272a'}} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                    {jobStats.map((entry, index) => (<Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#3f3f46'} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 pt-3 border-t border-zinc-800 text-xs text-zinc-400">Primary Focus: <span className="text-emerald-400 font-bold ml-1">{primaryFocus}</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}