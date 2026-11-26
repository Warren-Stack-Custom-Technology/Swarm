import type { GeoLocation } from "../types";
// Accept public unicast literals only. Never send private/LAN addresses to a lookup service.
export function isPublicIp(ip: string): boolean {
  if (ip.includes(":")) {
    try {
      const normalized = new URL(`https://[${ip}]/`).hostname.slice(1, -1);
      return (
        /^[23][0-9a-f]{3}:/i.test(normalized) &&
        !/^2001:(db8:|0:|:)/i.test(normalized) &&
        !/^2002:/i.test(normalized)
      );
    } catch {
      return false;
    }
  }
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  const [a, b, c] = ip.split(".").map(Number);
  if (
    ip
      .split(".")
      .some(
        (part) =>
          Number(part) > 255 || (part.length > 1 && part.startsWith("0")),
      )
  )
    return false;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export function parseGeoLocation(
  data: Record<string, unknown>,
): GeoLocation | undefined {
  if (typeof data.ip !== "string" || !isPublicIp(data.ip)) return;
  if (
    ![data.latitude, data.longitude].every(
      (value) =>
        (typeof value === "string" && value.trim() !== "") ||
        typeof value === "number",
    )
  )
    return;
  const latitude = Number(data.latitude);
  const longitude = Number(data.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return;
  return {
    ip: data.ip,
    latitude,
    longitude,
    label:
      [data.city, data.country]
        .filter((item) => typeof item === "string" && item)
        .join(", ") || data.ip,
  };
}

export class GeoLookup {
  private cache = new Map<string, { value?: GeoLocation; expires: number }>();
  private retryAt = 0;

  get(ip: string) {
    const entry = this.cache.get(ip);
    return entry && entry.expires > Date.now() ? entry.value : undefined;
  }

  async lookup(ips: string[], signal: AbortSignal) {
    if (Date.now() < this.retryAt) return false;
    const wanted = [...new Set(ips)]
      .filter(
        (ip) =>
          isPublicIp(ip) &&
          (!this.cache.has(ip) || this.cache.get(ip)!.expires < Date.now()),
      )
      .slice(0, 32);
    if (!wanted.length) return true;
    try {
      const query = new URLSearchParams({ ip: wanted.join(",") });
      const response = await fetch(
        `https://get.geojs.io/v1/ip/geo.json?${query}`,
        {
          signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
          credentials: "omit",
          referrerPolicy: "no-referrer",
        },
      );
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "Location service is busy; retrying in a minute."
            : "Location lookup unavailable; retrying in a minute.",
        );
      const payload: unknown = await response.json();
      const values = new Map<string, GeoLocation>();
      for (const item of Array.isArray(payload) ? payload : [payload]) {
        if (!item || typeof item !== "object") continue;
        const location = parseGeoLocation(item);
        if (location && wanted.includes(location.ip))
          values.set(location.ip, location);
      }
      if (signal.aborted) return;
      for (const ip of wanted)
        this.cache.set(ip, {
          value: values.get(ip),
          expires: Date.now() + (values.has(ip) ? 43_200_000 : 300_000),
        });
      while (this.cache.size > 5000)
        this.cache.delete(this.cache.keys().next().value!);
      return true;
    } catch (error) {
      if (signal.aborted) return;
      this.retryAt = Date.now() + 60_000;
      throw error;
    }
  }
}
