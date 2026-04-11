// app/[companyId]/layout.tsx
import { AppSidebar } from "@/components/shell/app-sidebar";
import { InsightProvider } from "@/components/providers/insight-provider"; 
import { getReviewApps } from "@/lib/review-data";
import { createClient } from "@/lib/supabase/server";
import Image from "next/image";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('user_profiles').select('customer_id').eq('id', user?.id).single();
  
  const apps = profile?.customer_id ? await getReviewApps(profile.customer_id) : [];

  return (
    <div className="flex h-screen overflow-hidden relative font-[family-name:var(--font-geist-sans,sans-serif)] bg-[#EEF0F8] dark:bg-[#050505] text-zinc-900 dark:text-zinc-100">
      
      {/* ── AMBIENT BACKGROUND ── */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex items-center justify-center">
        <div className="relative w-[1372px] h-[676px]">
          <div className="absolute w-[1814px] h-[1814px] top-[-673px] left-[-398px] -rotate-[123.61deg] opacity-30 dark:opacity-20 mix-blend-multiply blur-[48px]">
            <Image
              src="/topaz_enhance.png"
              alt=""
              fill
              className="object-cover"
              priority
              quality={80}
            />
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 overflow-hidden relative z-10 flex flex-col">
        <InsightProvider>
          {children}
        </InsightProvider>
      </main>

      {/* ── RIGHT SIDEBAR ── */}
      <div className="relative z-20 border-l border-white/30 dark:border-white/10 bg-white/20 dark:bg-black/20 backdrop-blur-xl">
        <AppSidebar apps={apps} />
      </div>
    </div>
  );
}