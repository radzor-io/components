// @radzor/ip-geolocation — Look up geographic data from IP addresses via ip-api.com

const API_BASE = "http://ip-api.com";
const SINGLE_ENDPOINT = `${API_BASE}/json`;
const BATCH_ENDPOINT = `${API_BASE}/batch`;
const FIELDS = "status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,query";

export interface IpGeolocationConfig {
  cacheTtl?: number;
  lang?: string;
}

export interface GeoResult {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  lat: number;
  lng: number;
  timezone: string;
  isp: string;
  org: string;
}

interface CacheEntry {
  result: GeoResult;
  expiresAt: number;
}

export type EventMap = {
  onLookup: { ip: string; country: string; cached: boolean };
  onError: { ip: string; message: string };
};

export type Listener<T> = (event: T) => void;

export class IpGeolocation {
  private cacheTtl: number;
  private lang: string;
  private cache: Map<string, CacheEntry> = new Map();
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  // Rate limiting: ip-api.com allows 45 req/min for free tier
  private requestTimestamps: number[] = [];
  private maxRequestsPerMinute = 45;

  constructor(config: IpGeolocationConfig = {}) {
    this.cacheTtl = config.cacheTtl ?? 3600000; // 1 hour
    this.lang = config.lang ?? "en";
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const list = this.listeners[event];
    if (list) {
      this.listeners[event] = list.filter((l) => l !== listener) as typeof list;
    }
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  /** Look up geographic data for a single IP address. */
  async lookup(ip: string): Promise<GeoResult> {
    this.validateIp(ip);

    // Check cache
    const cached = this.getFromCache(ip);
    if (cached) {
      this.emit("onLookup", { ip, country: cached.country, cached: true });
      return cached;
    }

    await this.enforceRateLimit();

    try {
      const url = `${SINGLE_ENDPOINT}/${encodeURIComponent(ip)}?fields=${FIELDS}&lang=${this.lang}`;
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();

      if (data.status === "fail") {
        throw new Error(data.message || "IP lookup failed");
      }

      const result = this.mapResult(data);
      this.setCache(ip, result);
      this.emit("onLookup", { ip, country: result.country, cached: false });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { ip, message });
      throw err;
    }
  }

  /** Look up geographic data for multiple IP addresses in a single batch request. */
  async bulkLookup(ips: string[]): Promise<GeoResult[]> {
    if (ips.length === 0) return [];
    if (ips.length > 100) {
      throw new Error("Bulk lookup is limited to 100 IPs per batch.");
    }

    // Separate cached and uncached IPs
    const results: Map<string, GeoResult> = new Map();
    const uncachedIps: string[] = [];

    for (const ip of ips) {
      this.validateIp(ip);
      const cached = this.getFromCache(ip);
      if (cached) {
        results.set(ip, cached);
        this.emit("onLookup", { ip, country: cached.country, cached: true });
      } else {
        uncachedIps.push(ip);
      }
    }

    // Fetch uncached IPs in batch
    if (uncachedIps.length > 0) {
      await this.enforceRateLimit();

      try {
        const body = uncachedIps.map((ip) => ({
          query: ip,
          fields: FIELDS,
          lang: this.lang,
        }));

        const res = await fetch(BATCH_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const dataArray: any[] = await res.json();

        for (const data of dataArray) {
          const ip = data.query;
          if (data.status === "fail") {
            this.emit("onError", { ip, message: data.message || "Lookup failed" });
            // Return a partial result for failed IPs
            results.set(ip, {
              ip,
              country: "",
              countryCode: "",
              region: "",
              city: "",
              lat: 0,
              lng: 0,
              timezone: "",
              isp: "",
              org: "",
            });
          } else {
            const result = this.mapResult(data);
            this.setCache(ip, result);
            results.set(ip, result);
            this.emit("onLookup", { ip, country: result.country, cached: false });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        for (const ip of uncachedIps) {
          if (!results.has(ip)) {
            this.emit("onError", { ip, message });
          }
        }
        throw err;
      }
    }

    // Return results in input order
    return ips.map((ip) => results.get(ip)!);
  }

  /** Clear the lookup cache. */
  clearCache(): void {
    this.cache.clear();
  }

  /** Get the number of cached entries. */
  get cacheSize(): number {
    return this.cache.size;
  }

  private mapResult(data: any): GeoResult {
    return {
      ip: data.query ?? "",
      country: data.country ?? "",
      countryCode: data.countryCode ?? "",
      region: data.regionName ?? data.region ?? "",
      city: data.city ?? "",
      lat: data.lat ?? 0,
      lng: data.lon ?? 0,
      timezone: data.timezone ?? "",
      isp: data.isp ?? "",
      org: data.org ?? "",
    };
  }

  private getFromCache(ip: string): GeoResult | null {
    const entry = this.cache.get(ip);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(ip);
      return null;
    }

    return entry.result;
  }

  private setCache(ip: string, result: GeoResult): void {
    this.cache.set(ip, {
      result,
      expiresAt: Date.now() + this.cacheTtl,
    });
  }

  private validateIp(ip: string): void {
    // IPv4 validation
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    // IPv6 validation (simplified)
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

    if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
      throw new Error(`Invalid IP address: "${ip}"`);
    }

    if (ipv4Regex.test(ip)) {
      const octets = ip.split(".").map(Number);
      if (octets.some((o) => o > 255)) {
        throw new Error(`Invalid IP address: "${ip}" — octet out of range`);
      }
    }
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove timestamps older than 1 minute
    this.requestTimestamps = this.requestTimestamps.filter((ts) => ts > oneMinuteAgo);

    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      // Wait until the oldest request in the window expires
      const waitMs = this.requestTimestamps[0] + 60000 - now + 100;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.requestTimestamps = this.requestTimestamps.filter((ts) => ts > Date.now() - 60000);
    }

    this.requestTimestamps.push(now);
  }
}

export default IpGeolocation;
