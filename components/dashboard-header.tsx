// components/dashboard-header.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Command, ShieldAlert } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/client";

export function DashboardHeader({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header className="h-12 border-b border-zinc-200 dark:border-zinc-800/60 px-6 flex items-center justify-between sticky top-0 z-50 bg-white/80 dark:bg-[#080808]/80 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-zinc-900 dark:bg-white rounded-md flex items-center justify-center">
          <Command className="w-3 h-3 text-white dark:text-zinc-900" />
        </div>
        <span className="text-[13px] font-medium text-zinc-900 dark:text-white tracking-tight">
          Northstar
        </span>
      </div>
      <div className="flex items-center gap-3">
        {isAdmin && (
          <Link href="/admin" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 text-[11px] font-bold uppercase tracking-wider hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors">
            <ShieldAlert className="w-3.5 h-3.5" /> Admin Portal
          </Link>
        )}
        <ThemeToggle />
        <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800" />
        <button
          onClick={handleSignOut}
          className="text-[12px] text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}