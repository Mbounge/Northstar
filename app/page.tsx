import { PendingCanvasInvitation } from '@/components/canvas-v2/canvas-invitation';
// app/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Layers3 } from "lucide-react";
import { getReviewApps } from "@/lib/review-data";
import { createClient } from "@/lib/supabase/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { AuthUrlCleaner } from "@/components/auth-url-cleaner";

export const metadata: Metadata = {
  title: "App library",
  description: "Explore captured apps, onboarding screens and browsing flows.",
};

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, customer_id")
    .eq("id", user?.id)
    .single();

  const tenantId = profile?.customer_id;
  const apps = tenantId ? await getReviewApps(tenantId) : [];

  const { data: visits } = await supabase
    .from("user_app_visits")
    .select("app_name, last_visited_at")
    .eq("user_id", user?.id);

  const visitMap = new Map(
    (visits || []).map((v) => [v.app_name.toLowerCase(), v.last_visited_at])
  );

  apps.sort((a, b) => {
    const timeA = visitMap.get(a.appName.toLowerCase());
    const timeB = visitMap.get(b.appName.toLowerCase());
    const dateA = timeA ? new Date(timeA).getTime() : 0;
    const dateB = timeB ? new Date(timeB).getTime() : 0;

    return dateB - dateA;
  });

  const userEmail = user?.email || "default@gmail.com";
  const userInitial = userEmail.charAt(0).toUpperCase();
  const userName = userEmail.split("@")[0];

  return (
    <div data-northstar-home-shell className="relative min-h-screen bg-[#EEF0F8] dark:bg-[#09090b] flex flex-col overflow-hidden font-sans">
      <PendingCanvasInvitation />
      <AuthUrlCleaner />

      <style
        dangerouslySetInnerHTML={{
          __html: `
            ::-webkit-scrollbar {
              display: none !important;
            }
            html, body {
              -ms-overflow-style: none !important;
              scrollbar-width: none !important;
            }
            [data-northstar-home-atmosphere],
            [data-northstar-home-header],
            [data-northstar-home-content],
            [data-northstar-home-account] {
              transition: transform 560ms cubic-bezier(.22,1,.36,1), opacity 420ms ease, filter 520ms ease;
              transform-origin: center;
            }
            html[data-northstar-canvas-transition="leaving"] [data-northstar-home-atmosphere] {
              opacity: .46;
              transform: scale(1.035);
              filter: saturate(.82);
            }
            html[data-northstar-canvas-transition="leaving"] [data-northstar-home-header],
            html[data-northstar-canvas-transition="leaving"] [data-northstar-home-content],
            html[data-northstar-canvas-transition="leaving"] [data-northstar-home-account] {
              opacity: .26;
              transform: translateY(-9px) scale(.987);
              filter: blur(1.5px);
            }
            @keyframes northstarGatewayVeil {
              0% { opacity: 0; transform: scale(.98); }
              58% { opacity: 1; }
              100% { opacity: 1; transform: scale(1); }
            }
            @media (prefers-reduced-motion: reduce) {
              [data-northstar-home-atmosphere],
              [data-northstar-home-header],
              [data-northstar-home-content],
              [data-northstar-home-account] {
                transition-duration: 60ms;
              }
              [data-testid="northstar-gateway-transition"] { animation-duration: 80ms !important; }
            }
          `,
        }}
      />

      <div data-northstar-home-atmosphere className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex items-center justify-center">
        <div
          className="relative flex-shrink-0"
          style={{
            width: "1450px",
            height: "1450px",
            transform: "rotate(310deg)",
            opacity: 0.3,
            mixBlendMode: "multiply",
            filter: "blur(48px)",
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

      <header data-northstar-home-header className="relative z-10 w-full px-8 pt-9 pb-0 flex items-start justify-between box-border">
        <h1
          className="text-[30px] font-semibold tracking-tight text-[#0A0A0A] dark:text-white mb-5"
        >
          App library
        </h1>

        <ThemeToggle />
      </header>

      <div data-northstar-home-content className="w-full pl-[200px] pr-16 box-border relative z-10 flex-1 flex flex-col">
        <div className="flex items-center mb-6">
          <Link
            href="/canvas"
            prefetch
            className="inline-flex h-12 items-center gap-3 rounded-full border border-white/65 bg-white/65 px-5 text-[13px] font-medium text-[#363047] shadow-[0_8px_28px_rgba(66,54,132,.12),inset_0_1px_0_rgba(255,255,255,.8)] backdrop-blur-2xl transition-[background-color,box-shadow] hover:bg-white/85 hover:shadow-[0_10px_32px_rgba(87,65,180,.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a58af7] focus-visible:ring-offset-4 focus-visible:ring-offset-[#EEF0F8] dark:border-white/[.14] dark:bg-[#211d2c]/85 dark:text-[#eee9fa] dark:shadow-[0_10px_32px_rgba(0,0,0,.25),inset_0_1px_0_rgba(255,255,255,.06)] dark:hover:bg-[#30283e]/95 dark:focus-visible:ring-offset-[#09090b]"
          >
            <Layers3 aria-hidden="true" size={17} strokeWidth={1.7} className="text-[#8061d7] dark:text-[#bca4ff]" />
            Open canvas
            <ArrowUpRight aria-hidden="true" size={15} strokeWidth={1.8} className="text-[#8a7ba4] dark:text-[#baaccc]" />
          </Link>
        </div>

        <main className="flex-1 w-full pb-40 box-border">
          <div className="grid grid-cols-4 gap-6">
            {apps.map((app) => {
              const lastVisited = visitMap.get(app.appName.toLowerCase());
              const visitedString = lastVisited
                ? `Visited ${formatDistanceToNow(new Date(lastVisited), {
                    addSuffix: true,
                  })}`
                : "Not visited yet";

              return (
                <Link
                  key={app.appName}
                  href={`/${app.appName}`}
                  prefetch
                  className="relative w-full h-[210px] overflow-hidden block no-underline shadow-none border border-white/40 dark:border-white/10"
                >
                  <div className="absolute top-0 left-0 right-0 h-[125px] overflow-hidden ">
                    {app.iconUrl ? (
                      <>
                        <img
                          src={app.iconUrl}
                          alt=""
                          className="absolute pointer-events-none"
                          style={{
                            top: "-40%",
                            left: "-20%",
                            width: "120%",
                            height: "160%",
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
                            bottom: "-40%",
                            right: "-20%",
                            width: "120%",
                            height: "160%",
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

                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(160deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 100%)",
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                      }}
                    />

                    <div className="absolute inset-0 p-4 box-border flex flex-row items-center gap-3">
                      <div
                        className="relative w-[88px] h-[88px] shrink-0"
                        style={{ borderRadius: "22.5%", overflow: "hidden" }}
                      >
                        {app.iconUrl ? (
                          <img
                            src={app.iconUrl}
                            alt={app.appName}
                            className="absolute inset-0 w-full h-full object-cover"
                            style={{ borderRadius: "22.5%" }}
                          />
                        ) : (
                          <div
                            className="absolute inset-0 flex items-center justify-center text-white text-[32px] font-bold"
                            style={{
                              borderRadius: "22.5%",
                              background:
                                "linear-gradient(180deg, #374151 0%, #111827 100%)",
                            }}
                          >
                            {app.appName.charAt(0)}
                          </div>
                        )}

                        <div
                          className="relative w-[88px] h-[88px] shrink-0"
                          style={{
                            borderRadius: "22.5%",
                            overflow: "hidden",
                            boxShadow:
                              "0 8px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.3)",
                          }}
                        >
                          {app.iconUrl ? (
                            <img
                              src={app.iconUrl}
                              alt={app.appName}
                              className="absolute inset-0 w-full h-full object-cover"
                              style={{ borderRadius: "22.5%" }}
                            />
                          ) : (
                            <div
                              className="absolute inset-0 flex items-center justify-center text-white text-[32px] font-bold"
                              style={{
                                borderRadius: "22.5%",
                                background:
                                  "linear-gradient(180deg, #374151 0%, #111827 100%)",
                              }}
                            >
                              {app.appName.charAt(0)}
                            </div>
                          )}

                          <div
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              borderRadius: "22.5%",
                              background: `
                                radial-gradient(
                                  ellipse 100% 100% at 50% 50%,
                                  rgba(255,255,255,0.00) 52%,
                                  rgba(255,255,255,0.08) 72%,
                                  rgba(255,255,255,0.04) 88%,
                                  rgba(255,255,255,0.01) 100%
                                )
                              `,
                              zIndex: 10,
                            }}
                          />

                          <div
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              borderRadius: "22.5%",
                              background: `
                                radial-gradient(
                                  ellipse 120% 120% at 10% 10%,
                                  rgba(255,255,255,0.04) 0%,
                                  rgba(255,255,255,0.02) 30%,
                                  rgba(255,255,255,0.00) 55%
                                )
                              `,
                              zIndex: 10,
                            }}
                          />

                          <div
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              borderRadius: "22.5%",
                              boxShadow: `
                                inset 0 0 0 1.15px rgba(244,245,248,0.4),
                                inset 0 0 0 1.60px rgba(244,245,248,0.38),
                                inset 0 0 0 2.28px rgba(244,245,248,0.074),
                                inset 0 0 0 2.98px rgba(244,245,248,0.021)
                              `,
                              WebkitMaskImage: `
                                radial-gradient(circle at 14% 14%,
                                  rgba(0,0,0,0.70) 8%,
                                  rgba(0,0,0,0.62) 16%,
                                  rgba(0,0,0,0.59) 36%,
                                  rgba(0,0,0,0.30) 42%,
                                  rgba(0,0,0,0.15) 50%,
                                  rgba(0,0,0,0.05) 55%,
                                  rgba(0,0,0,0.00) 61%
                                ),
                                radial-gradient(circle at 86% 86%,
                                  rgba(0,0,0,0.42) 21%,
                                  rgba(0,0,0,0.35) 29%,
                                  rgba(0,0,0,0.31) 45%,
                                  rgba(0,0,0,0.21) 55%,
                                  rgba(0,0,0,0.13) 61%,
                                  rgba(0,0,0,0.02) 75%
                                )
                              `,
                              filter: "blur(0.0px)",
                            }}
                          />

                          <div
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              borderRadius: "22.5%",
                              boxShadow: `
                                inset 0 0 1.2px rgba(244,245,248,0.060),
                                inset 0 0 2.2px rgba(244,245,248,0.024)
                              `,
                              WebkitMaskImage: `
                                radial-gradient(circle at 14% 14%,
                                  rgba(0,0,0,0.72) 0%,
                                  rgba(0,0,0,0.42) 28%,
                                  rgba(0,0,0,0.14) 42%,
                                  rgba(0,0,0,0.03) 52%,
                                  rgba(0,0,0,0.00) 58%
                                ),
                                radial-gradient(circle at 86% 86%,
                                  rgba(0,0,0,0.72) 0%,
                                  rgba(0,0,0,0.42) 28%,
                                  rgba(0,0,0,0.14) 42%,
                                  rgba(0,0,0,0.03) 52%,
                                  rgba(0,0,0,0.00) 58%
                                )
                              `,
                              filter: "blur(0.68px)",
                            }}
                          />
                        </div>
                      </div>

                      <div className="min-w-0 ml-1">
                        <h3
                          className="font-bold text-white text-[18px] leading-tight mb-1 overflow-hidden text-ellipsis whitespace-nowrap"
                          style={{
                            textShadow: "0 1px 4px rgba(0,0,0,0.25)",
                          }}
                        >
                          {app.appName}
                        </h3>

                        <p className="text-[12px] text-white/90 overflow-hidden text-ellipsis whitespace-nowrap mb-1">
                          {app.appType || "Market it operates in"}
                        </p>

                        <div className="flex gap-2 items-center">
                          <span className="text-[10px] text-white/70">
                            Rank
                          </span>

                          <span className="text-[10px] text-white/90 font-medium">
                            {app.rank && app.rank !== "?"
                              ? String(app.rank).startsWith("#")
                                ? app.rank
                                : `#${app.rank}`
                              : "?"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="absolute left-0 right-0 bottom-0 bg-white/65 dark:bg-zinc-900/80 backdrop-blur-md px-4 pt-3 pb-4 box-border"
                    style={{ top: "125px" }}
                  >
                    <p className="text-[14px] font-medium text-[#545454] dark:text-zinc-300 leading-[20px] tracking-[-0.15px] m-0 pb-3">
                      {visitedString}
                    </p>

                    <div className="flex gap-[10px] items-center flex-wrap">
                      <span className="text-[12px] font-normal text-[#717182] dark:text-zinc-300 leading-[20px] tracking-[-0.15px] whitespace-nowrap">
                        {app.totalScreens || 0} insights
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}

          </div>
        </main>
      </div>

      <div
        id="bottom-bar"
        className="fixed bottom-8 left-0 right-0 z-20 pointer-events-none transition-all duration-300 ease-in-out"
      >
        <div className="w-full px-8 box-border flex items-end pointer-events-auto relative">
          <div data-northstar-home-account className="flex flex-row items-center gap-2.5">
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

                <span className="text-[10px] text-zinc-300 dark:text-zinc-600 leading-none">
                  •
                </span>

                <form
                  action={async () => {
                    "use server";

                    const supabase = await createClient();
                    await supabase.auth.signOut();

                    redirect("/login");
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
        </div>
      </div>
    </div>
  );
}
