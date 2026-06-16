import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { useEffect, useRef, useState } from "react";
import { PropertyPopupCard, type PropertyCardData } from "./PropertyCard";

// Fix Leaflet's broken default icon paths in Vite/webpack bundles
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

type LatLng = { lat: number; lng: number };
type CacheEntry = { ll: LatLng | null; at: number };

// New key so stale null results from the old Nominatim-only approach don't persist.
const CACHE_KEY = "geo_cache_v2";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function loadCache(): Map<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, CacheEntry>;
    const now = Date.now();
    return new Map(Object.entries(obj).filter(([, v]) => now - v.at < CACHE_TTL_MS));
  } catch {
    return new Map();
  }
}

function saveCache(cache: Map<string, CacheEntry>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(cache)));
  } catch {}
}

// Batch UK postcode lookup via postcodes.io — no API key, no rate limit, very reliable.
// Returns Map<propertyId, LatLng | null>.
async function batchPostcodeIo(
  entries: Array<{ id: string; postcode: string }>,
): Promise<Map<string, LatLng | null>> {
  const result = new Map<string, LatLng | null>();
  if (!entries.length) return result;

  // Normalise postcodes and map them back to property IDs
  const normToIds = new Map<string, string[]>();
  for (const { id, postcode } of entries) {
    const norm = postcode.trim().toUpperCase();
    if (!normToIds.has(norm)) normToIds.set(norm, []);
    normToIds.get(norm)!.push(id);
  }

  try {
    const res = await fetch("https://api.postcodes.io/postcodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postcodes: Array.from(normToIds.keys()) }),
    });
    const data = await res.json();
    for (const item of (data.result ?? []) as Array<{ query: string; result: any }>) {
      const norm = item.query.trim().toUpperCase();
      const ids = normToIds.get(norm) ?? [];
      const ll: LatLng | null = item.result
        ? { lat: item.result.latitude, lng: item.result.longitude }
        : null;
      for (const id of ids) result.set(id, ll);
    }
  } catch {
    // On network error mark all as null; they'll retry on next load since null is cached
    for (const ids of normToIds.values()) for (const id of ids) result.set(id, null);
  }

  return result;
}

// Nominatim fallback — used only for properties without a postcode.
// Caller must enforce 1 100 ms between calls (Nominatim policy: max 1 req/s).
function buildNominatimQuery(p: any): string | null {
  const parts: string[] = [];
  if (p.address) parts.push(p.address);
  if (p.city) parts.push(p.city);
  parts.push("UK");
  return p.address ? parts.join(", ") : null;
}

async function nominatimLookup(query: string): Promise<LatLng | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { "Accept-Language": "en" } },
    );
    const data = await res.json();
    if (!data[0]) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

function scoreColor(score: number): string {
  if (score >= 60) return "#22c55e";
  if (score >= 40) return "#f59e0b";
  return "#94a3b8";
}

