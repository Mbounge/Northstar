// app/[companyId]/layout.tsx
import { AppSidebar } from "@/components/shell/app-sidebar";
import { InsightProvider } from "@/components/providers/insight-provider"; 
import { getReviewApps } from "@/lib/review-data";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch real apps directly from Supabase
  const apps = await getReviewApps();

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-[#0a0a0a] transition-colors duration-300">
      {/* Pass the dynamic apps into our new sidebar */}
      <AppSidebar apps={apps} />
      
      <main className="flex-1 overflow-hidden relative flex flex-col">
        <InsightProvider>
          {children}
        </InsightProvider>
      </main>
    </div>
  );
}