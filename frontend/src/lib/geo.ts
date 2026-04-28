// Not-so-accurate list of countries with active anti-piracy enforcement against torrent users (please contribute if you know better)
export const RISKY_COUNTRIES: Record<string, string> = {
  AE: "United Arab Emirates — Strict copyright statute with criminal penalties; ISPs block and report infringing traffic.",
  AT: "Austria — Active enforcement; rights holders can compel ISPs to disclose subscriber identity.",
  AU: "Australia — ISPs forward copyright notices and the Federal Court has unmasked downloaders for damages.",
  BE: "Belgium — Court-ordered ISP blocks and individual prosecutions are routine.",
  CA: "Canada — Notice-and-notice forwarding is mandatory; statutory damages up to CA$5,000 per infringement.",
  CH: "Switzerland — 2020 copyright law enables ISP-level enforcement against persistent infringers.",
  DE: "Germany — Copyright lawyers send €1000+ fines (Abmahnung) within days of detection. Among the most aggressively monitored swarms in the world.",
  DK: "Denmark — Copyright lawyers send settlement demands; courts have unmasked users for damages.",
  ES: "Spain — Sinde-Wert law and recent reforms enable site blocks and user prosecution.",
  FI: "Finland — Copyright trolls actively sue downloaders; settlement letters are common.",
  FR: "France — HADOPI / ARCOM tracks IPs and issues fines that can escalate to internet suspension.",
  GB: "United Kingdom — ISPs forward copyright infringement letters; persistent torrenting can lead to legal action.",
  IE: "Ireland — Three-strikes (graduated response) regime in place at major ISPs.",
  IN: "India — Anti-piracy enforcement is escalating; ISPs block torrent sites and the IT Act allows prosecution of users.",
  IT: "Italy — Active anti-piracy enforcement; fines for repeat infringers and ISP-level blocks.",
  JP: "Japan — Downloading or uploading copyrighted material can carry criminal penalties (up to 2 years prison or ¥2 million fine).",
  KR: "South Korea — Three-strikes regime; criminal penalties available against individual users.",
  NL: "Netherlands — BREIN (rights-holder enforcement org) actively pursues downloaders; courts have ordered ISP disclosures.",
  NO: "Norway — Settlement letters from rights holders are common; courts compel ISPs to disclose subscriber data.",
  NZ: 'New Zealand — "Skynet law" (Copyright (Infringing File Sharing) Amendment Act) penalizes repeat offenders up to NZ$15,000.',
  PL: "Poland — Lawyers actively pursue downloaders; settlement demands are frequent.",
  PT: "Portugal — IPRED enforcement; ISPs share user data with rights holders.",
  SE: "Sweden — IPRED gives rights holders access to subscriber data via court order.",
  SG: "Singapore — Strict copyright enforcement; civil and criminal penalties for individual downloaders.",
  US: "United States — DMCA notices and copyright lawsuits are routine. ISPs forward complaints and may throttle or disconnect.",
  ZA: "South Africa — Copyright Act and Cybercrimes Act allow civil action and criminal prosecution against infringers.",
};

export interface GeoResult {
  country: string | null;
  countryName: string | null;
  isRisky: boolean;
  warning: string | null;
}

const COUNTRY_NAMES: Record<string, string> = {
  AE: "United Arab Emirates",
  AT: "Austria",
  AU: "Australia",
  BE: "Belgium",
  CA: "Canada",
  CH: "Switzerland",
  DE: "Germany",
  DK: "Denmark",
  ES: "Spain",
  FI: "Finland",
  FR: "France",
  GB: "United Kingdom",
  IE: "Ireland",
  IN: "India",
  IT: "Italy",
  JP: "Japan",
  KR: "South Korea",
  NL: "Netherlands",
  NO: "Norway",
  NZ: "New Zealand",
  PL: "Poland",
  PT: "Portugal",
  SE: "Sweden",
  SG: "Singapore",
  US: "United States",
  ZA: "South Africa",
};

export function flagUrl(code: string | null | undefined, width: 20 | 40 | 80 = 40): string | null {
  if (!code) return null;
  return `https://flagcdn.com/w${width}/${code.toLowerCase()}.png`;
}

const CACHE_KEY = "minerva.geo";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface CacheEntry {
  country: string | null;
  fetchedAt: number;
}

function readCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(country: string | null) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ country, fetchedAt: Date.now() } as CacheEntry),
    );
  } catch {}
}

export async function detectCountry(): Promise<GeoResult> {
  const cached = readCache();
  let country = cached?.country ?? null;

  if (!cached) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch("https://api.country.is/", {
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const json = (await res.json()) as { country?: string };
        country = (json.country || "").toUpperCase() || null;
      }
    } catch {
      country = null;
    }
    writeCache(country);
  }

  return buildResult(country);
}

function buildResult(country: string | null): GeoResult {
  if (!country) {
    return {
      country: null,
      countryName: null,
      isRisky: false,
      warning: null,
    };
  }
  const isRisky = country in RISKY_COUNTRIES;
  return {
    country,
    countryName: COUNTRY_NAMES[country] ?? country,
    isRisky,
    warning: isRisky ? RISKY_COUNTRIES[country] : null,
  };
}

export const P2P_KEY = "minerva.directP2P";
export const P2P_ACK_KEY = "minerva.directP2P.ackedRiskyCountry";

export function isP2PEnabled(): boolean {
  return localStorage.getItem(P2P_KEY) === "true";
}

export function setP2PEnabled(value: boolean) {
  localStorage.setItem(P2P_KEY, value ? "true" : "false");
}

export function hasAckedRiskyCountry(): boolean {
  return localStorage.getItem(P2P_ACK_KEY) === "true";
}

export function setAckedRiskyCountry(value: boolean) {
  if (value) localStorage.setItem(P2P_ACK_KEY, "true");
  else localStorage.removeItem(P2P_ACK_KEY);
}
