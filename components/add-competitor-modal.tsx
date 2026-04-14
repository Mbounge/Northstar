// components/add-competitor-modal.tsx
"use client";

import { useState } from "react";
import { Plus, ArrowLeft } from "lucide-react";
import { Unbounded } from "next/font/google";

const unbounded = Unbounded({ subsets: ["latin"], weight: ["200", "300", "400", "600", "700"] });

export function AddCompetitorModal({ userEmail }: { userEmail: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* The Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="w-full h-[210px] bg-white/65 dark:bg-zinc-900/80 backdrop-blur-md border border-white/40 dark:border-white/10 flex flex-col items-center justify-center text-[#545454] dark:text-zinc-300 gap-2 hover:bg-white/70 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
      >
        <Plus className="w-5 h-5" />
        <span className="text-[14px] font-medium leading-[20px] tracking-[-0.15px]">
          Add new company
        </span>
      </button>

      {/* The Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-200">
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
              className="absolute top-8 left-8 p-2 text-white bg-transparent border-none cursor-pointer hover:opacity-70 transition-opacity"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            
            <h2 className={`${unbounded.className} text-center text-white tracking-[-0.02em] mb-10 m-0 p-0`}>
              <span className="font-[200] text-[36px] block leading-[1.1]">Add a new</span>
              <span className="font-[700] text-[36px] block leading-[1.1]">competitor</span>
            </h2>
            
            <p className={`${unbounded.className} text-[14px] font-[300] leading-[18px] text-white m-0 p-0 mb-2`}>
              We will notify you on:
            </p>
            <p className={`${unbounded.className} text-[22px] font-[400] leading-[18px] text-white m-0 p-0 mb-10`}>
              {userEmail}
            </p>
            
            <form className="flex flex-col w-[349px] gap-[8px]" onSubmit={(e) => { e.preventDefault(); setIsOpen(false); }}>
              <input
                type="text"
                placeholder="Company website"
                autoFocus
                className="w-full h-[56px] bg-transparent border border-zinc-300 dark:border-white px-4 text-[14px] text-white outline-none rounded-none box-border placeholder:text-zinc-500 focus:bg-white/5 transition-colors"
              />
              <button
                type="submit"
                className="w-full h-[56px] cursor-pointer bg-white/10 hover:bg-white/20 border-0 border-y border-white/30 hover:border-white/50 text-white rounded-none transition-all duration-300 ease-out flex items-center justify-center"
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