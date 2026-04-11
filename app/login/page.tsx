"use client";

import { useState } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Unbounded } from "next/font/google";
import { cn } from "@/lib/utils";

// Initialize the Unbounded font exactly as specified in Figma
const unbounded = Unbounded({ subsets: ["latin"], weight: ["600"] });

// Standard Google 'G' Logo SVG
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

export default function LoginPage() {
  const [showAuthCard, setShowAuthCard] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    
    // Redirects back to our secure callback route to establish the session
    const redirectUrl = `${window.location.origin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="relative w-full min-h-screen bg-black font-sans flex flex-col items-center justify-center overflow-hidden">
      
      {/* ── DYNAMIC BACKGROUND ── */}
      {/* 
        Physically translates the entire image container UP by 35% of the viewport height when on the cover screen.
        This guarantees the bottom half of the screen is pure black for the text.
      */}
      <div 
        className={cn(
          "absolute left-0 right-0 top-0 h-[100vh] z-0 transition-transform duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          showAuthCard ? "translate-y-0" : "-translate-y-[35vh]"
        )}
      >
        <Image 
          src="/topaz_enhance.png" 
          alt="Abstract 3D Background" 
          fill 
          className="object-cover object-center" 
          priority 
          quality={100}
        />
        {/* Smooth fade to black at the bottom of the image so it blends seamlessly into the bg-black when shifted up */}
        <div className="absolute inset-x-0 bottom-0 h-[30vh] bg-gradient-to-t from-black via-black/80 to-transparent" />
      </div>

      {/* ── PHASE 1: COVER SCREEN ── */}
      {!showAuthCard && (
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 w-full mt-[25vh] animate-in fade-in duration-700">
          <h1 className={`${unbounded.className} text-[48px] md:text-[55px] tracking-[-0.02em] text-white leading-[100%] mb-2 text-center drop-shadow-lg`}>
            North Star
          </h1>
          <button 
            onClick={() => setShowAuthCard(true)}
            className="text-[20px] md:text-[24px] text-[#828282] text-center font-normal hover:text-white transition-colors cursor-pointer bg-transparent border-none p-0 m-0"
          >
            log in on desktop
          </button>
        </div>
      )}

      {/* ── PHASE 2: LOGIN CARD ── */}
      {showAuthCard && (
        <div className="relative z-10 w-[90%] md:w-[599px] py-10 md:py-0 md:h-[535px] bg-black/60 backdrop-blur-2xl border border-white/10 rounded-none flex flex-col items-center justify-center p-8 shadow-2xl animate-in slide-in-from-bottom-12 fade-in duration-700">
          
          {error && (
            <div className="absolute top-4 left-0 right-0 px-8">
              <p className="text-[12px] text-rose-300 bg-rose-500/20 p-2 rounded border border-rose-500/30 text-center backdrop-blur-md">
                {error}
              </p>
            </div>
          )}

          <div className="flex flex-col items-center justify-center flex-1 w-full mt-4">
            <p className="text-[16px] text-white/80 mb-1">
              Welcome to
            </p>
            
            <h1 className={`${unbounded.className} text-[40px] md:text-[55px] tracking-[-0.02em] text-white leading-none mb-10 md:mb-12 text-center`}>
              North Star AI
            </h1>
            
            <p className="text-[14px] text-[#828282] mb-6">
              Sign in or create an account
            </p>

            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full max-w-[280px] bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-full px-6 py-3.5 text-[14px] font-medium transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-white/70" />
              ) : (
                <>
                  <GoogleIcon />
                  Continue with Google
                </>
              )}
            </button>
          </div>

          <div className="mt-auto pb-2">
            <p className="text-[12px] text-[#828282] hover:text-white/80 transition-colors cursor-pointer">
              Terms & Privacy policy
            </p>
          </div>

        </div>
      )}

    </div>
  );
}