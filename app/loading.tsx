// app/loading.tsx
import Image from "next/image";
import { Loader2 } from "lucide-react";

export default function LoadingPortfolio() {
  return (
    <div className="flex h-screen w-full items-center justify-center relative bg-[#EEF0F8] dark:bg-[#09090b]">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex items-center justify-center">
        <div className="relative flex-shrink-0 opacity-30 mix-blend-multiply blur-[48px]" style={{ width: '1450px', height: '1450px', transform: 'rotate(310deg)' }}>
          <Image src="/topaz_enhance.png" alt="Ambient" fill className="object-cover -scale-x-100" priority />
        </div>
      </div>
      <Loader2 className="relative z-10 w-8 h-8 animate-spin text-black dark:text-white opacity-50" />
    </div>
  );
}