/** Host patterns requested when a site should be eligible for zero-click auto-enable. */
export function pageHookOriginsForDomain(domain: string): string[] {
  return [
    `https://${domain}/*`,
    `https://*.${domain}/*`,
    `http://${domain}/*`,
    `http://*.${domain}/*`,
  ];
}

/** True when at least one usable origin is already granted for this domain. */
export async function hasPageHookPermission(domain: string): Promise<boolean> {
  const results = await Promise.all(
    pageHookOriginsForDomain(domain).map((origin) => chrome.permissions.contains({ origins: [origin] })),
  );
  return results.some(Boolean);
}

/** Requests access to a domain; must be called from a user gesture. */
export async function requestPageHookPermission(domain: string): Promise<boolean> {
  return chrome.permissions.request({ origins: pageHookOriginsForDomain(domain) });
}
