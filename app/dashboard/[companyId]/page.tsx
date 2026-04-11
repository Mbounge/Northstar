// //app/dashboard/[companyId]/page.tsx

// import { getDashboardData, getAvailableSnapshots } from "@/lib/data";
// import { Card, CardContent } from "@/components/ui/card";
// import { Badge } from "@/components/ui/badge";
// import { Smartphone, Megaphone, Briefcase, Terminal, Activity } from "lucide-react";
// import Link from "next/link";
// import { ReportButton } from "@/components/report-button";
// import { InsightFeed } from "@/components/insight-feed"; 
// import { SnapshotSelector } from "@/components/snapshot-selector";

// export default async function DashboardPage({ 
//   params,
//   searchParams 
// }: { 
//   params: Promise<{ companyId: string }>;
//   searchParams: Promise<{ snapshot?: string }>;
// }) {
//   const { companyId } = await params;
//   const { snapshot } = await searchParams;

//   // 1. Time Machine Logic
//   const snapshots = await getAvailableSnapshots(companyId);
//   const activeSnapshotId = snapshot || snapshots[0] || "";
  
//   // 2. Load Data for Specific Snapshot
//   const data = await getDashboardData(companyId, activeSnapshotId);

//   if (!data || !data.mobile) return <div className="text-zinc-500 p-10">Initializing...</div>;

//   // 3. Calculate Metrics for this specific point in time
//   const mobileScreens = data.mobile.tabs.reduce((acc, tab) => acc + tab.survey_screenshots.length, 0);
//   const webScreens = data.web?.reduce((acc, flow) => acc + flow.screenshots.length, 0) || 0;
//   const totalProductAssets = mobileScreens + webScreens;

//   const socialPosts = data.marketing?.length || 0;
//   const openJobs = data.business?.jobs.length || 0;

//   const queryParams = activeSnapshotId ? `?snapshot=${activeSnapshotId}` : "";

//   return (
//     <div className="space-y-6 pb-20">
      
//       {/* 1. HEADER */}
//       <div className="flex items-center justify-between shrink-0">
//         <div>
//           <h2 className="text-2xl font-bold text-white flex items-center gap-3">
//             <span className="bg-zinc-900 p-1.5 rounded text-emerald-500"><Terminal className="w-5 h-5" /></span>
//             Target: {data.mobile.app || companyId}
//           </h2>
//           <p className="text-zinc-500 text-xs font-mono mt-1 ml-1 flex items-center gap-2">
//             SNAPSHOT ID: <span className="text-zinc-300">{activeSnapshotId}</span>
//           </p>
//         </div>
        
//         <div className="flex gap-3 items-center">
//           <SnapshotSelector snapshots={snapshots} currentSnapshot={activeSnapshotId} />
//           <ReportButton companyId={companyId} />
//           <Badge variant="outline" className="px-3 py-1 border-emerald-500/20 text-emerald-500 bg-emerald-500/5">
//             <Activity className="w-3 h-3 mr-2 animate-pulse" /> LIVE
//           </Badge>
//         </div>
//       </div>

//       {/* 2. METRICS ROW */}
//       <div className="grid grid-cols-3 gap-4 shrink-0">
//         <Link href={`/dashboard/${companyId}/product${queryParams}`}>
//           <Card className="bg-zinc-900/20 border-zinc-800 hover:border-blue-500/30 transition-colors group cursor-pointer">
//             <CardContent className="p-4 flex items-center justify-between">
//               <div>
//                 <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-1">Product Assets</p>
//                 <div className="text-2xl font-bold text-white group-hover:text-blue-400 transition-colors">{totalProductAssets}</div>
//               </div>
//               <Smartphone className="w-5 h-5 text-zinc-700 group-hover:text-blue-500 transition-colors" />
//             </CardContent>
//           </Card>
//         </Link>

//         <Link href={`/dashboard/${companyId}/marketing${queryParams}`}>
//           <Card className="bg-zinc-900/20 border-zinc-800 hover:border-orange-500/30 transition-colors group cursor-pointer">
//             <CardContent className="p-4 flex items-center justify-between">
//               <div>
//                 <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-1">Signals Captured</p>
//                 <div className="text-2xl font-bold text-white group-hover:text-orange-400 transition-colors">{socialPosts}</div>
//               </div>
//               <Megaphone className="w-5 h-5 text-zinc-700 group-hover:text-orange-500 transition-colors" />
//             </CardContent>
//           </Card>
//         </Link>

//         <Link href={`/dashboard/${companyId}/business${queryParams}`}>
//           <Card className="bg-zinc-900/20 border-zinc-800 hover:border-purple-500/30 transition-colors group cursor-pointer">
//             <CardContent className="p-4 flex items-center justify-between">
//               <div>
//                 <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-1">Open Positions</p>
//                 <div className="text-2xl font-bold text-white group-hover:text-purple-400 transition-colors">{openJobs}</div>
//               </div>
//               <Briefcase className="w-5 h-5 text-zinc-700 group-hover:text-purple-500 transition-colors" />
//             </CardContent>
//           </Card>
//         </Link>
//       </div>

//       {/* 3. MAIN FEED - PASSING SNAPSHOT ID */}
//       <div className="flex-1 min-h-0">
//          <InsightFeed companyId={companyId} snapshotId={activeSnapshotId} />
//       </div>

//     </div>
//   );
// }