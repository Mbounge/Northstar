// app/page.tsx
import Link from "next/link";
import Image from "next/image";
import { getReviewApps } from "@/lib/review-data";
import { Plus, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Unbounded } from "next/font/google";

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
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "#EEF0F8",
        fontFamily: "var(--font-geist-sans, sans-serif)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── AMBIENT BACKGROUND ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          overflow: "hidden",
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ position: "relative", width: "1372px", height: "676px" }}>
          <div
            style={{
              position: "absolute",
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
      <header
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          padding: "36px 32px 0", 
          boxSizing: "border-box",
        }}
      >
        <h1
          className={unbounded.className}
          style={{
            fontSize: "30px",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            color: "#0A0A0A",
            margin: "0 0 20px",
          }}
        >
          North Star
        </h1>
      </header>

      {/* ── WRAPPER FOR TABS & GRID ── */}
      <div
        style={{
          width: '100%',
          padding: '0 64px 0 200px', 
          boxSizing: 'border-box',
          position: 'relative',
          zIndex: 10,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Row 2: Tabs (left) + Add new company (right) */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: '24px', 
          }}
        >
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
            <button
              style={{
                padding: "10px 22px",
                background: "rgba(255, 255, 255, 0.5)",
                border: "none",
                fontSize: "14px",
                fontWeight: 700,
                color: "#0A0A0A",
                cursor: "pointer",
                whiteSpace: "nowrap",
                borderRadius: "0px",
              }}
            >
              Recently viewed
            </button>

            {["Direct", "Indirect", "Top Apps"].map((tab) => (
              <button
                key={tab}
                style={{
                  padding: "10px 22px",
                  background: "transparent",
                  border: "none",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#3A3A3A",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  borderRadius: "0px",
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          <Link
            href="/?add=true"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "14px",
              fontWeight: 500,
              color: "#0A0A0A",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            <Plus style={{ width: "16px", height: "16px" }} />
            Add new company
          </Link>
        </div>

        {/* ── MAIN GRID ── */}
        <main
          style={{
            flex: 1,
            width: "100%",
            padding: "0 0 160px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))", 
              columnGap: "16px",
              rowGap: "16px",
            }}
          >
            {apps.map((app) => {
              // Deterministic check: alternate background styles based on name length
              const isDoubleBackground = app.appName.length % 2 === 0;

              return (
                <Link
                  key={app.appName}
                  href={`/${app.appName}`}
                  style={{
                    position: "relative",
                    width: "100%", 
                    height: "210px", 
                    borderRadius: "0px", 
                    overflow: "hidden",
                    display: "block",
                    textDecoration: "none",
                    border: "none",
                    boxShadow: "none",
                  }}
                >
                  {/* ── TOP: Full-bleed icon color background ── */}
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: "135px",
                      overflow: "hidden",
                      borderRadius: "0px", 
                    }}
                  >
                    {app.iconUrl ? (
                      <>
                        {isDoubleBackground ? (
                          // ── DUOLINGO STYLE (Double Icon) ──
                          <>
                            <img
                              src={app.iconUrl}
                              alt=""
                              style={{
                                position: "absolute",
                                top: "-40%",
                                left: "-20%",
                                width: "120%",
                                height: "160%",
                                objectFit: "cover",
                                transform: "scale(1.2) rotate(-10deg)",
                                filter: "blur(16px)",
                                opacity: 0.8,
                                pointerEvents: "none",
                              }}
                            />
                            <img
                              src={app.iconUrl}
                              alt=""
                              style={{
                                position: "absolute",
                                bottom: "-40%",
                                right: "-20%",
                                width: "120%",
                                height: "160%",
                                objectFit: "cover",
                                transform: "scale(1.2) rotate(10deg)",
                                filter: "blur(16px)",
                                opacity: 0.8,
                                pointerEvents: "none",
                              }}
                            />
                          </>
                        ) : (
                          // ── GRAET STYLE (Single Icon) ──
                          <img
                            src={app.iconUrl}
                            alt=""
                            style={{
                              position: "absolute",
                              top: "-50%",
                              left: "-50%",
                              width: "200%",
                              height: "200%",
                              objectFit: "cover",
                              transform: "scale(1.5)",
                              filter: "blur(20px)",
                              opacity: 0.9,
                              pointerEvents: "none",
                            }}
                          />
                        )}
                      </>
                    ) : (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "linear-gradient(135deg, rgba(100,149,237,0.6), rgba(147,51,234,0.4))",
                        }}
                      />
                    )}

                    {/* ── FROSTED GLASS & DARKENING OVERLAY ── */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "linear-gradient(160deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 100%)",
                        backdropFilter: "blur(8px)", // Gives the true frosted sheen
                        WebkitBackdropFilter: "blur(8px)",
                      }}
                    />

                    {/* Icon + text content */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        padding: "24px 20px",
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: "16px", 
                      }}
                    >
                      {app.iconUrl ? (
                        <img
                          src={app.iconUrl}
                          alt={app.appName}
                          style={{
                            width: "88px", 
                            height: "88px",
                            borderRadius: "22px", 
                            objectFit: "cover",
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "88px", 
                            height: "88px",
                            borderRadius: "22px",
                            background: "rgba(255,255,255,0.25)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "32px",
                            fontWeight: 700,
                            color: "#FFFFFF",
                            flexShrink: 0,
                          }}
                        >
                          {app.appName.charAt(0)}
                        </div>
                      )}

                      <div style={{ minWidth: 0 }}>
                        <h3
                          style={{
                            fontWeight: 700,
                            color: "#FFFFFF",
                            fontSize: "18px", 
                            lineHeight: 1.2,
                            margin: "0 0 4px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            textShadow: "0 1px 4px rgba(0,0,0,0.25)",
                          }}
                        >
                          {app.appName}
                        </h3>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "rgba(255,255,255,0.90)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            margin: "0 0 4px",
                          }}
                        >
                          {app.appType || "Market it operates in"}
                        </p>
                        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.70)" }}>
                            Rank
                          </span>
                          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.90)", fontWeight: 500 }}>
                            #{Math.floor(Math.random() * 10) + 1}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── BOTTOM: Semi-transparent section ── */}
                  <div
                    style={{
                      position: "absolute",
                      top: "135px", 
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: "rgba(255, 255, 255, 0.65)", 
                      backdropFilter: "blur(4px)", 
                      padding: "16px 20px",
                      boxSizing: "border-box",
                      borderRadius: "0px", 
                    }}
                  >
                    <p
                      style={{
                        fontWeight: 500,
                        fontSize: "14px", 
                        color: "#4A4A4A", 
                        lineHeight: 1,
                        margin: "0 0 16px", 
                      }}
                    >
                      Visited 13 hours ago
                    </p>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "12px", color: "#828282", whiteSpace: "nowrap" }}>
                        $1B revenues
                      </span>
                      <span style={{ fontSize: "12px", color: "#828282", whiteSpace: "nowrap" }}>
                        950 employees
                      </span>
                      <span style={{ fontSize: "12px", color: "#828282", whiteSpace: "nowrap" }}>
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
              style={{
                width: "100%", // Let grid dictate width
                height: "210px", 
                background: "rgba(255,255,255,0.18)",
                border: "1.5px dashed rgba(155,155,165,0.50)",
                borderRadius: "0px", 
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
                color: "#828282",
                gap: "8px",
              }}
            >
              <Plus style={{ width: "20px", height: "20px", opacity: 0.40 }} />
              <span style={{ fontSize: "13px", fontWeight: 500 }}>Add new company</span>
            </Link>
          </div>
        </main>
      </div>

      {/* ── BOTTOM BAR ── */}
      <div
        style={{
          position: "fixed",
          bottom: "32px",
          left: 0,
          right: 0,
          zIndex: 20,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: "100%",
            padding: "0 32px", 
            boxSizing: "border-box",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            pointerEvents: "auto",
            position: "relative",
          }}
        >
          {/* User card — aligned to the left padding edge */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "10px",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                background: "rgba(215,213,207,0.85)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "15px",
                color: "#0A0A0A",
                flexShrink: 0,
              }}
            >
              {userInitial}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <p style={{ fontWeight: 700, fontSize: "15px", color: "#0A0A0A", lineHeight: 1, margin: 0 }}>
                {userName}
              </p>
              <p style={{ fontWeight: 400, fontSize: "12px", color: "#828282", lineHeight: 1, margin: 0 }}>
                {userEmail}
              </p>
            </div>
          </div>

          {/* Centered ask bar */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              background: "rgba(255,255,255,0.88)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(210,210,220,0.50)",
              boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
              borderRadius: "100px",
              padding: "8px",
              width: "540px",
            }}
          >
            <input
              type="text"
              placeholder="Ask your market anything"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                padding: "0 16px",
                fontSize: "14px",
                color: "#0A0A0A",
              }}
            />
            <button
              style={{
                background: "#1C4ED8",
                color: "white",
                padding: "10px 24px",
                borderRadius: "100px",
                fontSize: "13px",
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                boxShadow: "0 2px 8px rgba(28,78,216,0.25)",
              }}
            >
              Request answer
            </button>
          </div>
        </div>
      </div>

      {/* ── ADD COMPETITOR MODAL ── */}
      {isAddModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.60)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "599px",
              height: "535px",
              background: "rgba(0,0,0,0.60)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.10)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "32px",
              boxShadow: "0 24px 80px rgba(0,0,0,0.40)",
            }}
          >
            <Link
              href="/"
              style={{
                position: "absolute",
                top: "32px",
                left: "32px",
                padding: "8px",
                color: "rgba(255,255,255,0.50)",
                textDecoration: "none",
                display: "flex",
              }}
            >
              <ArrowLeft style={{ width: "20px", height: "20px" }} />
            </Link>
            <h2
              className={unbounded.className}
              style={{
                fontSize: "36px",
                letterSpacing: "-0.02em",
                color: "white",
                lineHeight: 1.15,
                marginBottom: "32px",
                textAlign: "center",
                fontWeight: 600,
              }}
            >
              Add a new<br />competitor
            </h2>
            <p style={{ fontSize: "14px", color: "#828282", margin: "0 0 8px" }}>
              We will notify you on:
            </p>
            <p style={{ fontSize: "16px", color: "white", fontWeight: 500, margin: "0 0 40px" }}>
              {userEmail}
            </p>
            <form
              style={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                maxWidth: "320px",
                gap: "16px",
              }}
              action="/"
            >
              <input
                type="text"
                placeholder="Company website"
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "1px solid #828282",
                  padding: "12px 16px",
                  fontSize: "14px",
                  color: "white",
                  outline: "none",
                  borderRadius: 0,
                  boxSizing: "border-box",
                }}
              />
              <button
                type="submit"
                style={{
                  width: "100%",
                  background: "#2A2A2A",
                  border: "1px solid #333333",
                  color: "white",
                  fontWeight: 500,
                  padding: "12px",
                  fontSize: "14px",
                  cursor: "pointer",
                  borderRadius: 0,
                }}
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