// app/login/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Unbounded } from "next/font/google";
import { cn } from "@/lib/utils";

const unbounded = Unbounded({
  subsets: ["latin"],
  weight: ["200", "300", "600"],
});

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [isDesktop, setIsDesktop] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsDesktop(window.innerWidth > 1024);
      setIsChecking(false);
    };

    checkScreenSize();

    window.addEventListener("resize", checkScreenSize);

    return () => {
      window.removeEventListener("resize", checkScreenSize);
    };
  }, []);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const code = currentUrl.searchParams.get("code");

    if (!code) return;

    const callbackUrl = new URL("/auth/callback", window.location.origin);

    currentUrl.searchParams.forEach((value, key) => {
      callbackUrl.searchParams.set(key, value);
    });

    if (!callbackUrl.searchParams.get("next")) {
      callbackUrl.searchParams.set("next", "/");
    }

    router.replace(`${callbackUrl.pathname}${callbackUrl.search}`);
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    const checkExistingSession = async () => {
      const currentUrl = new URL(window.location.href);

      if (currentUrl.searchParams.get("code")) {
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!cancelled && session) {
        router.replace("/");
      }
    };

    void checkExistingSession();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);

    const redirectUrl = `${window.location.origin}/auth/callback`;

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          access_type: "offline",
        },
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return <div className="w-full min-h-screen bg-black" />;
  }

  return (
    <div className="relative w-full min-h-screen bg-black font-sans flex flex-col items-center justify-center overflow-hidden">
      <div
        className={cn(
          "absolute inset-0 z-0 overflow-hidden pointer-events-none flex items-center justify-center transition-transform duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          isDesktop ? "translate-y-0" : "-translate-y-[35vh]"
        )}
      >
        <div
          className="relative flex-shrink-0 mt-[12vh]"
          style={{
            width: "max(1350px, 75vmax)",
            height: "max(1350px, 75vmax)",
            transform: "rotate(309deg)",
          }}
        >
          <Image
            src="/topaz_enhance.png"
            alt="Abstract 3D Background"
            fill
            className="object-cover -scale-x-100"
            priority
            quality={100}
          />
        </div>
      </div>

      {!isDesktop && (
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 w-full mt-[25vh] animate-in fade-in duration-700">
          <h1
            className={`${unbounded.className} text-[48px] md:text-[55px] tracking-[-0.02em] text-white leading-[100%] mb-2 text-center drop-shadow-lg`}
          >
            North Star
          </h1>

          <p className="text-[20px] md:text-[24px] text-[#828282] text-center font-normal m-0 p-0">
            log in on desktop
          </p>
        </div>
      )}

      {isDesktop && (
        <div className="relative z-10 w-[90%] md:w-[599px] py-10 md:py-0 md:h-[535px] bg-black/60 backdrop-blur-2xl border-none md:border border-white/10 rounded-none shadow-2xl animate-in slide-in-from-bottom-12 fade-in duration-700">
          {error && (
            <div className="absolute top-4 left-0 right-0 px-8 z-50">
              <p className="text-[12px] text-rose-300 bg-rose-500/20 p-2 rounded border border-rose-500/30 text-center backdrop-blur-md">
                {error}
              </p>
            </div>
          )}

          <div
            className="absolute flex flex-col items-center w-full"
            style={{ top: "92.5px" }}
          >
            <h1 className={`${unbounded.className} text-white flex flex-col items-center m-0 p-0`}>
              <span
                className="block font-[200] text-[36px] leading-[100%] whitespace-nowrap"
                style={{ letterSpacing: "-0.02em" }}
              >
                Welcome to
              </span>

              <span
                className="block font-[600] text-[40px] leading-[100%] whitespace-nowrap mt-2"
                style={{ letterSpacing: "-0.02em" }}
              >
                North Star AI
              </span>
            </h1>
          </div>

          <div
            className="absolute flex items-end justify-center"
            style={{
              width: "228px",
              height: "18px",
              top: "241px",
              left: "186px",
            }}
          >
            <p
              className={`${unbounded.className} text-white font-[300] text-[14px] leading-[18px] tracking-[0%] text-center m-0 p-0 w-full`}
            >
              Sign in or create an account
            </p>
          </div>

          <div
            className="absolute"
            style={{
              width: "349px",
              height: "56px",
              top: "321px",
              left: "125px",
            }}
          >
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full h-full cursor-pointer bg-white/10 hover:bg-white/20 border-0 border-y border-white/30 hover:border-white/50 text-white rounded-none transition-all duration-300 ease-out flex items-center justify-center gap-[10px] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-white/70" />
              ) : (
                <>
                  <GoogleIcon />
                  <span className="font-sans text-[16px] font-[700] leading-[24px] tracking-[-0.01em]">
                    Continue with Google
                  </span>
                </>
              )}
            </button>
          </div>

          <div
            className="absolute flex items-center justify-center"
            style={{
              width: "148px",
              height: "9px",
              top: "497px",
              left: "225px",
            }}
          >
            <p
              className={`${unbounded.className} text-white font-[300] text-[12px] leading-[100%] text-center m-0 p-0 w-full hover:text-white/80 transition-colors cursor-pointer`}
              style={{ letterSpacing: "-0.02em" }}
            >
              Terms & Privacy apply
            </p>
          </div>
        </div>
      )}
    </div>
  );
}