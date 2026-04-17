// components/add-competitor-modal.tsx
"use client";

import { useState, useEffect} from "react";
import { Plus, ArrowLeft } from "lucide-react";
import { Unbounded } from "next/font/google";

const unbounded = Unbounded({ subsets: ["latin"], weight: ["200", "300", "400", "600", "700"] });

interface ModalProps {
  userEmail: string;
  variant: "card" | "text";
}

export function AddCompetitorModal({ userEmail, variant }: ModalProps) {
  const [isOpen, setIsOpen] = useState(false);


  useEffect(() => {
    const bottomBar = document.getElementById("bottom-bar");
    if (!bottomBar) return;

    if (isOpen) {
      bottomBar.style.opacity = "0";
      bottomBar.style.visibility = "hidden";
    } else {
      bottomBar.style.opacity = "1";
      bottomBar.style.visibility = "visible";
    }

    // Cleanup function ensures it reappears if the modal is suddenly unmounted
    return () => {
      bottomBar.style.opacity = "1";
      bottomBar.style.visibility = "visible";
    };
  }, [isOpen]);

  return (
    <>
      {/* ── THE TRIGGER BUTTONS ── */}
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
          {/* EXACT FIGMA SPECS APPLIED HERE */}
          <span className="font-sans font-[500] text-[16px] leading-[24px] tracking-[-0.02em] text-[#000000] dark:text-white">
            Add new company
          </span>
        </button>
      )}

      {/* ── THE MODAL ── */}
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
              style={{
                width: '251px',
                height: '63px',
                top: '49px',
                left: '174px'
              }}
            >
              <span className="font-[200] text-[36px] block leading-[100%]">Add a new</span>
              <span className="font-[700] text-[36px] block leading-[100%]">competitor</span>
            </h2>
            
            <p 
              className={`${unbounded.className} absolute flex items-end justify-center text-center text-[#ffffff] font-[300] text-[14px] leading-[18px] tracking-[0%] m-0 p-0`}
              style={{
                width: '169px',
                height: '18px',
                top: '190px',
                left: '216px'
              }}
            >
              We will notify you on:
            </p>
            
            <p 
              className={`${unbounded.className} absolute flex items-end justify-center text-center text-[#ffffff] font-[400] text-[22px] leading-[18px] tracking-[0%] m-0 p-0`}
              style={{
                width: '224px',
                height: '18px',
                top: '214px',
                left: '188px'
              }}
            >
              {userEmail}
            </p>
            
            <form onSubmit={(e) => { e.preventDefault(); setIsOpen(false); }}>
              <input
                type="text"
                placeholder="Company website"
                autoFocus
                className="absolute bg-transparent border border-zinc-300 dark:border-white px-4 text-[14px] text-white outline-none rounded-none box-border placeholder:text-zinc-500 focus:bg-white/5 transition-colors"
                style={{
                  width: '349px',
                  height: '56px',
                  top: '310px',
                  left: '125px'
                }}
              />
              <button
                type="submit"
                className="absolute cursor-pointer bg-white/10 hover:bg-white/20 border-0 border-y border-white/30 hover:border-white/50 text-white rounded-none transition-all duration-300 ease-out flex items-center justify-center outline-none"
                style={{
                  width: '349px',
                  height: '56px',
                  top: '385px',
                  left: '125px'
                }}
              >
                <span className="font-sans text-[16px] font-[700] leading-[24px] tracking-[-0.01em] text-white">
                  Submit
                </span>
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}