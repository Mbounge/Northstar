// app/page.tsx
import Link from "next/link";
import Image from "next/image";
import { getReviewApps } from "@/lib/review-data";
import { Plus, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Unbounded } from "next/font/google";
import { ThemeToggle } from "@/components/theme-toggle";
import { AskBar } from "@/components/ask-bar";

import { redirect } from "next/navigation";

const unbounded = Unbounded({ subsets: ["latin"], weight: ["600"] });

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const isAddModalOpen = resolvedSearchParams.add === "true";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, customer_id')
    .eq('id', user?.id)
    .single();

  const tenantId = profile?.customer_id;
  const apps = tenantId ? await getReviewApps(tenantId) : [];

  const userEmail = user?.email || "kroni@graent.com";
  const userInitial = userEmail.charAt(0).toUpperCase();
  const userName = userEmail.split('@')[0];

  return (
    <div className="relative min-h-screen bg-[#EEF0F8] dark:bg-[#09090b] flex flex-col overflow-hidden font-sans">

      {/* ── AMBIENT BACKGROUND ── */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex items-center justify-center">
        {/* 
          1. Removed the weird absolute top/left offsets.
          2. Used flex-center on the parent to perfectly center it.
          3. Matched Verification page rotation (310deg) and flip (-scale-x-100).
          4. Made it smaller (1200x1200px).
          5. Kept the blur and multiply blend mode for the ambient dashboard effect.
        */}
        <div 
          className="relative flex-shrink-0"
          style={{ 
            width: '1450px', 
            height: '1450px', 
            transform: 'rotate(310deg)',
            opacity: 0.3,
            mixBlendMode: "multiply",
            filter: "blur(48px)"
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

      {/* ── HEADER ── */}
      <header className="relative z-10 w-full px-8 pt-9 pb-0 flex items-start justify-between box-border">
        <h1
          className={`${unbounded.className} text-[30px] font-semibold tracking-tight text-[#0A0A0A] dark:text-white mb-5`}
        >
          North Star
        </h1>
        <ThemeToggle />
      </header>

      {/* ── WRAPPER FOR TABS & GRID ── */}
      <div className="w-full pl-[200px] pr-16 box-border relative z-10 flex-1 flex flex-col">

        {/* Row 2: Tabs (left) + Add new company (right) */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex flex-row items-center gap-8"> 
            
            {/* Active Tab: Changed to font-bold and added hover background transition */}
            <button className="h-[49px] px-4 flex items-center justify-center bg-white/50 hover:bg-white/70 transition-colors duration-200 ease-in-out border-none text-[16px] font-bold text-black dark:text-white cursor-pointer whitespace-nowrap rounded-none">
              Recently viewed
            </button>
            
            {/* Inactive Tabs */}
            {["Direct", "Indirect", "Top Apps"].map((tab) => (
              <button
                key={tab}
                className="bg-transparent border-none p-0 text-[16px] font-medium text-black dark:text-white/70 cursor-pointer whitespace-nowrap hover:opacity-70 transition-opacity duration-200"
              >
                {tab}
              </button>
            ))}
          </div>

          <Link
            href="/?add=true"
            className="flex items-center gap-1.5 text-[16px] font-medium text-black dark:text-white/70 no-underline whitespace-nowrap hover:opacity-70 transition-opacity duration-200"
          >
            <Plus className="w-5 h-5" />
            Add new company
          </Link>
        </div>

        {/* ── MAIN GRID ── */}
        <main className="flex-1 w-full pb-40 box-border">
          <div className="grid grid-cols-4 gap-6">
            {apps.map((app) => {
              // Removed the `const isDoubleBackground...` logic
              
              return (
                <Link
                  key={app.appName}
                  href={`/${app.appName}`}
                  className="relative w-full h-[210px] overflow-hidden block no-underline shadow-none border border-white/40 dark:border-white/10"
                >
                  {/* ── TOP: Full-bleed icon color background ── */}
                  <div className="absolute top-0 left-0 right-0 h-[125px] overflow-hidden ">
                    {app.iconUrl ? (
                      <>
                        {/* Always show 2 blurred logos in the background */}
                        <img
                          src={app.iconUrl}
                          alt=""
                          className="absolute pointer-events-none"
                          style={{
                            top: "-40%", left: "-20%",
                            width: "120%", height: "160%",
                            objectFit: "cover",
                            transform: "scale(1.2) rotate(-10deg)",
                            filter: "blur(16px)",
                            opacity: 0.8,
                          }}
                        />
                        <img
                          src={app.iconUrl}
                          alt=""
                          className="absolute pointer-events-none"
                          style={{
                            bottom: "-40%", right: "-20%",
                            width: "120%", height: "160%",
                            objectFit: "cover",
                            transform: "scale(1.2) rotate(10deg)",
                            filter: "blur(16px)",
                            opacity: 0.8,
                          }}
                        />
                      </>
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-[rgba(100,149,237,0.6)] to-[rgba(147,51,234,0.4)]" />
                    )}

                    {/* Frosted glass overlay for the image part */}
                    <div
                      className="absolute inset-0"
                      style={{
                        background: "linear-gradient(160deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 100%)",
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                      }}
                    />

                    {/* Icon + text content */}
                    <div className="absolute inset-0 p-4 box-border flex flex-row items-center gap-3">
                      {app.iconUrl ? (
                        <img
                          src={app.iconUrl}
                          alt={app.appName}
                          className="w-[88px] h-[88px] rounded-[22px] object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-[88px] h-[88px] rounded-[22px] bg-white/25 flex items-center justify-center text-[32px] font-bold text-white shrink-0">
                          {app.appName.charAt(0)}
                        </div>
                      )}

                      <div className="min-w-0">
                        <h3
                          className="font-bold text-white text-[18px] leading-tight mb-1 overflow-hidden text-ellipsis whitespace-nowrap"
                          style={{ textShadow: "0 1px 4px rgba(0,0,0,0.25)" }}
                        >
                          {app.appName}
                        </h3>
                        <p className="text-[12px] text-white/90 overflow-hidden text-ellipsis whitespace-nowrap mb-1">
                          {app.appType || "Market it operates in"}
                        </p>
                        <div className="flex gap-2 items-center">
                          <span className="text-[10px] text-white/70">Rank</span>
                          <span className="text-[10px] text-white/90 font-medium">
                            #{Math.floor(Math.random() * 10) + 1}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── BOTTOM: Glassmorphism ── */}
                  <div
                    className="absolute left-0 right-0 bottom-0 bg-white/65 dark:bg-zinc-900/80 backdrop-blur-md px-4 pt-3 pb-4 box-border"
                    style={{ top: "125px" }}
                  >
                    <p className="text-[14px] font-medium text-[#545454] dark:text-zinc-300 leading-[20px] tracking-[-0.15px] m-0 pb-3">
                      Visited 13 hours ago
                    </p>
                    
                    <div className="flex gap-[10px] items-center flex-wrap">
                      <span className="text-[12px] font-normal text-[#717182] dark:text-zinc-300 leading-[20px] tracking-[-0.15px] whitespace-nowrap">
                        $1B revenues
                      </span>
                      <span className="text-[12px] font-normal text-[#717182] dark:text-zinc-300 leading-[20px] tracking-[-0.15px] whitespace-nowrap">
                        950 employees
                      </span>
                      <span className="text-[12px] font-normal text-[#717182] dark:text-zinc-300 leading-[20px] tracking-[-0.15px] whitespace-nowrap">
                        {(app.totalScreens || 0) * 12 || '1,421'} insights
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}

            {/* Add new company placeholder */}
            <Link
              href="/?add=true"
              // Removed border-dashed, added standard border, and applied the exact glassmorphism classes
              className="w-full h-[210px] bg-white/65 dark:bg-zinc-900/80 backdrop-blur-md border border-white/40 dark:border-white/10 flex flex-col items-center justify-center no-underline text-[#545454] dark:text-zinc-300 gap-2 hover:bg-white/70 dark:hover:bg-zinc-800/80 transition-colors"
            >
              {/* Removed opacity-40 so it matches the bold text color */}
              <Plus className="w-5 h-5" />
              {/* Applied Dev Mode typography: 14px, Medium (500), -0.15px tracking, 20px leading */}
              <span className="text-[14px] font-medium leading-[20px] tracking-[-0.15px]">
                Add new company
              </span>
            </Link>
          </div>
        </main>
      </div>

      {/* ── BOTTOM BAR ── */}
      <div className="fixed bottom-8 left-0 right-0 z-20 pointer-events-none">
        <div className="w-full px-8 box-border flex justify-between items-center pointer-events-auto relative">

          {/* User card */}
          <div className="flex flex-row items-center gap-2.5">
            {/* 1. Changed rounded-lg to rounded-none to make it a square */}
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
                
                {/* 2. Added Server Action form for seamless sign out */}
                <form 
                  action={async () => {
                    "use server";
                    const supabase = await createClient();
                    await supabase.auth.signOut();
                    redirect("/login"); // Adjust this route if your login page is elsewhere
                  }}
                >
                  <button 
                    type="submit" 
                    className="bg-transparent border-none p-0 m-0 font-medium text-[12px] text-[#828282] dark:text-zinc-500 hover:text-black dark:hover:text-white transition-colors cursor-pointer leading-none"
                  >
                    Log out
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* ── BOTTOM BAR ── */}
      <div className="fixed bottom-8 left-0 right-0 z-20 pointer-events-none">
        <div className="w-full px-8 box-border flex justify-between items-end pointer-events-auto relative">

          {/* User card (Your existing updated user card) */}
          <div className="flex flex-row items-center gap-2.5">
            {/* ... user card contents ... */}
          </div>

          {/* Centered ask bar - Replaced with our interactive Client Component */}
          <AskBar />

        </div>
      </div>
        </div>
      </div>

      {/* ── ADD COMPETITOR MODAL ── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg">
          <div
            className="relative w-[599px] h-[535px] flex flex-col items-center justify-center p-8 border border-white/10"
            style={{
              background: "rgba(0,0,0,0.60)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.40)",
            }}
          >
            <Link
              href="/"
              className="absolute top-8 left-8 p-2 text-white/50 no-underline flex"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h2
              className={`${unbounded.className} text-[36px] tracking-tight text-white leading-[1.15] mb-8 text-center font-semibold`}
            >
              Add a new<br />competitor
            </h2>
            <p className="text-sm text-[#828282] mb-2">We will notify you on:</p>
            <p className="text-[16px] text-white font-medium mb-10">{userEmail}</p>
            <form className="flex flex-col w-full max-w-[320px] gap-4" action="/">
              <input
                type="text"
                placeholder="Company website"
                className="w-full bg-transparent border border-[#828282] px-4 py-3 text-sm text-white outline-none rounded-none box-border placeholder:text-zinc-500"
              />
              <button
                type="submit"
                className="w-full bg-[#2A2A2A] border border-[#333333] text-white font-medium py-3 text-sm cursor-pointer rounded-none"
              >
                Submit
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}