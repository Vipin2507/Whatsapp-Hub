import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      // UPDATED className:
      // 1. Added default light mode styles: bg-white, border-slate-200, hover:bg-slate-100
      // 2. Prefixed your existing dark styles with 'dark:': dark:bg-slate-800/50, etc.
      className="rounded-full w-9 h-9 transition-all duration-500 bg-white border border-slate-200 hover:bg-slate-100 dark:bg-slate-800/50 dark:border-slate-700 dark:hover:bg-indigo-500/20"
    >
      {theme === "dark" ? (
       
        <Sun className="h-4 w-4 text-amber-400 rotate-0 scale-100 transition-all" />
      ) : (
    
        <Moon className="h-4 w-4 text-slate-900 rotate-0 scale-100 transition-all" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}