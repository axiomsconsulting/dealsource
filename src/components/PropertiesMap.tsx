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

const CACHE_KEY = "nominatim_cache_v1";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function loadGeoCache(): Map<string, CacheEntry> {
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

function saveGeoCache(cache: Map<string, CacheEntry>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(cache)));
  } catch {}
}

// Build the best possible Nominatim query from available property fields.
// Includes city and country so ambiguous street names resolve correctly.
function buildQuery(p: any): string | null {
  const parts: string[] = [];
  if (p.address) parts.push(p.address);
  if (p.city) parts.push(p.city);
  if (p.postcode) parts.push(p.postcode);
  parts.push("UK");
  return parts.length > 1 ? parts.join(", ") : null;
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

async function geocodeQuery(query: string): Promise<LatLng | null> {
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

export function PropertiesMap({ rows }: { rows: PropertyCardData[] }) {
  const [coordMap, setCoordMap] = useState<Map<string, LatLng | null>>(new Map());
  const cacheRef = useRef<Map<string, LatLng | null>>(new Map());
  const geocodingRef = useRef(false);

  useEffect(() => {
    if (geocodingRef.current) return;

    // Load cached geocode results from localStorage so returning users skip the wait
    const lsCache = loadGeoCache();
    const hydrated: Map<string, LatLng | null> = new Map();

    const todo: typeof rows = [];
    for (const row of rows) {
      const q = buildQuery(row.p);
      if (!q) continue;
      if (lsCache.has(q)) {
        hydrated.set(row.p.id, lsCache.get(q)!.ll);
      } else if (!cacheRef.current.has(row.p.id)) {
        todo.push(row);
      }
    }

    if (hydrated.size) {
      cacheRef.current = new Map([...cacheRef.current, ...hydrated]);
      setCoordMap(new Map(cacheRef.current));
    }

    if (!todo.length) return;

    geocodingRef.current = true;
    let cancelled = false;
    (async () => {
      for (const { p } of todo) {
        if (cancelled) break;
        const query = buildQuery(p)!;
        const result = await geocodeQuery(query);
        cacheRef.current.set(p.id, result);
        // Persist to localStorage so the next map visit is instant
        lsCache.set(query, { ll: result, at: Date.now() });
        saveGeoCache(lsCache);
        setCoordMap(new Map(cacheRef.current));
        // Nominatim policy: max 1 request/second — 1100 ms gives a safe margin
        await new Promise<void>((res) => setTimeout(res, 1100));
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

  // Count only properties that have a geocodable query but no coordinate yet
  const unanswered = rows.filter((r) => buildQuery(r.p) && !coordMap.has(r.p.id)).length;
  const failed = rows.filter((r) => coordMap.get(r.p.id) === null).length;

  const defaultCenter: [number, number] = [51.505, -0.09]; // London

  return (
    <div className="relative flex-1" style={{ minHeight: "60vh" }}>
      {unanswered > 0 && (
        <p className="absolute left-3 top-3 z-[1000] rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow">
          Locating {unanswered} {unanswered === 1 ? "property" : "properties"}…
        </p>
      )}
      {failed > 0 && coordMap.size > 0 && unanswered === 0 && (
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
