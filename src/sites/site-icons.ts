/** Direct site favicon URL. No third-party favicon service is used. */
export function faviconUrl(domain: string): string {
  return `https://${domain}/favicon.ico`;
}

/** Local fallback shown when a site has no reachable favicon. */
export function siteInitial(label: string, domain: string): string {
  const source = label.trim() || domain.trim();
  return source.charAt(0).toUpperCase() || '?';
}
