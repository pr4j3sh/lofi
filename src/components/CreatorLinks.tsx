interface CreatorLinksProps {
  className?: string;
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.2 12h17.6M5.4 6.8h13.2M5.4 17.2h13.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.01c-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56C20.21 21.38 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export default function CreatorLinks({ className = '' }: CreatorLinksProps) {
  return (
    <div className={`creator-links${className ? ` ${className}` : ''}`}>
      <a
        href="https://pr4j3sh.github.io/pr4j3sh/"
        target="_blank"
        rel="noreferrer"
        aria-label="pr4j3sh website"
        title="pr4j3sh website"
      >
        <GlobeIcon />
        <span>pr4j3sh</span>
      </a>
      <a
        href="https://github.com/pr4j3sh/lofi"
        target="_blank"
        rel="noreferrer"
        aria-label="lofi on GitHub"
        title="lofi on GitHub"
      >
        <GitHubIcon />
        <span>GitHub</span>
      </a>
    </div>
  );
}
