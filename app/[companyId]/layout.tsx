//app/[companyId]/layout.tsx
import { AppSidebar } from "@/components/shell/app-sidebar";
import { InsightProvider } from "@/components/providers/insight-provider"; 
import { getReviewApps } from "@/lib/review-data";
import { createClient } from "@/lib/supabase/server";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('user_profiles').select('customer_id').eq('id', user?.id).single();
  
  const apps = profile?.customer_id ? await getReviewApps(profile.customer_id) : [];

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
    // CHANGED: Switched to h-screen w-screen to allow layering
    <div className="h-screen w-screen overflow-hidden relative font-[family-name:var(--font-geist-sans,sans-serif)] bg-[#EEF0F8] dark:bg-[#050505] text-zinc-900 dark:text-zinc-100">
      
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
      {/* CHANGED: Now spans the entire width absolutely, removing the visual cut */}
      <main 
        className="absolute inset-0 z-10 overflow-y-auto overflow-x-hidden flex flex-col scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{
          WebkitMaskImage: "linear-gradient(black, black)",
          maskImage: "linear-gradient(black, black)",
        }}
      >
        <InsightProvider>
          {children}
        </InsightProvider>
      </main>

      {/* ── FLOATING RIGHT SIDEBAR ── */}
      {/* CHANGED: Floats on top of the main content on the right edge */}
      <div className="absolute right-0 top-0 bottom-0 z-40 pointer-events-none flex justify-end">
        <div className="pointer-events-auto h-full">
          <AppSidebar apps={apps} />
        </div>
      </div>
    </div>
  );
}