// Illustrations vectorielles de TRACK THE SMOKE.
//
// Dessin au trait fin (1,5) sur une grille de 48, avec une palette de
// « matières » pilotée par le thème (variables CSS --art-*) : papier, tabac,
// bois, verre, feuille, braise, fumée. Chaque méthode et chaque type
// d'événement possède sa propre silhouette, reconnaissable à petite taille.
// Les illustrations sont décoratives (aria-hidden) : le libellé est toujours
// porté par le texte voisin.

const L = 'class="a-ln"';
// Objets longilignes : dessinés à l'horizontale, présentés en diagonale (plus de présence).
const DIAGONAL = { cigarette: 1.12, rolled: 1.1, joint: 1.1, cigar: 1.04, cigarillo: 1.12 };
// Fumée ajoutée après la rotation, pour qu'elle reste verticale.
const SMOKE = {
  cigarette: '<path class="a-smoke" d="M39.5 12.5c-1.8-1.6 1.6-2.8 0-4.6s1.8-3 .2-4.6"/>',
  cigar: '<path class="a-smoke" d="M40 13c-1.6-1.6 1.6-2.6 0-4.4s1.8-2.8.2-4.4"/>',
  cigarillo: '<path class="a-smoke" d="M39 14c-1.4-1.4 1.4-2.4 0-4s1.6-2.4.2-4"/>',
};
const ART = {
  cigarette: `
    <rect class="a-paper" x="6" y="21.5" width="30" height="6" rx="1.4"/>
    <rect class="a-tan" x="6" y="21.5" width="9" height="6" rx="1.4"/>
    <rect class="a-ember" x="36" y="21.5" width="3.2" height="6" rx="1"/>
    <path ${L} d="M7.4 21.5h30.4a1.4 1.4 0 0 1 1.4 1.4v3.2a1.4 1.4 0 0 1-1.4 1.4H7.4A1.4 1.4 0 0 1 6 26.1v-3.2a1.4 1.4 0 0 1 1.4-1.4zM15 21.5v6M36 21.5v6"/>`,
  rolled: `
    <path class="a-paper" d="M7 23.2 34.6 22a2.6 2.6 0 0 1 0 5.2L7 26z"/>
    <path class="a-tan" d="M7 23.2 13 23v3.2L7 26z"/>
    <path ${L} d="M7 23.2 34.6 22a2.6 2.6 0 0 1 0 5.2L7 26zM13 23v3.2M19 23.6l3-.4M24 26l3.4-.1"/>
    <path ${L} d="M37.6 23.2l3-1.4M37.9 24.6h3.4M37.6 26l3 1.4"/>
    <path class="a-leaf" d="M14 38.5c1.6-5.4 7-7.6 12.6-6.6-1.8 4.8-7 7.6-12.6 6.6z"/>
    <path class="a-vein" d="M14.6 38c3.4-2 6.6-3.6 11.2-5.6"/>`,
  joint: `
    <path class="a-paper" d="M6 24.4 33.4 19.6c3-.5 5.2 1.6 5.2 4.2s-2.2 4.8-5.2 4.3L6 25.6z"/>
    <path class="a-tan" d="M6 24.4 12 23.4v3.2l-6-1z"/>
    <path ${L} d="M6 24.4 33.4 19.6c3-.5 5.2 1.6 5.2 4.2s-2.2 4.8-5.2 4.3L6 25.6zM12 23.4v3.2"/>
    <path ${L} d="M38.6 23.8c1.6-.2 2.8-1 3.4-2.6"/>
    <path class="a-leaf" d="M25.5 36.5c-.6-4 1.8-7 5.6-7.6.6 3.8-1.8 7-5.6 7.6z"/>
    <path class="a-leaf" d="M25.4 36.6c-3.4-1.6-4.6-4.8-3-8 3.2 1.4 4.6 4.6 3 8z"/>
    <path class="a-vein" d="M25.5 36.5c.6-2.4 1.8-4.4 4-6.4M25.4 36.6c-.4-2.4-1.2-4.4-2.6-6.6"/>`,
  cbd: `
    <path class="a-wood" d="M20 13.5h8v5h-8z"/>
    <path ${L} d="M20.6 13.5h6.8a.6.6 0 0 1 .6.6v4.4h-8v-4.4a.6.6 0 0 1 .6-.6z"/>
    <path class="a-ember" d="M21.6 13.5V10a2.4 2.4 0 0 1 4.8 0v3.5z"/>
    <path ${L} d="M21.6 13.5V10a2.4 2.4 0 0 1 4.8 0v3.5"/>
    <rect class="a-glass" x="15.5" y="18.5" width="17" height="21" rx="5"/>
    <rect ${L} x="15.5" y="18.5" width="17" height="21" rx="5"/>
    <path class="a-leaf" d="M24 34.6c-2.8-2.6-2.8-6.6 0-9.4 2.8 2.8 2.8 6.8 0 9.4z"/>
    <path class="a-vein" d="M24 34.4v-8"/>`,
  vape: `
    <rect class="a-paper" x="19" y="12" width="10" height="27" rx="3.4"/>
    <rect class="a-tan" x="20.8" y="7" width="6.4" height="5.4" rx="1.6"/>
    <rect class="a-glass" x="21" y="15.5" width="6" height="9" rx="2"/>
    <path class="a-leaf" d="M21 20.5h6v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"/>
    <path ${L} d="M22.4 12h3.2M19 15.4V35.6A3.4 3.4 0 0 0 22.4 39h3.2a3.4 3.4 0 0 0 3.4-3.4V15.4A3.4 3.4 0 0 0 25.6 12h-3.2A3.4 3.4 0 0 0 19 15.4z"/>
    <rect ${L} x="20.8" y="7" width="6.4" height="5" rx="1.6"/>
    <rect ${L} x="21" y="15.5" width="6" height="9" rx="2"/>
    <circle class="a-ln" cx="24" cy="31" r="1.6"/>
    <path class="a-smoke" d="M31.5 9.5c2.2-.6 3.8.6 3.6 2.4 2.2-.4 3.6 1.4 2.6 3.2"/>`,
  puff: `
    <path class="a-leaf" d="M17 27h14v7.4a4.6 4.6 0 0 1-4.6 4.6h-4.8A4.6 4.6 0 0 1 17 34.4z"/>
    <path class="a-paper" d="M17 27V17.6a4.6 4.6 0 0 1 4.6-4.6h4.8a4.6 4.6 0 0 1 4.6 4.6V27z"/>
    <path class="a-tan" d="M20.4 13l1-4.6h5.2l1 4.6z"/>
    <path ${L} d="M21.6 13h4.8a4.6 4.6 0 0 1 4.6 4.6v16.8a4.6 4.6 0 0 1-4.6 4.6h-4.8a4.6 4.6 0 0 1-4.6-4.6V17.6a4.6 4.6 0 0 1 4.6-4.6zM20.4 13l1-4.6h5.2l1 4.6M17 27h14"/>
    <path class="a-smoke" d="M33 8.5c2-.2 3.2 1.2 2.6 2.8"/>`,
  cigar: `
    <path class="a-wood" d="M10 20h25.5v9H10a4.5 4.5 0 0 1 0-9z"/>
    <path class="a-tan" d="M15 20h5v9h-5z"/>
    <path class="a-ash" d="M35.5 20h3.2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3.2z"/>
    <path ${L} d="M10 20h28.7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H10a4.5 4.5 0 0 1 0-9zM15 20v9M20 20v9M35.5 20v9"/>
    <path class="a-vein" d="M24 22.2l5 .8M26 26.6l5-.6"/>`,
  cigarillo: `
    <rect class="a-wood" x="10" y="22" width="28" height="5" rx="2.5"/>
    <path class="a-tan" d="M7.5 22.6h5v3.8h-5a1.9 1.9 0 0 1 0-3.8z"/>
    <path ${L} d="M12.5 22h23a2.5 2.5 0 0 1 0 5h-23zM12.5 22.6H7.5a1.9 1.9 0 0 0 0 3.8h5M20 22v5"/>`,
  pipe: `
    <path class="a-tan" d="M6 21.5l17.5 3.2v3L6 24.5z"/>
    <path ${L} d="M6 21.5l17.5 3.2v3L6 24.5z"/>
    <path class="a-wood" d="M23 17h14v11.5a7 7 0 0 1-14 0z"/>
    <path ${L} d="M23 17h14v11.5a7 7 0 0 1-14 0zM23 20.4h14"/>
    <path class="a-ember" d="M25 17.6h10l-.8 2.4h-8.4z"/>
    <path class="a-smoke" d="M30 13.5c-1.6-1.4 1.4-2.2 0-3.8"/>`,
  hookah: `
    <path class="a-tan" d="M19 9.5h10l-2 4h-6z"/>
    <path class="a-ember" d="M20.5 7.5h7v2h-7z"/>
    <path ${L} d="M19 9.5h10l-2 4h-6zM24 13.5v11"/>
    <path class="a-glass" d="M24 24.5c-6.2 0-10 4-10 8.4 0 3.4 2.4 5.6 5.4 6.1h9.2c3-.5 5.4-2.7 5.4-6.1 0-4.4-3.8-8.4-10-8.4z"/>
    <path class="a-leaf" d="M14.6 33.5h18.8c-.6 3-2.6 5-5 5.5h-8.8c-2.4-.5-4.4-2.5-5-5.5z"/>
    <path ${L} d="M24 24.5c-6.2 0-10 4-10 8.4 0 3.4 2.4 5.6 5.4 6.1h9.2c3-.5 5.4-2.7 5.4-6.1 0-4.4-3.8-8.4-10-8.4zM21 19h6"/>
    <path ${L} d="M31.5 28c4.4-1 7.6-.2 9 2.6.8 1.6.2 3.6-1.6 4.6"/>`,
  custom: `
    <path class="a-leaf" d="M24 38c-6-4-8.4-10.4-5.6-17.6 6.4 3.4 8.8 10.4 5.6 17.6z"/>
    <path class="a-tan" d="M24.4 38c1-7.6 5.6-12.4 13-13-.4 7.4-5.2 12.6-13 13z"/>
    <path class="a-vein" d="M24 37.6c-1-5.6-2.6-10-5-14.4M24.6 37.6c2.4-4.6 5.6-8.2 11-11.2"/>
    <circle class="a-ember" cx="16" cy="13" r="2.2"/><circle class="a-glass" cx="31" cy="12" r="2.6"/>
    <path ${L} d="M24 38v3"/>`,
  craving: `
    <path class="a-smoke a-strong" d="M8 19c3.4-3.4 6.8-3.4 10.2 0s6.8 3.4 10.2 0 6.8-3.4 10.2 0"/>
    <path class="a-smoke" d="M11 26c3-3 6-3 9 0s6 3 9 0 6-3 9 0"/>
    <path class="a-leaf" d="M23.5 40c-.8-5.2 2-9 7-9.8.8 5-2 8.8-7 9.8z"/>
    <path class="a-vein" d="M23.6 39.6c1-2.8 2.8-5.4 5.6-7.6"/>
    <path ${L} d="M23.5 40v-3.6"/>`,
  night: `
    <path class="a-moon" d="M30.5 33.5A12 12 0 0 1 20 13a12 12 0 1 0 15.4 15.4 12 12 0 0 1-4.9 5.1z"/>
    <path ${L} d="M30.5 33.5A12 12 0 0 1 20 13a12 12 0 1 0 15.4 15.4 12 12 0 0 1-4.9 5.1z"/>
    <path class="a-star" d="M34 10.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>
    <circle class="a-star" cx="39" cy="20" r="1.1"/><circle class="a-star" cx="29" cy="7.5" r=".9"/>`,
  purchase: `
    <path class="a-tan" d="M12 18h24l-1.6 20.4a2 2 0 0 1-2 1.6H15.6a2 2 0 0 1-2-1.6z"/>
    <path ${L} d="M12 18h24l-1.6 20.4a2 2 0 0 1-2 1.6H15.6a2 2 0 0 1-2-1.6zM19 21v-6a5 5 0 0 1 10 0v6"/>
    <path class="a-leaf" d="M24 34.4c-2.6-2.2-2.6-5.6 0-7.8 2.6 2.2 2.6 5.6 0 7.8z"/>
    <path class="a-vein" d="M24 34.2v-6.6"/>`,
  stock: `
    <rect class="a-wood" x="15" y="8.5" width="18" height="5" rx="1.6"/>
    <path class="a-glass" d="M14 13.5h20v21a5 5 0 0 1-5 5H19a5 5 0 0 1-5-5z"/>
    <path class="a-leaf" d="M14 26h20v8.5a5 5 0 0 1-5 5H19a5 5 0 0 1-5-5z"/>
    <path ${L} d="M14 13.5h20v21a5 5 0 0 1-5 5H19a5 5 0 0 1-5-5zM16.6 8.5h14.8a1.6 1.6 0 0 1 1.6 1.6v3.4H15v-3.4a1.6 1.6 0 0 1 1.6-1.6zM14 26h20"/>
    <path class="a-vein" d="M18.5 31h4M25 34h4"/>`,
  stats: `
    <rect class="a-glass" x="10" y="25" width="7" height="13" rx="2"/>
    <rect class="a-tan" x="20.5" y="17" width="7" height="21" rx="2"/>
    <rect class="a-leaf" x="31" y="11" width="7" height="27" rx="2"/>
    <path ${L} d="M8 38.5h32M12 25h3a2 2 0 0 1 2 2v11h-7V27a2 2 0 0 1 2-2zM22.5 17h3a2 2 0 0 1 2 2v19h-7V19a2 2 0 0 1 2-2zM33 11h3a2 2 0 0 1 2 2v25h-7V13a2 2 0 0 1 2-2z"/>`,
  goals: `
    <path class="a-tan" d="M10 39.5c3-3.4 8-5 14-5s11 1.6 14 5z"/>
    <path ${L} d="M10 39.5c3-3.4 8-5 14-5s11 1.6 14 5M24 34.5V20"/>
    <path class="a-leaf" d="M24 24c-6.4.6-10.4-2.6-11-8.6 6.2-.4 10.4 2.8 11 8.6z"/>
    <path class="a-leaf" d="M24 20c.2-6.8 4.2-10.8 11-11 .2 6.6-4.2 10.8-11 11z"/>
    <path class="a-vein" d="M23.6 23.6c-3-1.6-5.6-3.8-7.6-6.4M24.4 19.6c2.4-2.8 5-5.2 8-7.4"/>`,
  project: `
    <circle class="a-ember" cx="34" cy="14" r="4"/>
    <path class="a-leaf" d="M6 38l11-15 7 9 5-6 13 12z"/>
    <path ${L} d="M6 38l11-15 7 9 5-6 13 12zM6 38.5h36"/>
    <path class="a-paper" d="M17 23l2.6 3.4-2.6 1.2-2.6-1.2z"/>`,
  money: `
    <ellipse class="a-tan" cx="22" cy="34" rx="11" ry="4"/>
    <path class="a-tan" d="M11 28v6c0 2.2 4.9 4 11 4s11-1.8 11-4v-6z"/>
    <ellipse class="a-paper" cx="22" cy="28" rx="11" ry="4"/>
    <path ${L} d="M11 28v6c0 2.2 4.9 4 11 4s11-1.8 11-4v-6"/><ellipse ${L} cx="22" cy="28" rx="11" ry="4"/>
    <path class="a-leaf" d="M30 21c-.4-6 3.2-10 9-10.6.4 5.8-3.2 10-9 10.6z"/>
    <path class="a-vein" d="M30.2 20.6c1.6-3.2 3.6-5.6 6.6-7.8"/>`,
  pack: `
    <path class="a-tan" d="M12 15.5h24l-1.4 22a2 2 0 0 1-2 1.9H15.4a2 2 0 0 1-2-1.9z"/>
    <path class="a-paper" d="M12 15.5h24l-.5 6.5h-23z"/>
    <path ${L} d="M12 15.5h24l-1.4 22a2 2 0 0 1-2 1.9H15.4a2 2 0 0 1-2-1.9zM12.5 22h23M18 10.5h12l1.5 5h-15z"/>
    <path class="a-leaf" d="M24 35c-2.4-2-2.4-5.2 0-7.2 2.4 2 2.4 5.2 0 7.2z"/>`,
  session: `
    <circle class="a-glass" cx="24" cy="26" r="13"/>
    <path class="a-leaf" d="M24 26V13a13 13 0 0 1 11.3 6.5z"/>
    <path ${L} d="M24 13a13 13 0 1 1 0 26 13 13 0 0 1 0-26zM24 26l7.5-5.5M20.5 7.5h7M24 7.5V13M35 13.5l2-2"/>`,
};

