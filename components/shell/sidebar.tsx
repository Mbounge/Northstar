//components/shell/sidebar.tsx

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Layers, 
  Megaphone, 
  Briefcase,
  ArrowLeft,
  ChevronLeft,
  Bot
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  companyId: string;
}

export function Sidebar({ companyId }: SidebarProps) {
  const pathname = usePathname();
  const baseUrl = `/dashboard/${companyId}`;

  const NAV_ITEMS = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      href: baseUrl,
      exact: true
    },
    {
      label: "Product",
      icon: Layers,
      href: `${baseUrl}/product`,
    },
    {
      label: "Marketing",
      icon: Megaphone,
      href: `${baseUrl}/marketing`,
    },
    {
      label: "Business",
      icon: Briefcase,
      href: `${baseUrl}/business`,
    },
    {
      label: "Review Center",
      icon: Bot,
      href: "/review",
    },
  ];

  return (
    <div className="w-64 border-r border-zinc-800 bg-zinc-950 flex flex-col h-full shrink-0">
      
      {/* 1. GLOBAL NAVIGATION (Back to Home) */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
        <Link href="/">
          <Button variant="ghost" size="sm" className="w-full justify-start text-zinc-400 hover:text-white hover:bg-zinc-800 gap-2 pl-0">
            <ChevronLeft className="w-4 h-4" />
            Back to Portfolio
          </Button>
        </Link>
      </div>

      {/* 2. COMPANY HEADER */}
      <div className="p-6 pb-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Target</div>
        <h1 className="text-xl font-bold tracking-tighter text-white truncate" title={companyId}>
          {companyId.charAt(0).toUpperCase() + companyId.slice(1)}
        </h1>
        <div className="flex items-center gap-2 mt-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-emerald-500 font-mono">LIVE MONITORING</span>
        </div>
      </div>

      {/* 3. APP NAVIGATION */}
      <div className="flex-1 py-6 px-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact 
            ? pathname === item.href
            : pathname.startsWith(item.href);
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
                isActive 
                  ? "bg-zinc-800 text-white shadow-md border border-zinc-700/50" 
                  : "text-zinc-400 hover:text-white hover:bg-zinc-900"
              )}
            >
              <item.icon className={cn("w-4 h-4", isActive ? "text-blue-400" : "text-zinc-500")} />
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* 4. FOOTER */}
      <div className="p-4 border-t border-zinc-800 text-center">
        <p className="text-[10px] text-zinc-600 font-mono">COMPETITOR-OS v1.0</p>
      </div>
    </div>
  );
}