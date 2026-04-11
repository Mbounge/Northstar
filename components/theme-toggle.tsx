// components/theme-toggle.tsx
"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="
        w-9 h-9 flex items-center justify-center rounded-full 
        bg-white/40 dark:bg-white/5 backdrop-blur-md 
        border border-white/60 dark:border-white/10 
        text-zinc-700 dark:text-zinc-300 
        hover:bg-white/60 dark:hover:bg-white/10 
        transition-all shadow-none
      "
      title="Toggle theme"
    >
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}