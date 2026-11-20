import { proxyWeather } from "@/lib/server/weatherProxy";

// Daily-log weather via this server (NEXT_PUBLIC_WEATHER_URL=/api/weather); see src/lib/server/weatherProxy.ts.
export function GET(request: Request) {
  return proxyWeather(request, "forecast");
}