function makeDivIcon(score: number | null) {
  const color = score != null ? scoreColor(score) : "#94a3b8";
  const label = score != null ? String(score) : "?";
  return L.divIcon({
    html: `<div style="background:${color};color:#fff;font-weight:700;font-size:11px;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.35)">${label}</div>`,
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
}

function FitBounds({ coords }: { coords: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (!coords.length) return;
    if (coords.length === 1) {
      map.setView([coords[0].lat, coords[0].lng], 13);
      return;
    }
    const lats = coords.map((c) => c.lat);
    const lngs = coords.map((c) => c.lng);
    map.fitBounds([
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ], { padding: [48, 48], maxZoom: 14 });
  }, [map, coords]);
  return null;
}

export function PropertiesMap({ rows }: { rows: PropertyCardData[] }) {
  const [coordMap, setCoordMap] = useState<Map<string, LatLng | null>>(new Map());
  // keyed by propertyId
  const cacheRef = useRef<Map<string, LatLng | null>>(new Map());
  const geocodingRef = useRef(false);

  useEffect(() => {
    if (geocodingRef.current) return;

    // ── 1. Hydrate from localStorage ──────────────────────────────────────
    const lsCache = loadCache(); // Map<propertyId, CacheEntry>
    const hydrated = new Map<string, LatLng | null>();
    const needsGeo: typeof rows = [];

    for (const row of rows) {
      if (lsCache.has(row.p.id)) {
        hydrated.set(row.p.id, lsCache.get(row.p.id)!.ll);
      } else if (!cacheRef.current.has(row.p.id)) {
        needsGeo.push(row);
      }
    }

    if (hydrated.size) {
      cacheRef.current = new Map([...cacheRef.current, ...hydrated]);
      setCoordMap(new Map(cacheRef.current));
    }

    if (!needsGeo.length) return;

    geocodingRef.current = true;
    let cancelled = false;

    (async () => {
      // ── 2. Batch postcodes.io for properties that have a UK postcode ─────
      const withPostcode = needsGeo.filter((r) => !!r.p.postcode);
      const withoutPostcode = needsGeo.filter((r) => !r.p.postcode);

      if (withPostcode.length && !cancelled) {
        const pcResults = await batchPostcodeIo(
          withPostcode.map((r) => ({ id: r.p.id, postcode: r.p.postcode })),
        );
        for (const [id, ll] of pcResults) {
          cacheRef.current.set(id, ll);
          lsCache.set(id, { ll, at: Date.now() });
        }
        saveCache(lsCache);
        setCoordMap(new Map(cacheRef.current));
      }

      // ── 3. Nominatim fallback for properties without a postcode ──────────
      for (const { p } of withoutPostcode) {
        if (cancelled) break;
        const query = buildNominatimQuery(p);
        if (!query) { cacheRef.current.set(p.id, null); continue; }
        const ll = await nominatimLookup(query);
        cacheRef.current.set(p.id, ll);
        lsCache.set(p.id, { ll, at: Date.now() });
        saveCache(lsCache);
        setCoordMap(new Map(cacheRef.current));
        // Nominatim policy: max 1 request/second
        await new Promise<void>((r) => setTimeout(r, 1100));
      }

      geocodingRef.current = false;
    })();

    return () => { cancelled = true; geocodingRef.current = false; };
  }, [rows]);

  const placed = rows.flatMap((row) => {
    const ll = coordMap.get(row.p.id);
    return ll ? [{ row, ll }] : [];
  });
  const coords = placed.map((e) => e.ll);

  const unanswered = rows.filter((r) => !coordMap.has(r.p.id)).length;
  const failed = rows.filter((r) => coordMap.get(r.p.id) === null).length;

  const defaultCenter: [number, number] = [51.505, -0.09];

  return (
    // `isolate` creates a stacking context that contains Leaflet's internal z-indexes
    // (which go up to 1000), preventing them from leaking above the app's fixed overlay.
    <div className="relative isolate flex-1" style={{ minHeight: "60vh" }}>
      {unanswered > 0 && (
        <p className="absolute left-3 top-3 z-[1000] rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow">
          Locating {unanswered} {unanswered === 1 ? "property" : "properties"}…
        </p>
      )}
      {failed > 0 && unanswered === 0 && (
        <p className="absolute right-3 top-3 z-[1000] rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow">
          {failed} {failed === 1 ? "property" : "properties"} could not be located
        </p>
      )}
      <MapContainer
        center={defaultCenter}
        zoom={6}
        style={{ height: "100%", width: "100%", minHeight: "60vh", borderRadius: "0.75rem" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {coords.length > 0 && <FitBounds coords={coords} />}
        {placed.map(({ row, ll }) => (
          <Marker
            key={row.p.id}
            position={[ll.lat, ll.lng]}
            icon={makeDivIcon(row.a?.overallScore ?? null)}
          >
            <Popup>
              <PropertyPopupCard data={row} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
