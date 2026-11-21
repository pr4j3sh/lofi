/** Domains where the extension can safely use the native media-element hook. */
export const HOOKABLE_DOMAINS = ['music.youtube.com'] as const;

export function isHookableDomain(domain: string | null | undefined): boolean {
  return typeof domain === 'string' && (HOOKABLE_DOMAINS as readonly string[]).includes(domain);
}
