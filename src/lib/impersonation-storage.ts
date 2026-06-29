// Per-tab Supabase session isolation for super-admin "view as user" in a new tab.
//
// The browser Supabase client persists its session in localStorage, which is
// shared across all tabs on the same origin. To run an impersonation tab
// without disturbing the admin's own session in their other tabs, we shim the
// `sb-*` keys on `localStorage` to forward to `sessionStorage` (which is
// per-tab) *before* the Supabase client initialises.
//
// Activation: either the URL path is `/impersonate-as/...` (the entry route
// for a new impersonation tab) or the per-tab flag is already set.

const FLAG_KEY = "lovable_impersonation_mode"; // "new-tab" when active
const SB_PREFIX = "sb-";

export function isImpersonationTab(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(FLAG_KEY) === "new-tab";
  } catch {
    return false;
  }
}

export function markImpersonationTab() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(FLAG_KEY, "new-tab");
  } catch {
    /* ignore */
  }
}

export function maybeInstallImpersonationStorage() {
  if (typeof window === "undefined") return;
  const path = window.location?.pathname ?? "";
  const entering = path.startsWith("/impersonate-as/");
  if (entering) markImpersonationTab();
  if (!isImpersonationTab()) return;

  const ls = window.localStorage;
  const ss = window.sessionStorage;
  // Guard against double-install (HMR, repeated module eval).
  const flag = "__lovableSbShim__";
  if ((ls as unknown as Record<string, unknown>)[flag]) return;
  (ls as unknown as Record<string, unknown>)[flag] = true;

  const origGet = ls.getItem.bind(ls);
  const origSet = ls.setItem.bind(ls);
  const origRemove = ls.removeItem.bind(ls);

  ls.getItem = (k: string) => (k.startsWith(SB_PREFIX) ? ss.getItem(k) : origGet(k));
  ls.setItem = (k: string, v: string) =>
    k.startsWith(SB_PREFIX) ? ss.setItem(k, v) : origSet(k, v);
  ls.removeItem = (k: string) =>
    k.startsWith(SB_PREFIX) ? ss.removeItem(k) : origRemove(k);
}
