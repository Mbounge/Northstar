// components/add-competitor-modal.tsx
"use client";

import { useState, useEffect } from "react";
import { Plus, ArrowLeft, Loader2, Check, AlertCircle } from "lucide-react";
import { Unbounded } from "next/font/google";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const unbounded = Unbounded({ subsets: ["latin"], weight: ["200", "300", "400", "600", "700"] });

interface ModalProps {
  userEmail: string;
  variant: "card" | "text";
}

export function AddCompetitorModal({ userEmail, variant }: ModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "empty" | "invalid" | "backend-error" | "loading" | "success">("idle");
  const supabase = createClient();

  useEffect(() => {
    const bottomBar = document.getElementById("bottom-bar");
    if (!bottomBar) return;
    if (isOpen) {
      bottomBar.style.opacity = "0";
      bottomBar.style.visibility = "hidden";
    } else {
      bottomBar.style.opacity = "1";
      bottomBar.style.visibility = "visible";
      setUrl("");
      setStatus("idle");
    }
    return () => {
      bottomBar.style.opacity = "1";
      bottomBar.style.visibility = "visible";
    };
  }, [isOpen]);

  // Robust URL/Domain regex validation
  const isValidUrl = (string: string) => {
    // Accepts: domain.com, www.domain.com, http://domain.com, https://sub.domain.co.uk
    const pattern = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/i;
    return pattern.test(string);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = url.trim();
    
    // 1. Check if empty
    if (!cleanUrl) {
      setStatus("empty");
      return;
    }

    // 2. Check if it's a valid domain/url format
    if (!isValidUrl(cleanUrl)) {
      setStatus("invalid");
      return;
    }

    setStatus("loading");

    // Get current user securely
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setStatus("backend-error");
      setTimeout(() => setStatus("idle"), 2500);
      return;
    }

    // Insert into Supabase
    const { error } = await supabase
      .from('competitor_requests')
      .insert({
        user_id: user.id,
        website_url: cleanUrl,
      });

    // Graceful Backend Error Handling
    if (error) {
      setStatus("backend-error");
      setTimeout(() => setStatus("idle"), 2500);
      return;
    }

    // Success Animation Sequence
    setStatus("success");
    setTimeout(() => {
      setIsOpen(false);
    }, 1200); 
  };

  return (
    <>
      {variant === "card" ? (
        <button
          onClick={() => setIsOpen(true)}
          className="w-full h-[210px] bg-white/65 dark:bg-zinc-900/80 backdrop-blur-md border border-white/40 dark:border-white/10 flex flex-col items-center justify-center text-[#545454] dark:text-zinc-300 gap-2 hover:bg-white/70 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer shadow-none outline-none"
        >
          <Plus className="w-5 h-5" />
          <span className="text-[14px] font-medium leading-[20px] tracking-[-0.15px]">
            Add new company
          </span>
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-[4px] bg-transparent border-none p-0 cursor-pointer whitespace-nowrap hover:opacity-70 transition-opacity duration-200 outline-none"
        >
          <Plus className="w-5 h-5 text-[#000000] dark:text-white" />
          <span className="font-sans font-[500] text-[16px] leading-[24px] tracking-[-0.02em] text-[#000000] dark:text-white">
            Add new company
          </span>
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-200">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="relative z-10 w-[599px] h-[535px] flex flex-col items-center justify-center border border-white/10 animate-in zoom-in-95 duration-300"
            style={{
              background: "rgba(0,0,0,0.60)",
              backdropFilter: "blur(24px)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.40)",
            }}
          >
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-[53px] left-[43px] w-[35px] h-[35px] flex items-center justify-center text-white bg-transparent border-none cursor-pointer hover:opacity-70 transition-opacity outline-none"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            
            <h2 
              className={`${unbounded.className} absolute text-center text-[#ffffff] m-0 p-0 tracking-[-0.02em]`}
              style={{ width: '251px', height: '63px', top: '49px', left: '174px' }}
            >
              <span className="font-[200] text-[36px] block leading-[100%]">Add a new</span>
              <span className="font-[700] text-[36px] block leading-[100%]">competitor</span>
            </h2>
            
            <p 
              className={`${unbounded.className} absolute flex items-end justify-center text-center text-[#ffffff] font-[300] text-[14px] leading-[18px] tracking-[0%] m-0 p-0`}
              style={{ width: '169px', height: '18px', top: '190px', left: '216px' }}
            >
              We will notify you on:
            </p>
            
            <p 
              className={`${unbounded.className} absolute flex items-end justify-center text-center text-[#ffffff] font-[400] text-[22px] leading-[18px] tracking-[0%] m-0 p-0`}
              style={{ width: '224px', height: '18px', top: '214px', left: '188px' }}
            >
              {userEmail}
            </p>
            
            <form onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder="Company website"
                autoFocus
                value={url}
                onChange={(e) => { setUrl(e.target.value); setStatus("idle"); }}
                className={cn(
                  "absolute bg-transparent border px-4 text-[14px] text-white outline-none rounded-none box-border focus:bg-white/5 transition-all",
                  (status === "empty" || status === "invalid") 
                    ? "border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)] placeholder:text-rose-400/70" 
                    : "border-zinc-300 dark:border-white placeholder:text-zinc-500"
                )}
                style={{ width: '349px', height: '56px', top: '310px', left: '125px' }}
              />

              {/* ── VALIDATION ERROR MESSAGE ── */}
              {(status === "empty" || status === "invalid") && (
                <div 
                  className="absolute text-rose-400 text-[11px] font-medium font-sans animate-in slide-in-from-top-1 fade-in duration-200"
                  style={{ top: '370px', left: '125px', width: '349px' }}
                >
                  {status === "empty" ? "Website URL is required." : "Please enter a valid domain (e.g., company.com)"}
                </div>
              )}

              <button
                type="submit"
                disabled={status === "loading" || status === "success" || status === "backend-error"}
                className={cn(
                  "absolute cursor-pointer border-0 border-y rounded-none transition-all duration-300 ease-out flex items-center justify-center outline-none",
                  status === "success" 
                    ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                    : status === "backend-error"
                    ? "bg-rose-500/20 border-rose-500 text-rose-400"
                    : "bg-white/10 hover:bg-white/20 border-white/30 hover:border-white/50 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                )}
                style={{ width: '349px', height: '56px', top: '394px', left: '125px' }} // Pushed down slightly (385->394) to make room for error text
              >
                {status === "loading" ? (
                  <Loader2 className="w-5 h-5 animate-spin text-white/70" />
                ) : status === "success" ? (
                  <span className="font-sans text-[16px] font-[700] leading-[24px] tracking-[-0.01em] flex items-center gap-2">
                    <Check className="w-5 h-5" strokeWidth={3} /> Submitted
                  </span>
                ) : status === "backend-error" ? (
                  <span className="font-sans text-[16px] font-[700] leading-[24px] tracking-[-0.01em] flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" strokeWidth={2.5} /> Submission Failed
                  </span>
                ) : (
                  <span className="font-sans text-[16px] font-[700] leading-[24px] tracking-[-0.01em]">
                    Submit
                  </span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}