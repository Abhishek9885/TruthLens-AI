/**
 * Pure SSRF and URL safety validation shared by client forms, Zod schemas,
 * and server-side HTTP extractors.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata",
]);

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
  ".arpa",
];

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function parseIpv4Parts(ip: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return null;
  const parts = ip.split(".").map(Number);
  if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return parts;
}

function isBlockedIpv4Parts(parts: number[]): boolean {
  const [a, b, c] = parts;
  if (a === 0) return true; // 0.0.0.0/8 ("this network")
  if (a === 10) return true; // 10.0.0.0/8 (RFC1918)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local & cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC1918)
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 (IETF protocol assignments)
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 88 && c === 99) return true; // 192.88.99.0/24 (6to4 relay)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC1918)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (benchmark)
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 (TEST-NET-2)
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 (TEST-NET-3)
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved/broadcast
  return false;
}

/**
 * Expands an IPv6 address (or IPv4-embedded IPv6 like ::ffff:127.0.0.1)
 * into eight 16-bit integer groups so CIDR checks cover hex and shorthand forms.
 */
function expandIpv6Groups(rawIp: string): number[] | null {
  const noZone = rawIp.split("%")[0].toLowerCase();
  if (!noZone.includes(":")) return null;

  let working = noZone;
  // Convert trailing dotted-quad IPv4 segment (e.g., ::ffff:127.0.0.1 -> ::ffff:7f00:0001)
  const lastColon = working.lastIndexOf(":");
  const tail = working.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4Parts(tail);
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    working = working.slice(0, lastColon + 1) + `${hi}:${lo}`;
  }

  const parts = working.split("::");
  if (parts.length > 2) return null;

  const left = parts[0] ? parts[0].split(":").filter(Boolean) : [];
  const right = parts.length === 2 && parts[1] ? parts[1].split(":").filter(Boolean) : [];

  if (parts.length === 1 && left.length !== 8) return null;
  if (parts.length === 2 && left.length + right.length >= 8) return null;

  const missing = parts.length === 2 ? 8 - (left.length + right.length) : 0;
  const fullHex = [...left, ...Array(missing).fill("0"), ...right];
  if (fullHex.length !== 8) return null;

  const groups: number[] = [];
  for (const h of fullHex) {
    if (!/^[0-9a-f]{1,4}$/.test(h)) return null;
    groups.push(parseInt(h, 16));
  }
  return groups;
}

export function isBlockedIpAddress(rawIp: string): boolean {
  const clean = stripIpv6Brackets(rawIp.trim());
  const v4 = parseIpv4Parts(clean);
  if (v4) {
    return isBlockedIpv4Parts(v4);
  }

  const v6 = expandIpv6Groups(clean);
  if (v6) {
    const allZeroPrefix =
      v6[0] === 0 && v6[1] === 0 && v6[2] === 0 && v6[3] === 0 && v6[4] === 0;

    // Unspecified (::) and loopback (::1)
    if (allZeroPrefix && v6[5] === 0 && v6[6] === 0 && (v6[7] === 0 || v6[7] === 1)) {
      return true;
    }

    // IPv4-mapped (::ffff:0:0/96) and IPv4-compatible (::/96) — check embedded IPv4
    if (allZeroPrefix && (v6[5] === 0xffff || v6[5] === 0)) {
      const embeddedV4 = [
        (v6[6] >> 8) & 0xff,
        v6[6] & 0xff,
        (v6[7] >> 8) & 0xff,
        v6[7] & 0xff,
      ];
      return isBlockedIpv4Parts(embeddedV4);
    }

    // IPv4-translated (64:ff9b::/96)
    if (
      v6[0] === 0x0064 &&
      v6[1] === 0xff9b &&
      v6[2] === 0 &&
      v6[3] === 0 &&
      v6[4] === 0 &&
      v6[5] === 0
    ) {
      return true;
    }

    // Discard-only (100::/64)
    if (v6[0] === 0x0100 && v6[1] === 0 && v6[2] === 0 && v6[3] === 0) {
      return true;
    }

    // Teredo (2001::/32) & benchmarking (2001:2::/48) & documentation (2001:db8::/32)
    if (v6[0] === 0x2001 && (v6[1] === 0 || v6[1] === 0x0002 || v6[1] === 0x0db8)) {
      return true;
    }

    // Unique local IPv6 (fc00::/7)
    if ((v6[0] & 0xfe00) === 0xfc00) return true;

    // Link-local (fe80::/10)
    if ((v6[0] & 0xffc0) === 0xfe80) return true;

    // Multicast (ff00::/8)
    if ((v6[0] & 0xff00) === 0xff00) return true;

    return false;
  }

  return true;
}

export function isBlockedHostnameOrIp(rawHostname: string): {
  blocked: boolean;
  reason?: string;
} {
  const normalized = stripIpv6Brackets(rawHostname.trim().toLowerCase()).replace(
    /\.+$/,
    ""
  );

  if (!normalized) {
    return { blocked: true, reason: "URL hostname is empty." };
  }

  if (
    BLOCKED_HOSTNAMES.has(normalized) ||
    BLOCKED_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  ) {
    return {
      blocked: true,
      reason: "Localhost and internal hostnames are not permitted.",
    };
  }

  // Literal IPv4 or IPv6
  const looksLikeIp =
    parseIpv4Parts(normalized) !== null || normalized.includes(":");
  if (looksLikeIp) {
    if (isBlockedIpAddress(normalized)) {
      return {
        blocked: true,
        reason: "Private, loopback, link-local, or reserved IP addresses are not permitted.",
      };
    }
    return { blocked: false };
  }

  // Require at least one dot for public domain names (blocks bare intranet aliases like http://redis)
  if (!normalized.includes(".")) {
    return {
      blocked: true,
      reason: "Hostname must be a public domain name or public IP address.",
    };
  }

  return { blocked: false };
}

export function validatePublicHttpUrl(
  rawUrl: string
): { ok: true; url: URL } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: "Please enter a valid http:// or https:// URL." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      error: `Unsupported URL protocol "${parsed.protocol}". Only http:// and https:// URLs are allowed.`,
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      error: "URLs containing embedded credentials are not permitted.",
    };
  }

  const hostCheck = isBlockedHostnameOrIp(parsed.hostname);
  if (hostCheck.blocked) {
    return {
      ok: false,
      error: hostCheck.reason ?? "Target host is not permitted.",
    };
  }

  return { ok: true, url: parsed };
}
