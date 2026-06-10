import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { StrategyKey, StrategyResult } from "@/lib/analysis/types";

const STORAGE_KEY = "strategy-filter";

export const ALL_STRATEGY_KEYS: StrategyKey[] = ["BTL", "BRRR", "SA", "HMO", "FLIP", "TITLE_SPLIT"];

export const STRATEGY_LABELS: Record<StrategyKey, string> = {
  BTL: "Buy-to-let",
  BRRR: "BRRR",
  SA: "Serviced accommodation",
  HMO: "HMO",
  FLIP: "Flip",
  TITLE_SPLIT: "Title split",
};

type StrategyFilterContextValue = {
  selected: StrategyKey[];
  toggle: (key: StrategyKey) => void;
  setAll: (keys: StrategyKey[]) => void;
};

const StrategyFilterContext = createContext<StrategyFilterContextValue | null>(null);

function loadSelected(): StrategyKey[] {
  if (typeof window === "undefined") return ALL_STRATEGY_KEYS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return ALL_STRATEGY_KEYS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return ALL_STRATEGY_KEYS;
    const valid = parsed.filter((k): k is StrategyKey => ALL_STRATEGY_KEYS.includes(k));
    return valid.length > 0 ? valid : ALL_STRATEGY_KEYS;
  } catch {
    return ALL_STRATEGY_KEYS;
  }
}

export function StrategyFilterProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<StrategyKey[]>(ALL_STRATEGY_KEYS);

  useEffect(() => {
    setSelected(loadSelected());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
  }, [selected]);

  const toggle = (key: StrategyKey) => {
    setSelected((prev) => {
      const has = prev.includes(key);
      const next = has ? prev.filter((k) => k !== key) : [...prev, key];
      return next.length > 0 ? next : prev;
    });
  };

  const setAll = (keys: StrategyKey[]) => setSelected(keys.length > 0 ? keys : ALL_STRATEGY_KEYS);

  return (
    <StrategyFilterContext.Provider value={{ selected, toggle, setAll }}>
      {children}
    </StrategyFilterContext.Provider>
  );
}

export function useStrategyFilter() {
  const ctx = useContext(StrategyFilterContext);
  if (!ctx) throw new Error("useStrategyFilter must be used within a StrategyFilterProvider");
  return ctx;
}

/** Strategies in scope for the current lens, in their original order. */
export function strategiesInScope(strategies: StrategyResult[], selected: StrategyKey[]): StrategyResult[] {
  return strategies.filter((s) => selected.includes(s.key));
}

/** The highest-scoring feasible strategy among the selected lens, or null if none of the
 *  selected strategies are feasible for this property. */
export function bestOfSelected(strategies: StrategyResult[], selected: StrategyKey[]): StrategyResult | null {
  const feasible = strategiesInScope(strategies, selected).filter((s) => s.feasible);
  if (!feasible.length) return null;
  return feasible.reduce((best, s) => (s.dealScore > best.dealScore ? s : best));
}
