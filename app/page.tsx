// app/page.tsx
import Link from "next/link";
import Image from "next/image";
import { getReviewApps } from "@/lib/review-data";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Unbounded } from "next/font/google";
import { ThemeToggle } from "@/components/theme-toggle";
import { AskBar } from "@/components/ask-bar";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { AddCompetitorModal } from "@/components/add-competitor-modal"; // <-- IMPORT NEW MODAL

const unbounded = Unbounded({ subsets: ["latin"], weight: ["200", "300", "400", "600", "700"] });

export default async function PortfolioPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, customer_id')
    .eq('id', user?.id)
    .single();

  const tenantId = profile?.customer_id;
  const apps = tenantId ? await getReviewApps(tenantId) : [];

  const { data: visits } = await supabase
    .from('user_app_visits')
    .select('app_name, last_visited_at')
    .eq('user_id', user?.id);

  const visitMap = new Map((visits || []).map(v => [v.app_name.toLowerCase(), v.last_visited_at]));

  const userEmail = user?.email || "kroni@graent.com";
  const userInitial = userEmail.charAt(0).toUpperCase();
  const userName = userEmail.split('@')[0];

  return (
    <div className="relative min-h-screen bg-[#EEF0F8] dark:bg-[#09090b] flex flex-col overflow-hidden font-sans">

      {/* ── AMBIENT BACKGROUND ── */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex items-center justify-center">
        <div 
          className="relative flex-shrink-0"
          style={{ width: '1450px', height: '1450px', transform: 'rotate(310deg)', opacity: 0.3, mixBlendMode: "multiply", filter: "blur(48px)" }}
        >
          <Image src="/topaz_enhance.png" alt="Ambient Background" fill className="object-cover -scale-x-100" priority quality={80} />
        </div>
      </div>

      {/* ── HEADER ── */}
      <header className="relative z-10 w-full px-8 pt-9 pb-0 flex items-start justify-between box-border">
        <h1 className={`${unbounded.className} text-[30px] font-semibold tracking-tight text-[#0A0A0A] dark:text-white mb-5`}>
          North Star
        </h1>
        <ThemeToggle />
      </header>

      {/* ── WRAPPER FOR TABS & GRID ── */}
      <div className="w-full pl-[200px] pr-16 box-border relative z-10 flex-1 flex flex-col">

        {/* Row 2: Tabs */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex flex-row items-center gap-8"> 
            <button className="h-[49px] px-4 flex items-center justify-center bg-white/50 hover:bg-white/70 transition-colors duration-200 ease-in-out border-none text-[16px] font-bold text-black dark:text-white cursor-pointer whitespace-nowrap rounded-none">
              Recently viewed
            </button>
            {["Direct", "Indirect", "Top Apps"].map((tab) => (
              <button key={tab} className="bg-transparent border-none p-0 text-[16px] font-medium text-black dark:text-white/70 cursor-pointer whitespace-nowrap hover:opacity-70 transition-opacity duration-200">
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* ── MAIN GRID ── */}
        <main className="flex-1 w-full pb-40 box-border">
          <div className="grid grid-cols-4 gap-6">
            {apps.map((app) => {
              const lastVisited = visitMap.get(app.appName.toLowerCase());
              const visitedString = lastVisited ? `Visited ${formatDistanceToNow(new Date(lastVisited), { addSuffix: true })}` : "Not visited yet";
              
              return (
                <Link key={app.appName} href={`/${app.appName}`} className="relative w-full h-[210px] overflow-hidden block no-underline shadow-none border border-white/40 dark:border-white/10">
                  {/* Top: Icon background */}
                  <div className="absolute top-0 left-0 right-0 h-[125px] overflow-hidden ">
                    {app.iconUrl ? (
                      <>
                        <img src={app.iconUrl} alt="" className="absolute pointer-events-none" style={{ top: "-40%", left: "-20%", width: "120%", height: "160%", objectFit: "cover", transform: "scale(1.2) rotate(-10deg)", filter: "blur(16px)", opacity: 0.8 }} />
                        <img src={app.iconUrl} alt="" className="absolute pointer-events-none" style={{ bottom: "-40%", right: "-20%", width: "120%", height: "160%", objectFit: "cover", transform: "scale(1.2) rotate(10deg)", filter: "blur(16px)", opacity: 0.8 }} />
                      </>
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-[rgba(100,149,237,0.6)] to-[rgba(147,51,234,0.4)]" />
                    )}

                    <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 100%)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }} />

                    <div className="absolute inset-0 p-4 box-border flex flex-row items-center gap-3">
                      {app.iconUrl ? (
                        <img src={app.iconUrl} alt={app.appName} className="w-[88px] h-[88px] rounded-[22px] object-cover shrink-0" />
                      ) : (
                        <div className="w-[88px] h-[88px] rounded-[22px] bg-white/25 flex items-center justify-center text-[32px] font-bold text-white shrink-0">
                          {app.appName.charAt(0)}
                        </div>
                      )}

                      <div className="min-w-0">
                        <h3 className="font-bold text-white text-[18px] leading-tight mb-1 overflow-hidden text-ellipsis whitespace-nowrap" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.25)" }}>
                          {app.appName}
                        </h3>
                        <p className="text-[12px] text-white/90 overflow-hidden text-ellipsis whitespace-nowrap mb-1">
                          {app.appType || "Market it operates in"}
                        </p>
                        <div className="flex gap-2 items-center">
                          <span className="text-[10px] text-white/70">Rank</span>
                          <span className="text-[10px] text-white/90 font-medium">#{Math.floor(Math.random() * 10) + 1}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom: Glassmorphism */}
                  <div className="absolute left-0 right-0 bottom-0 bg-white/65 dark:bg-zinc-900/80 backdrop-blur-md px-4 pt-3 pb-4 box-border" style={{ top: "125px" }}>
                    <p className="text-[14px] font-medium text-[#545454] dark:text-zinc-300 leading-[20px] tracking-[-0.15px] m-0 pb-3">
                      {visitedString}
                    </p>
                    <div className="flex gap-[10px] items-center flex-wrap">
                      <span className="text-[12px] font-normal text-[#717182] dark:text-zinc-300 leading-[20px] tracking-[-0.15px] whitespace-nowrap">$1B revenues</span>
                      <span className="text-[12px] font-normal text-[#717182] dark:text-zinc-300 leading-[20px] tracking-[-0.15px] whitespace-nowrap">950 employees</span>
                      <span className="text-[12px] font-normal text-[#717182] dark:text-zinc-300 leading-[20px] tracking-[-0.15px] whitespace-nowrap">{(app.totalScreens || 0) * 12 || '1,421'} insights</span>
                    </div>
                  </div>
                </Link>
              );
            })}

            {/* ── NEW INSTANT CLIENT-SIDE MODAL TRIGGER ── */}
            <AddCompetitorModal userEmail={userEmail} />

          </div>
        </main>
      </div>

      {/* ── BOTTOM BAR ── */}
      <div className="fixed bottom-8 left-0 right-0 z-20 pointer-events-none">
        <div className="w-full px-8 box-border flex justify-between items-end pointer-events-auto relative">

          {/* User card */}
          <div className="flex flex-row items-center gap-2.5">
            <div className="w-10 h-10 bg-[rgba(215,213,207,0.85)] dark:bg-zinc-700 rounded-none flex items-center justify-center font-bold text-[15px] text-[#0A0A0A] dark:text-white shrink-0">
              {userInitial}
            </div>
            <div className="flex flex-col gap-1">
              <p className="font-bold text-[15px] text-[#0A0A0A] dark:text-white leading-none m-0">
                {userName}
              </p>
              <div className="flex items-center gap-2">
                <p className="font-normal text-[12px] text-[#828282] dark:text-zinc-500 leading-none m-0">
                  {userEmail}
                </p>
                <span className="text-[10px] text-zinc-300 dark:text-zinc-600 leading-none">•</span>
                
                <form action={async () => { "use server"; const supabase = await createClient(); await supabase.auth.signOut(); redirect("/login"); }}>
                  <button type="submit" className="bg-transparent border-none p-0 m-0 font-medium text-[12px] text-[#828282] dark:text-zinc-500 hover:text-black dark:hover:text-white transition-colors cursor-pointer leading-none">
                    Log out
                  </button>
                </form>
              </div>
            </div>
          </div>

          <AskBar />

        </div>
      </div>
    </div>
  );
}