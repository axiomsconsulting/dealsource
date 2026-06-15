import { supabase } from "@/integrations/supabase/client";

const RETURN_SESSION_KEY = "admin_return_session";

export interface StoredSession {
  access_token: string;
  refresh_token: string;
  email: string | null;
}

export function getReturnSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(RETURN_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function clearReturnSession() {
  sessionStorage.removeItem(RETURN_SESSION_KEY);
}

/** Stores the current (admin) session, then switches the active Supabase session to the
 *  target user's via a magic-link token hash minted server-side by `startImpersonation`. */
export async function switchToUser(tokenHash: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) throw new Error("No active session to switch from");

  const stored: StoredSession = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    email: session.user.email ?? null,
  };
  sessionStorage.setItem(RETURN_SESSION_KEY, JSON.stringify(stored));

  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (error) {
    clearReturnSession();
    throw error;
  }
}

/** Restores the stored admin session and clears the "viewing as" state. */
export async function switchBack() {
  const stored = getReturnSession();
  if (!stored) return;
  const { error } = await supabase.auth.setSession({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
  });
  clearReturnSession();
  if (error) throw error;
}
