import { proxyWeather } from "@/lib/server/weatherProxy";
import { weatherGate } from "../gate";

// Daily-log weather via this server (NEXT_PUBLIC_WEATHER_URL=/api/weather); see src/lib/server/weatherProxy.ts.
// With a paid key, only signed-in people and this site's own pages may use it (../gate.ts).
export async function GET(request: Request) {
  return (await weatherGate(request)) ?? proxyWeather(request, "forecast");
}
