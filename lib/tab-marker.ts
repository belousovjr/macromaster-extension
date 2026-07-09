const MARKER_LINK_ID = 'macro-master-tab-marker-favicon';
const FAVICON_SELECTOR =
  'link[rel~="icon"], link[rel="shortcut icon"], link[rel="Shortcut Icon"]';

function createMarkerFaviconUrl() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="#17212b"/>
      <path d="M14 43V21h8l10 13 10-13h8v22h-8V32L33 43h-2L22 32v11z" fill="#f8fafc"/>
      <circle cx="50" cy="14" r="10" fill="#ef4444" stroke="#f8fafc" stroke-width="4"/>
    </svg>
  `;

  return `data:image/svg+xml,${encodeURIComponent(svg.trim())}`;
}

function getFaviconLinks() {
  return Array.from(document.head.querySelectorAll<HTMLLinkElement>(FAVICON_SELECTOR));
}

function createMarkerLink() {
  const link = document.createElement('link');
  link.id = MARKER_LINK_ID;
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = createMarkerFaviconUrl();

  return link;
}

export function createTabMarker() {
  let isActive = false;
  let isApplying = false;
  let originalFaviconLinks: HTMLLinkElement[] | null = null;
  let faviconObserver: MutationObserver | null = null;

  const applyFavicon = () => {
    if (!isActive) return;

    isApplying = true;
    getFaviconLinks().forEach((link) => link.remove());
    document.head.append(createMarkerLink());
    queueMicrotask(() => {
      isApplying = false;
    });
  };

  const startFaviconObserver = () => {
    faviconObserver?.disconnect();

    faviconObserver = new MutationObserver(() => {
      if (!isActive || isApplying) return;

      const markerLink = document.getElementById(MARKER_LINK_ID);
      const links = getFaviconLinks();
      if (markerLink && links.length === 1 && links[0] === markerLink) return;

      applyFavicon();
    });

    faviconObserver.observe(document.head, {
      attributes: true,
      attributeFilter: ['href', 'rel', 'type'],
      childList: true,
      subtree: true,
    });
  };

  const enable = () => {
    if (!document.head || isActive) return;

    isActive = true;
    originalFaviconLinks = getFaviconLinks().map(
      (link) => link.cloneNode(true) as HTMLLinkElement,
    );

    applyFavicon();
    startFaviconObserver();
  };

  const disable = () => {
    if (!isActive) return;

    isActive = false;
    faviconObserver?.disconnect();
    faviconObserver = null;

    getFaviconLinks().forEach((link) => link.remove());
    originalFaviconLinks?.forEach((link) => document.head.append(link));

    originalFaviconLinks = null;
    isApplying = false;
  };

  return {
    enable,
    disable,
  };
}
