// // app/review/[sessionId]/page.tsx
// import { getAppDetails } from "@/lib/review-data";
// import Link from "next/link";
// import { ArrowLeft } from "lucide-react";
// import { UnifiedDashboard } from "@/components/unified-dashboard";

// export default async function AppReviewPage({ params }: { params: Promise<{ sessionId: string }> }) {
//   const resolvedParams = await params;
  
//   // FIX: We use 'sessionId' here because that is your folder name in Next.js!
//   // In our new structure, the URL is /review/NCSA, so this variable holds "NCSA".
//   const appName = decodeURIComponent(resolvedParams.sessionId);
  
//   const appData = await getAppDetails(appName);

//   if (!appData || (!appData.onboarding && !appData.browsing)) {
//     return (
//       <div className="h-screen flex flex-col items-center justify-center bg-zinc-950 text-white space-y-4">
//         <h2 className="text-xl font-bold text-rose-400">App Data Not Found</h2>
//         <p className="text-zinc-500">Could not find data for: <span className="font-mono text-zinc-300">{appName}</span></p>
//         <Link href="/review" className="mt-4 text-blue-400 hover:underline flex items-center gap-2">
//           <ArrowLeft className="w-4 h-4" /> Back to Review Center
//         </Link>
//       </div>
//     );
//   }

//   return <UnifiedDashboard appData={appData} />;
// }