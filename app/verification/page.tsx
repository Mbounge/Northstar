// app/verification/page.tsx

"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Unbounded } from "next/font/google";

// 1. Matched the font weights to the Login screen
const unbounded = Unbounded({ subsets: ["latin"], weight: ["200", "300", "600"] });

export default function VerificationPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState<string>("Loading user data...");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setEmail(data.user.email);
      } else {
        setEmail("Unknown User");
      }
    });
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="relative w-full min-h-screen bg-black font-sans flex flex-col items-center justify-center overflow-hidden">
      
      {/* ── DYNAMIC BACKGROUND (Exact match to Login) ── */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex items-center justify-center">
        <div 
          className="relative flex-shrink-0 mt-[132px] scale-[0.86111]"
          style={{ width: '1600px', height: '1600px', transform: 'rotate(310deg)' }}
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

      {/* ── SQUARE GLASSMORPHIC CARD (Exact 599x535 match) ── */}
      <div className="relative z-10 w-[90%] md:w-[599px] py-10 md:py-0 md:h-[535px] bg-black/60 backdrop-blur-2xl border-none md:border border-white/10 rounded-none flex flex-col items-center shadow-2xl animate-in zoom-in-95 fade-in duration-500">

        {/* 1. TITLE BLOCK (Absolute positioned Top: 92.5px - matching login) */}
        <div 
          className="absolute flex flex-col items-center w-full"
          style={{ top: '92.5px' }}
        >
          <h1 className={`${unbounded.className} text-white flex flex-col items-center m-0 p-0`}>
            <span 
              className="block font-[200] text-[36px] leading-[100%] whitespace-nowrap"
              style={{ letterSpacing: '-0.02em' }}
            >
              Closed Beta
            </span>
            <span 
              className="block font-[600] text-[40px] leading-[100%] whitespace-nowrap"
              style={{ 
                letterSpacing: '-0.02em',
                marginTop: '-4px' 
              }}
            >
              North Star AI
            </span>
          </h1>
        </div>

        {/* 2. EMAIL NOTIFICATION BLOCK (Centered absolute) */}
        <div 
          className="absolute flex flex-col items-center justify-center w-full"
          style={{ top: '270px' }}
        >
          <p className={`${unbounded.className} text-[#828282] font-[300] text-[14px] leading-[18px] tracking-[0%] text-center m-0 p-0 mb-3`}>
            We will notify you at:
          </p>
          <p className={`${unbounded.className} text-white font-[600] text-[16px] leading-[18px] tracking-wide text-center m-0 p-0`}>
            {email}
          </p>
        </div>

        {/* 3. FOOTER ACTIONS (Absolute positioned Top: 497px - matching login) */}
        <div 
          className="absolute flex items-center justify-center gap-4"
          style={{ 
            width: '100%', 
            height: '9px', 
            top: '497px' 
          }}
        >
          <button 
            onClick={handleSignOut} 
            className={`${unbounded.className} text-white/50 hover:text-white font-[300] text-[12px] leading-[100%] transition-colors cursor-pointer bg-transparent border-none p-0 outline-none`}
            style={{ letterSpacing: '-0.02em' }}
          >
            Sign out
          </button>
          
          <div className="w-1 h-1 rounded-full bg-white/20" />
          
          <a 
            href="mailto:support@northstar.com" 
            className={`${unbounded.className} text-white/50 hover:text-white font-[300] text-[12px] leading-[100%] transition-colors cursor-pointer no-underline`}
            style={{ letterSpacing: '-0.02em' }}
          >
            Contact Support
          </a>
        </div>

      </div>
      
    </div>
  );
}