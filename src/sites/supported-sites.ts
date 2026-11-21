import type { SupportedSite } from '../types';

/** Initial allowlist. Kept in one place; user customizations are merged on top at read time. */
export const DEFAULT_SITES: SupportedSite[] = [
  { name: 'Spotify', domain: 'open.spotify.com', enabled: true, custom: false },
  { name: 'YouTube Music', domain: 'music.youtube.com', enabled: true, custom: false },
];
