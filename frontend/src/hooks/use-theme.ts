import { useTheme as useNextTheme } from "next-themes";
import { useCallback } from "react";
import { beginThemeTransition } from "@/lib/theme";

export function useAppTheme() {
  const { resolvedTheme, setTheme } = useNextTheme();

  const toggleTheme = useCallback(() => {
    beginThemeTransition();
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  return { theme: resolvedTheme ?? "light", setTheme, toggleTheme };
}

export const useTheme = useAppTheme;
