import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getActiveTheme } from "@/lib/theme.functions";

type ColorMode = "light" | "dark";

const ColorModeContext = createContext<{ mode: ColorMode; toggle: () => void }>({
  mode: "light",
  toggle: () => {},
});

export function useColorMode() {
  return useContext(ColorModeContext);
}

function applyTheme(theme: Record<string, any> | null, mode: ColorMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");

  if (!theme) return;
  const vars = (mode === "dark" ? theme.dark : theme.light) as Record<string, string> | null;
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  }
  if (theme.radius) root.style.setProperty("--radius", theme.radius);
  if (theme.font_scale) root.style.fontSize = `${16 * Number(theme.font_scale)}px`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const getActiveThemeFn = useServerFn(getActiveTheme);
  const themeQ = useQuery({ queryKey: ["active-theme"], queryFn: () => getActiveThemeFn() });

  const [mode, setMode] = useState<ColorMode>("light");

  useEffect(() => {
    const stored = localStorage.getItem("color-mode");
    if (stored === "dark" || stored === "light") setMode(stored);
  }, []);

  useEffect(() => {
    applyTheme(themeQ.data ?? null, mode);
  }, [themeQ.data, mode]);

  const toggle = () => {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    localStorage.setItem("color-mode", next);
  };

  return <ColorModeContext.Provider value={{ mode, toggle }}>{children}</ColorModeContext.Provider>;
}
