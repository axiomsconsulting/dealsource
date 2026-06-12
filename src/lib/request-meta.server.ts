import { getRequest } from "@tanstack/react-start/server";

export function getRequestIp(): string | null {
  const request = getRequest();
  const forwardedFor = request?.headers?.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = request?.headers?.get("x-real-ip");
  if (realIp) return realIp.trim();
  return null;
}

export async function lookupGeo(
  ip: string | null,
): Promise<{ city: string | null; country: string | null }> {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return { city: null, country: null };
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`);
    if (!res.ok) return { city: null, country: null };
    const data = await res.json();
    return { city: data?.city ?? null, country: data?.country_name ?? null };
  } catch {
    return { city: null, country: null };
  }
}
