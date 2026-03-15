//app/dashboard/[companyId]/layout.tsx

import { Sidebar } from "@/components/shell/sidebar";
import { AnalystChat } from "@/components/analyst-chat";
import { InsightProvider } from "@/components/providers/insight-provider"; 

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      <Sidebar companyId={companyId} />
      
      <main className="flex-1 overflow-y-auto p-6 relative">
        {/* Wrap content in the Provider */}
        <InsightProvider>
          {children}
          <AnalystChat companyId={companyId} />
        </InsightProvider>
      </main>
    </div>
  );
}