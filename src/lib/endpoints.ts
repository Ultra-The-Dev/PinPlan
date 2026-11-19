// Third-party data the browser fetches directly (map tiles, daily-log weather), configurable per deployment.
// Defaults work for development; a commercial deployment should set its own (docs/offline.md, "Map tiles and weather").

/** OpenStreetMap's public tiles: fine for development, not for a commercial app's traffic (tile usage policy). */
export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

export interface TileConfig {
  /** Leaflet URL template; `{key}` is filled from `options.key`. */
  url: string;
  options: { maxZoom: number; attribution: string; key?: string };
}

/**
 * Map tiles for the jobs map: NEXT_PUBLIC_MAP_TILE_URL (a Leaflet template such as
 * `https://tiles.example.com/{z}/{x}/{y}.png?key={key}`) with NEXT_PUBLIC_MAP_TILE_KEY and
 * NEXT_PUBLIC_MAP_TILE_ATTRIBUTION, else OpenStreetMap.
 */
export function mapTiles(
  env: { url?: string; key?: string; attribution?: string } = {
    url: process.env.NEXT_PUBLIC_MAP_TILE_URL,
    key: process.env.NEXT_PUBLIC_MAP_TILE_KEY,
    attribution: process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION,
  },
): TileConfig {
  const url = env.url?.trim();
  if (!url) return { url: OSM_TILE_URL, options: { maxZoom: 19, attribution: OSM_ATTRIBUTION } };
  const options: TileConfig["options"] = { maxZoom: 19, attribution: env.attribution?.trim() || OSM_ATTRIBUTION };
  if (env.key?.trim()) options.key = env.key.trim();
  return { url, options };
}

/**
 * Where the daily-log weather request goes. Without NEXT_PUBLIC_WEATHER_URL, straight to Open-Meteo's free API. With
 * it, the Open-Meteo path and query are kept and sent to that base instead: `/api/weather` uses this app's proxy
 * (which adds OPEN_METEO_API_KEY on the server for Open-Meteo's commercial API), or an https origin such as a
 * self-hosted Open-Meteo.
 */
export function weatherUrl(openMeteoUrl: string, base: string | undefined = process.env.NEXT_PUBLIC_WEATHER_URL): string {
  const b = base?.trim().replace(/\/+$/, "");
  if (!b) return openMeteoUrl;
  const u = new URL(openMeteoUrl);
  return `${b}${u.pathname}${u.search}`;
}

/** The https origin of NEXT_PUBLIC_WEATHER_URL when it points off-site (for the CSP), else null. */
export function weatherOrigin(base: string | undefined): string | null {
  const b = base?.trim();
  if (!b || b.startsWith("/")) return null;
  try {
    const u = new URL(b);
    return u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}
