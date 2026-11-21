/** Host patterns requested when a site should be eligible for zero-click auto-enable. */
export function pageHookOriginsForDomain(domain: string): string[] {
  return [
    `https://${domain}/*`,
    `https://*.${domain}/*`,
    `http://${domain}/*`,
    `http://*.${domain}/*`,
  ];
}

/** Deduplicated host patterns for several domains. */
export function pageHookOriginsForDomains(domains: string[]): string[] {
  return [...new Set(domains.filter((domain) => domain !== 'self').flatMap(pageHookOriginsForDomain))];
}

/** True when at least one usable origin is already granted for this domain. */
export async function hasPageHookPermission(domain: string): Promise<boolean> {
  const results = await Promise.all(
    pageHookOriginsForDomain(domain).map((origin) => chrome.permissions.contains({ origins: [origin] })),
  );
  return results.some(Boolean);
}
