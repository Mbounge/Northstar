// app/page.tsx
import Link from "next/link";
import Image from "next/image";
import { getReviewApps } from "@/lib/review-data";
import { Plus, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Unbounded } from "next/font/google";
import { ThemeToggle } from "@/components/theme-toggle";

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
        <div className="relative w-[1372px] h-[676px]">
          <div
            className="absolute"
            style={{
              width: "1814px",
              height: "1814px",
              top: "-673.42px",
              left: "-398.42px",
              transform: "rotate(-123.61deg)",
              transformOrigin: "center",
              opacity: 0.3,
              mixBlendMode: "multiply",
              filter: "blur(48px)",
            }}
          >
            <Image
              src="/topaz_enhance.png"
              alt=""
              fill
              style={{ objectFit: "cover" }}
              priority
              quality={80}
            />
          </div>
        </div>
      </div>

      {/* ── HEADER ── */}
      <header className="relative z-10 w-full px-8 pt-9 pb-0 flex items-start justify-between box-border">
        <h1
          className={`${unbounded.className} text-[30px] font-semibold tracking-tight leading-none text-[#0A0A0A] dark:text-white mb-5`}
        >
          North Star
        </h1>
        <ThemeToggle />
      </header>

      {/* ── WRAPPER FOR TABS & GRID ── */}
      <div className="w-full pl-[200px] pr-16 box-border relative z-10 flex-1 flex flex-col">

        {/* Row 2: Tabs (left) + Add new company (right) */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex flex-row items-center">
            <button className="px-[22px] py-[10px] bg-white/50 dark:bg-white/10 border-none text-sm font-bold text-[#0A0A0A] dark:text-white cursor-pointer whitespace-nowrap rounded-none">
              Recently viewed
            </button>
            {["Direct", "Indirect", "Top Apps"].map((tab) => (
              <button
                key={tab}
                className="px-[22px] py-[10px] bg-transparent border-none text-sm font-medium text-[#3A3A3A] dark:text-zinc-400 cursor-pointer whitespace-nowrap rounded-none hover:text-[#0A0A0A] dark:hover:text-white transition-colors"
              >
                {tab}
              </button>
            ))}
          </div>

          <Link
            href="/?add=true"
            className="flex items-center gap-1.5 text-sm font-medium text-[#0A0A0A] dark:text-white no-underline whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add new company
          </Link>
        </div>

        {/* ── MAIN GRID ── */}
        <main className="flex-1 w-full pb-40 box-border">
          <div className="grid grid-cols-4 gap-4">
            {apps.map((app) => {
              const isDoubleBackground = app.appName.length % 2 === 0;

              return (
                <Link
                  key={app.appName}
                  href={`/${app.appName}`}
                  className="relative w-full h-[210px] rounded-none overflow-hidden block no-underline border-none shadow-none"
                >
                  {/* ── TOP: Full-bleed icon color background ── */}
                  <div className="absolute top-0 left-0 right-0 h-[135px] overflow-hidden rounded-none">
                    {app.iconUrl ? (
                      <>
                        {isDoubleBackground ? (
                          <>
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
                          <img
                            src={app.iconUrl}
                            alt=""
                            className="absolute pointer-events-none"
                            style={{
                              top: "-50%", left: "-50%",
                              width: "200%", height: "200%",
                              objectFit: "cover",
                              transform: "scale(1.5)",
                              filter: "blur(20px)",
                              opacity: 0.9,
                            }}
                          />
                        )}
                      </>
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-[rgba(100,149,237,0.6)] to-[rgba(147,51,234,0.4)]" />
                    )}

                    {/* Frosted glass overlay */}
                    <div
                      className="absolute inset-0"
                      style={{
                        background: "linear-gradient(160deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 100%)",
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                      }}
                    />

                    {/* Icon + text content */}
                    <div className="absolute inset-0 p-6 box-border flex flex-row items-center gap-4">
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
                        <div className="flex gap-3 items-center">
                          <span className="text-[10px] text-white/70">Rank</span>
                          <span className="text-[10px] text-white/90 font-medium">
                            #{Math.floor(Math.random() * 10) + 1}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── BOTTOM: Semi-transparent section ── */}
                  <div
                    className="absolute left-0 right-0 bottom-0 bg-white/65 dark:bg-zinc-900/80 backdrop-blur-sm p-4 box-border rounded-none"
                    style={{ top: "135px" }}
                  >
                    <p className="font-medium text-sm text-[#4A4A4A] dark:text-zinc-300 leading-none mb-4">
                      Visited 13 hours ago
                    </p>
                    <div className="flex gap-3 items-center flex-wrap">
                      <span className="text-xs text-[#828282] dark:text-zinc-500 whitespace-nowrap">$1B revenues</span>
                      <span className="text-xs text-[#828282] dark:text-zinc-500 whitespace-nowrap">950 employees</span>
                      <span className="text-xs text-[#828282] dark:text-zinc-500 whitespace-nowrap">
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
              className="w-full h-[210px] bg-white/[0.18] dark:bg-white/5 border border-dashed border-[rgba(155,155,165,0.5)] dark:border-white/10 rounded-none flex flex-col items-center justify-center no-underline text-[#828282] dark:text-zinc-500 gap-2"
            >
              <Plus className="w-5 h-5 opacity-40" />
              <span className="text-[13px] font-medium">Add new company</span>
            </Link>
          </div>
        </main>
      </div>

      {/* ── BOTTOM BAR ── */}
      <div className="fixed bottom-8 left-0 right-0 z-20 pointer-events-none">
        <div className="w-full px-8 box-border flex justify-between items-center pointer-events-auto relative">

          {/* User card */}
          <div className="flex flex-row items-center gap-2.5 cursor-pointer">
            <div className="w-10 h-10 bg-[rgba(215,213,207,0.85)] dark:bg-zinc-700 rounded-lg flex items-center justify-center font-bold text-[15px] text-[#0A0A0A] dark:text-white shrink-0">
              {userInitial}
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="font-bold text-[15px] text-[#0A0A0A] dark:text-white leading-none m-0">
                {userName}
              </p>
              <p className="font-normal text-[12px] text-[#828282] dark:text-zinc-500 leading-none m-0">
                {userEmail}
              </p>
            </div>
          </div>

          {/* Centered ask bar */}
          <div
            className="absolute left-1/2 -translate-x-1/2 flex items-center bg-white/88 dark:bg-zinc-900/90 backdrop-blur-2xl border border-[rgba(210,210,220,0.5)] dark:border-white/10 rounded-full p-2 w-[540px]"
            style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.06)" }}
          >
            <input
              type="text"
              placeholder="Ask your market anything"
              className="flex-1 bg-transparent border-none outline-none px-4 text-sm text-[#0A0A0A] dark:text-white placeholder:text-zinc-400"
            />
            <button
              className="bg-[#1C4ED8] text-white px-6 py-2.5 rounded-full text-[13px] font-medium border-none cursor-pointer whitespace-nowrap"
              style={{ boxShadow: "0 2px 8px rgba(28,78,216,0.25)" }}
            >
              Request answer
            </button>
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