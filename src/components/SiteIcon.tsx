import { useState } from 'react';
import { faviconUrl, siteInitial } from '../sites/site-icons';

interface SiteIconProps {
  domain: string;
  label: string;
}

export default function SiteIcon({ domain, label }: SiteIconProps) {
  const [failed, setFailed] = useState(false);
  const className = 'site-icon';

  if (!domain || failed) {
    return <span className={`${className} site-icon-fallback`} aria-hidden="true">{siteInitial(label, domain)}</span>;
  }

  return (
    <img
      className={className}
      src={faviconUrl(domain)}
      alt=""
      aria-hidden="true"
      onError={() => setFailed(true)}
    />
  );
}
