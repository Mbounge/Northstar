// app/[companyId]/layout.tsx
import { AppSidebar } from "@/components/shell/app-sidebar";
import { InsightProvider } from "@/components/providers/insight-provider"; 
import { getReviewApps } from "@/lib/review-data";
import { createClient } from "@/lib/supabase/server";
import Image from "next/image";

// ── FORCE DYNAMIC: Ensures the sidebar reorders instantly when navigating between apps ──
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('user_profiles').select('customer_id').eq('id', user?.id).single();
  
  const apps = profile?.customer_id ? await getReviewApps(profile.customer_id) : [];

  // ── NEW: Fetch visit history and sort the apps so the sidebar matches the home page ──
  const { data: visits } = await supabase
    .from('user_app_visits')
    .select('app_name, last_visited_at')
    .eq('user_id', user?.id);

  const visitMap = new Map((visits || []).map(v => [v.app_name.toLowerCase(), v.last_visited_at]));

  if (apps.length > 0) {
    apps.sort((a, b) => {
      const timeA = visitMap.get(a.appName.toLowerCase());
      const timeB = visitMap.get(b.appName.toLowerCase());
      const dateA = timeA ? new Date(timeA).getTime() : 0;
      const dateB = timeB ? new Date(timeB).getTime() : 0;
      return dateB - dateA; 
    });
  }

  return (
    <div className="flex h-screen overflow-hidden relative font-[family-name:var(--font-geist-sans,sans-serif)] bg-[#EEF0F8] dark:bg-[#050505] text-zinc-900 dark:text-zinc-100">
      
      {/* ── AMBIENT BACKGROUND ── */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex items-center justify-center">
        <div 
          className="relative flex-shrink-0 opacity-30 dark:opacity-20 mix-blend-multiply blur-[48px]"
          style={{ 
            width: '1450px', 
            height: '1450px', 
            transform: 'rotate(310deg)',
          }}
        >
          <Image 
            src="/topaz_enhance.png" 
            alt="Ambient Background" 
            fill 
            className="object-cover -scale-x-100" 
            priority 
            quality={80}
          />
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 overflow-hidden relative z-10 flex flex-col">
        <InsightProvider>
          {children}
        </InsightProvider>
      </main>

      {/* ── RIGHT SIDEBAR ── */}
      <div className="relative z-20">
        <AppSidebar apps={apps} />
      </div>
    </div>
  );
}