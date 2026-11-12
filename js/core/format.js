// Formatage et analyse des nombres (fr-FR, système métrique).

export const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
export const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;

export const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** Analyse une saisie décimale française ("0,22", "0.22", " 1 250,5 "). */
export function parseDecimal(input) {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const s = String(input).trim().replace(/\s| | /g, '').replace(',', '.');
  if (s === '' || !/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Quantité positive au centième ; null si vide ou invalide. */
export function parseQuantity(input) {
  const n = parseDecimal(input);
  if (n == null || n < 0) return null;
  return round2(n);
}

const nfCache = new Map();
function nf(min, max) {
  const key = `${min}-${max}`;
  if (!nfCache.has(key)) {
    nfCache.set(key, new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max }));
  }
  return nfCache.get(key);
}

export function fmtNum(x, max = 2, min = 0) {
  if (!isNum(x)) return '—';
  return nf(min, max).format(x);
}

export function fmtGrams(x, digits = 2) {
  if (!isNum(x)) return '—';
  return `${nf(digits === 2 ? 2 : 0, digits).format(x)} g`;
}

const CURRENCY_SYMBOLS = { EUR: '€', CHF: 'CHF', USD: '$', GBP: '£', CAD: '$ CA' };
let currentCurrency = 'EUR';
export function setCurrency(c) { currentCurrency = c || 'EUR'; }
export function currencySymbol() { return CURRENCY_SYMBOLS[currentCurrency] || currentCurrency; }

export function fmtMoney(x, opts = {}) {
  if (!isNum(x)) return '—';
  const digits = opts.digits ?? 2;
  return `${nf(digits, digits).format(x)} ${currencySymbol()}`;
}

export function fmtPct(x, digits = 0) {
  if (!isNum(x)) return '—';
  return `${nf(0, digits).format(x * 100)} %`;
}

export function fmtSignedPct(x) {
  if (!isNum(x)) return '—';
  const v = Math.round(x * 100);
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} %`;
}

/** Valeur pour un <input> : 0.22 -> "0,22". */
export function toInput(x) {
  if (!isNum(x)) return '';
  return String(round2(x)).replace('.', ',');
}

export const UNITS = {
  g: { id: 'g', label: 'grammes', short: 'g' },
  ml: { id: 'ml', label: 'millilitres', short: 'ml' },
  drop: { id: 'drop', label: 'gouttes', short: 'gouttes' },
  unit: { id: 'unit', label: 'unités', short: 'u.' },
};

export function fmtQty(x, unit = 'g') {
  if (!isNum(x)) return '—';
  if (unit === 'g') return fmtGrams(x);
  if (unit === 'drop') return `${fmtNum(x, 0)} goutte${x > 1 ? 's' : ''}`;
  if (unit === 'unit') return `${fmtNum(x, 2)} u.`;
  return `${fmtNum(x, 2)} ${UNITS[unit]?.short ?? unit}`;
}

export function plural(n, one, many) {
  return `${fmtNum(n, 0)} ${n > 1 ? many : one}`;
}
