"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Unbounded } from "next/font/google";

const unbounded = Unbounded({
  subsets: ["latin"],
  weight: ["200", "300", "600"],
});

export default function VerificationPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState<string>("Loading user data...");

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();

      if (cancelled) return;

      if (data?.user?.email) {
        setEmail(data.user.email);
      } else {
        setEmail("Unknown User");
      }
    };

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="relative w-full min-h-screen bg-black font-sans flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex items-center justify-center">
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

      <div className="relative z-10 w-[90%] md:w-[599px] py-10 md:py-0 md:h-[535px] bg-black/60 backdrop-blur-2xl border-none md:border border-white/10 rounded-none flex flex-col items-center shadow-2xl animate-in zoom-in-95 fade-in duration-500">
        <div
          className="absolute flex flex-col items-center w-full"
          style={{ top: "92.5px" }}
        >
          <h1
            className={`${unbounded.className} text-white flex flex-col items-center m-0 p-0`}
          >
            <span
              className="block font-[200] text-[36px] leading-[100%] whitespace-nowrap"
              style={{ letterSpacing: "-0.02em" }}
            >
              Closed Beta
            </span>

            <span
              className="block font-[600] text-[40px] leading-[100%] whitespace-nowrap mt-2"
              style={{
                letterSpacing: "-0.02em",
              }}
            >
              North Star AI
            </span>
          </h1>
        </div>

        <div
          className="absolute flex flex-col items-center justify-center w-full"
          style={{ top: "270px" }}
        >
          <p
            className={`${unbounded.className} text-[#828282] font-[300] text-[14px] leading-[18px] tracking-[0%] text-center m-0 p-0 mb-3`}
          >
            We will notify you at:
          </p>

          <p
            className={`${unbounded.className} text-white font-[600] text-[16px] leading-[18px] tracking-wide text-center m-0 p-0`}
          >
            {email}
          </p>
        </div>

        <div
          className="absolute flex items-center justify-center gap-4"
          style={{
            width: "100%",
            height: "9px",
            top: "497px",
          }}
        >
          <button
            onClick={handleSignOut}
            className={`${unbounded.className} text-white/50 hover:text-white font-[300] text-[12px] leading-[100%] transition-colors cursor-pointer bg-transparent border-none p-0 outline-none`}
            style={{ letterSpacing: "-0.02em" }}
          >
            Sign out
          </button>

          <div className="w-1 h-1 rounded-full bg-white/20" />

          <a
            href="mailto:support@northstar.com"
            className={`${unbounded.className} text-white/50 hover:text-white font-[300] text-[12px] leading-[100%] transition-colors cursor-pointer no-underline`}
            style={{ letterSpacing: "-0.02em" }}
          >
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}