/** Correspondance icône de catégorie → illustration. */
const ALIAS = { leafless: 'cbd', wave: 'craving', moon: 'night', box: 'stock', wallet: 'money', flag: 'project', timer: 'session' };

export function artName(name) {
  const n = ALIAS[name] || name;
  return ART[n] ? n : 'custom';
}

/**
 * Illustration dans un médaillon arrondi.
 * @param name  méthode (cigarette, joint…), icône de catégorie, ou événement
 * @param size  côté du médaillon en px
 */
export function art(name, size = 44, extraClass = '') {
  const span = document.createElement('span');
  span.className = `art art-${artName(name)} ${extraClass}`.trim();
  span.style.setProperty('--art-size', `${size}px`);
  span.setAttribute('aria-hidden', 'true');
  const n = artName(name);
  const k = DIAGONAL[n];
  const body = k ? `<g transform="translate(24 24) rotate(-34) scale(${k}) translate(-24 -24.5)">${ART[n]}</g>${SMOKE[n] || ''}` : ART[n];
  span.innerHTML = `<svg viewBox="0 0 48 48" width="${Math.round(size * 0.86)}" height="${Math.round(size * 0.86)}" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return span;
}

/** Ornement botanique décoratif (cartes, états vides). */
export function sprig(size = 120, extraClass = '') {
  const span = document.createElement('span');
  span.className = `sprig ${extraClass}`.trim();
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 120 120" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 112C40 86 62 62 104 22"/>
    <path d="M40 87c-2-14 4-24 18-28 2 14-4 24-18 28z"/><path d="M40 87c6-9 11-17 17-26"/>
    <path d="M38 89c-14 0-22-7-24-20 13-1 22 6 24 20z"/><path d="M38 89c-7-6-13-12-21-18"/>
    <path d="M63 62c-1-13 5-22 18-25 1 13-5 22-18 25z"/><path d="M63 62c5-8 10-15 16-23"/>
    <path d="M61 64c-13 1-21-5-24-17 12-2 21 4 24 17z"/><path d="M61 64c-7-5-13-10-20-16"/>
    <path d="M86 39c0-11 5-18 16-20 0 11-5 18-16 20z"/><path d="M86 39c4-6 8-12 13-18"/>
  </svg>`;
  return span;
}
