import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { Unbounded } from "next/font/google";
import { ThemeToggle } from "@/components/theme-toggle";
import { CaptureConsole } from "@/components/admin/capture-console";

const unbounded = Unbounded({ subsets: ["latin"], weight: ["300", "600"] });

export default function AdminCapturesPreviewPage() {
  if (process.env.NODE_ENV === "production" || process.env.NORTHSTAR_E2E !== "1") notFound();

  return (
    <div className="relative min-h-screen bg-[#EEF0F8] dark:bg-[#09090b] flex flex-col overflow-hidden font-sans">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex items-center justify-center">
        <div className="relative flex-shrink-0" style={{ width: 1450, height: 1450, transform: "rotate(310deg)", opacity: 0.3, mixBlendMode: "multiply", filter: "blur(48px)" }}>
          <Image src="/topaz_enhance.png" alt="" fill className="object-cover -scale-x-100" priority quality={80} />
        </div>
      </div>
      <header className="relative z-10 w-full px-8 pt-9 pb-6 flex items-center justify-between box-border">
        <div className="flex items-center gap-4">
          <Link href="/admin" aria-label="Back to admin" className="p-2 transition-opacity hover:opacity-70"><ArrowLeft className="w-5 h-5 text-zinc-900 dark:text-white" strokeWidth={2.5} /></Link>
          <h1 className={`${unbounded.className} text-[30px] font-semibold tracking-tight text-[#0A0A0A] dark:text-white m-0`}>North Star <span className="font-[300] opacity-50">Admin</span></h1>
        </div>
        <ThemeToggle />
      </header>
      <div className="relative z-10 w-full px-12 mb-6"><div className="flex items-center gap-8 border-b border-black/10 dark:border-white/10 h-[49px] text-[16px] font-medium text-black/50 dark:text-white/50"><span className="px-4">Requests</span><span className="px-4">Directory</span><span className="px-4">Organizations</span><span className="px-4 h-full flex items-center border-b-2 border-black dark:border-white font-bold text-black dark:text-white">Captures</span></div></div>
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-12 pb-20 box-border"><CaptureConsole organizations={[{ id: "team-a", name: "Partner workspace" }, { id: "team-b", name: "Research workspace" }]} /></main>
    </div>
  );
}
