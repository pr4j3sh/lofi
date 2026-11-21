import type { SupportedSite } from '../types';

/**
 * Accepts either a bare domain (`music.youtube.com`) or an http(s) URL.
 * Rejects other schemes, credentials, ports and malformed hostnames.
 */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed || /\s/.test(trimmed)) return null;

  let hostname: string;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.port) return null;
    hostname = url.hostname;
  } catch {
    return null;
  }

  if (!hostname.includes('.') || hostname.startsWith('.') || hostname.endsWith('.')) return null;
  if (!/^[a-z\d.-]+$/.test(hostname) || hostname.includes('..')) return null;
  return hostname;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Exact domain or subdomain match, so `www.open.spotify.com` still resolves. */
export function findSite(url: string, sites: SupportedSite[]): SupportedSite | null {
  // Built-in local audio fixture, so capture can be tested without a streaming site.
  if (url.startsWith(chrome.runtime.getURL('test-audio.html'))) {
    return { name: 'lofi test page', domain: 'self', enabled: true, custom: false };
  }
  const hostname = hostnameOf(url);
  if (!hostname) return null;
  return (
    sites.find((site) => site.enabled && (hostname === site.domain || hostname.endsWith(`.${site.domain}`))) ?? null
  );
}

export function addCustomSite(sites: SupportedSite[], input: string): { sites: SupportedSite[]; error?: string } {
  const domain = normalizeDomain(input);
  if (!domain) return { sites, error: 'Enter a valid domain, e.g. music.example.com' };
  if (sites.some((site) => site.domain === domain)) return { sites, error: 'That website is already in the list' };
  const name = domain.split('.').slice(-2, -1)[0] || domain;
  return {
    sites: [...sites, { name: name.charAt(0).toUpperCase() + name.slice(1), domain, enabled: true, custom: true }],
  };
}

export function removeSite(sites: SupportedSite[], domain: string): SupportedSite[] {
  return sites.filter((site) => !(site.domain === domain && site.custom));
}

export function setSiteEnabled(sites: SupportedSite[], domain: string, enabled: boolean): SupportedSite[] {
  return sites.map((site) => (site.domain === domain ? { ...site, enabled } : site));
}
