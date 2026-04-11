// //app/dashboard/[companyId]/product/page.tsx

// import { getDashboardData, getAvailableSnapshots } from "@/lib/data";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import { Badge } from "@/components/ui/badge";
// import { Smartphone, Globe } from "lucide-react";
// import { MobileTabsViewer } from "@/components/mobile-tabs-viewer";
// import { WebFlowViewer } from "@/components/web-flow-viewer";
// import { DiffTrigger } from "@/components/diff-trigger";
// import { SnapshotSelector } from "@/components/snapshot-selector";
// import { DeltaViewer } from "@/components/delta-viewer";

// export default async function ProductPage({ 
//   params, 
//   searchParams 
// }: { 
//   params: Promise<{ companyId: string }>;
//   searchParams: Promise<{ snapshot?: string }>;
// }) {
//   const { companyId } = await params;
//   const { snapshot } = await searchParams;

//   const snapshots = await getAvailableSnapshots(companyId);
//   const activeSnapshotId = snapshot || snapshots[0] || "";
//   const data = await getDashboardData(companyId, activeSnapshotId);
  
//   const mobileData = data?.mobile;
//   const webData = data?.web;
//   const snapshotId = data?.snapshotId || "";
//   const deltaReport = data?.deltaReport;

//   if (!data) {
//     return <div className="p-10 text-zinc-500">No data found for {companyId}</div>;
//   }

//   return (
//     // CHANGED: Removed h-[calc(100vh-6rem)] and overflow-hidden. Added pb-20 for scrolling space.
//     <div className="space-y-6 pb-20">
      
//       {/* Header */}
//       <div className="flex items-center justify-between">
//         <div>
//           <h2 className="text-2xl font-bold text-white flex items-center gap-2">
//             Product Intelligence
//           </h2>
//           <p className="text-zinc-400 text-sm">Comprehensive analysis of application architecture and user flows.</p>
//         </div>
        
//         <div className="flex items-center gap-3">
//           <SnapshotSelector snapshots={snapshots} currentSnapshot={snapshotId} />
//           <DiffTrigger companyId={companyId} />
//         </div>
//       </div>

//       {/* DELTA VIEWER */}
//       {deltaReport && (
//         <div className="animate-in slide-in-from-top-2 fade-in duration-500">
//           <DeltaViewer report={deltaReport} />
//         </div>
//       )}

//       {/* Main Switcher */}
//       <Tabs defaultValue="mobile" className="flex flex-col gap-6">
//         <div className="flex items-center justify-between border-b border-zinc-800">
//           <TabsList className="bg-transparent h-auto p-0 gap-6">
//             <TabsTrigger 
//               value="mobile"
//               className="data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:border-b-2 data-[state=active]:border-blue-400 rounded-none px-0 py-3 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-2"
//             >
//               <Smartphone className="w-4 h-4" />
//               Mobile App
//               <Badge variant="secondary" className="ml-2 bg-zinc-800 text-[10px] text-zinc-400">
//                 {mobileData?.tabs.length || 0} TABS
//               </Badge>
//             </TabsTrigger>
//             <TabsTrigger 
//               value="web"
//               className="data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:border-b-2 data-[state=active]:border-blue-400 rounded-none px-0 py-3 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-2"
//             >
//               <Globe className="w-4 h-4" />
//               Web Platform
//               <Badge variant="secondary" className="ml-2 bg-zinc-800 text-[10px] text-zinc-400">
//                 {webData?.length || 0} FLOWS
//               </Badge>
//             </TabsTrigger>
//           </TabsList>
//         </div>

//         {/* Content Area - CHANGED: Removed overflow-hidden to allow page scroll */}
//         <div>
//           <TabsContent value="mobile" className="mt-0">
//             {mobileData ? (
//               <MobileTabsViewer 
//                 tabs={mobileData.tabs} 
//                 companyId={companyId} 
//                 snapshotId={snapshotId} 
//               />
//             ) : (
//               <div className="p-10 text-zinc-500 flex flex-col items-center justify-center h-64 border border-zinc-800 border-dashed rounded-xl">
//                 <Smartphone className="w-8 h-8 text-zinc-700 mb-2" />
//                 <p>No Mobile Intelligence captured for {snapshotId}</p>
//               </div>
//             )}
//           </TabsContent>

//           <TabsContent value="web" className="mt-0">
//             {webData ? (
//               <WebFlowViewer 
//                 flows={webData} 
//                 companyId={companyId} 
//                 snapshotId={snapshotId} 
//               />
//             ) : (
//               <div className="p-10 text-zinc-500 flex flex-col items-center justify-center h-64 border border-zinc-800 border-dashed rounded-xl">
//                 <Globe className="w-8 h-8 text-zinc-700 mb-2" />
//                 <p>No Web Intelligence captured for {snapshotId}</p>
//               </div>
//             )}
//           </TabsContent>
//         </div>
//       </Tabs>
//     </div>
//   );
// }