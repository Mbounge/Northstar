// app/[companyId]/loading.tsx
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { Unbounded } from "next/font/google";

const unbounded = Unbounded({ subsets: ["latin"], weight: ["200", "300", "600"] });

export default function LoadingDashboard() {
  return (
    <div className="flex h-screen w-full items-center justify-center relative font-sans bg-[#EEF0F8] dark:bg-[#050505]">
      {/* ── AMBIENT BACKGROUND ── */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex items-center justify-center">
        <div 
          className="relative flex-shrink-0 opacity-30 dark:opacity-20 mix-blend-multiply blur-[48px]"
          style={{ width: '1450px', height: '1450px', transform: 'rotate(310deg)' }}
        >
          <Image src="/topaz_enhance.png" alt="Ambient Background" fill className="object-cover -scale-x-100" priority />
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 animate-in fade-in duration-500">
        <Loader2 className="w-10 h-10 animate-spin text-zinc-900 dark:text-white opacity-50" />
        <h2 className={`${unbounded.className} text-[24px] font-[300] text-zinc-900 dark:text-white tracking-tight`}>
          Loading workspace...
        </h2>
      </div>
    </div>
  );
}