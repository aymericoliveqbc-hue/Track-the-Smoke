// Icônes fines (trait 1,6 px), dessinées pour l'application.

const P = {
  home: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
  journal: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>',
  stats: '<path d="M4 20h16"/><path d="M7 16.5V11M12 16.5V6.5M17 16.5v-3.5"/>',
  goals: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  profile: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  chevron: '<path d="m9.5 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9.5 6 6 6-6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  edit: '<path d="M4.5 19.5 5.3 15.6 15.8 5.1a1.9 1.9 0 0 1 2.7 0l.4.4a1.9 1.9 0 0 1 0 2.7L8.4 18.7z"/><path d="M13.8 7.1l3.1 3.1"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l.8 12h8.4L17 7"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="5" cy="7" r=".9" fill="currentColor"/><circle cx="5" cy="12" r=".9" fill="currentColor"/><circle cx="5" cy="17" r=".9" fill="currentColor"/>',
  joint: '<path d="M4 15.5 17.5 6.8"/><path d="M4.8 17.3 18.3 8.6"/><path d="M4 15.5l.8 1.8"/><path d="M15 8.4l.9 1.8"/><path d="M19.6 5.2c.4.8.3 1.7-.3 2.4"/>',
  rolled: '<rect x="3.5" y="10.5" width="15" height="3.5" rx="1.75"/><path d="M14.5 10.5v3.5"/><path d="M20.5 9.5c.6.9.6 2.2 0 3.3"/>',
  leafless: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9 18 18M6 18l2.1-2.1M15.9 8.1 18 6"/>',
  drop: '<path d="M12 4c3 3.8 5.5 6.8 5.5 10a5.5 5.5 0 0 1-11 0C6.5 10.8 9 7.8 12 4z"/>',
  custom: '<rect x="5" y="5" width="6" height="6" rx="1.5"/><rect x="13" y="5" width="6" height="6" rx="3"/><rect x="5" y="13" width="6" height="6" rx="3"/><path d="M16 13v6M13 16h6"/>',
  wave: '<path d="M3.5 12c2-4 4-4 6 0s4 4 6 0 3-4 5-1"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  wallet: '<rect x="3.5" y="6" width="17" height="13" rx="2.5"/><path d="M3.5 10h17"/><circle cx="16.5" cy="14.5" r="1" fill="currentColor"/>',
  box: '<path d="M4 8 12 4l8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".9" fill="currentColor"/>',
  heart: '<path d="M12 19.5s-7.5-4.5-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.5-7.5 10-7.5 10z"/>',
  tag: '<path d="M4 12.5V5a1 1 0 0 1 1-1h7.5L20 11.5 12.5 19z"/><circle cx="8.5" cy="8.5" r="1.3"/>',
  sparkle: '<path d="M12 4.5 13.6 10.4 19.5 12l-5.9 1.6L12 19.5l-1.6-5.9L4.5 12l5.9-1.6z"/>',
  arrowUp: '<path d="M12 19V5M6.5 10.5 12 5l5.5 5.5"/>',
  arrowDown: '<path d="M12 5v14M6.5 13.5 12 19l5.5-5.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  flag: '<path d="M6 20.5V4.5M6 5h11l-2.5 3.5L17 12H6"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>',
  euro: '<path d="M17.5 7a6 6 0 1 0 0 10"/><path d="M5 10.5h8M5 13.5h8"/>',
  scale: '<path d="M5 19.5h14l-1.5-11h-11z"/><circle cx="12" cy="6" r="2"/><path d="M12 13v3"/>',
  face: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5V13h-1M9.5 15.5c1.4 1 3.6 1 5 0"/>',
  demo: '<path d="M9 4.5h6M10 4.5v5L5.5 18a1.5 1.5 0 0 0 1.3 2.2h10.4a1.5 1.5 0 0 0 1.3-2.2L14 9.5v-5"/><path d="M7.5 14.5h9"/>',
};

export function icon(name, size = 22, extraClass = '') {
  const span = document.createElement('span');
  span.className = `icon ${extraClass}`;
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.custom}</svg>`;
  return span;
}

/** Logo TRACK THE SMOKE : trajectoire ouverte qui se resserre vers un point. */
export function logo(size = 32) {
  const span = document.createElement('span');
  span.className = 'logo-mark';
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" aria-label="TRACK THE SMOKE">
    <path d="M32 8a24 24 0 1 0 24 24" style="stroke:var(--primary)" stroke-width="5" stroke-linecap="round"/>
    <path d="M32 19a13 13 0 1 0 13 13" style="stroke:var(--primary);stroke-opacity:.45" stroke-width="5" stroke-linecap="round"/>
    <circle cx="56" cy="32" r="4.5" style="fill:var(--c3)"/>
    <circle cx="32" cy="32" r="3.2" style="fill:var(--text)"/>
  </svg>`;
  return span;
}
