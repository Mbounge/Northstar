"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Unbounded } from "next/font/google";

const unbounded = Unbounded({ subsets: ["latin"], weight: ["600"] });

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
      
      {/* ── BACKGROUND IMAGE (Centered state) ── */}
      <div className="absolute inset-0 z-0">
        <Image 
          src="/topaz_enhance.png" 
          alt="Abstract 3D Background" 
          fill 
          className="object-cover object-center" 
          priority 
          quality={100}
        />
      </div>

      {/* ── SQUARE GLASSMORPHIC CARD (Exactly 599x535 on desktop) ── */}
      <div className="relative z-10 w-[90%] md:w-[599px] py-10 md:py-0 md:h-[535px] bg-black/60 backdrop-blur-2xl border border-white/10 rounded-none flex flex-col items-center justify-center p-8 shadow-2xl text-center animate-in zoom-in-95 fade-in duration-500">

        <div className="flex flex-col items-center justify-center flex-1 w-full mt-6">
          <p className="text-[16px] text-white/80 mb-1">
            Closed Beta
          </p>
          
          <h1 className={`${unbounded.className} text-[40px] md:text-[55px] tracking-[-0.02em] text-white leading-none mb-10 md:mb-14`}>
            North Star AI
          </h1>

          <p className="text-[14px] text-[#828282] mb-2">
            We will notify you at:
          </p>
          
          <p className="text-[16px] text-white font-medium mb-8">
            {email}
          </p>
        </div>

        {/* ── FOOTER ACTIONS ── */}
        <div className="mt-auto pb-2 flex items-center justify-center gap-6">
          <button 
            onClick={handleSignOut} 
            className="text-[12px] text-[#828282] hover:text-white transition-colors"
          >
            Sign out
          </button>
          <div className="w-1 h-1 rounded-full bg-[#828282]/50" />
          <a 
            href="mailto:support@northstar.com" 
            className="text-[12px] text-[#828282] hover:text-white transition-colors"
          >
            Contact Support
          </a>
        </div>

      </div>
      
    </div>
  );
}