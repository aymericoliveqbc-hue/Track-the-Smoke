// Import des données de sommeil d'Apple Santé.
//
// Une application web ne peut pas accéder directement à HealthKit. Deux voies
// sont prises en charge, sans aucun serveur :
//  1. l'export complet de l'app Santé (export.zip / export.xml) ;
//  2. un texte produit par un Raccourci iOS (« start;end;valeur » par ligne).
//
// Les échantillons sont regroupés en nuits (date de la soirée), puis fusionnés
// sans jamais écraser une valeur saisie à la main.

import { diffDays, addDays, pad } from '../core/dates.js';
import { isNum } from '../core/format.js';

const EPOCH = '2000-01-01';

/* ------------------------------ Dates ------------------------------ */

/**
 * Convertit une date Santé / Raccourcis en heure murale "YYYY-MM-DDTHH:mm".
 * Formats acceptés : "2026-11-10 23:14:05 +0100", ISO 8601 ("2026-11-10T23:14:05+01:00"),
 * "10/11/2026 23:14" (jour/mois/année). L'heure murale enregistrée est conservée.
 */
export function toWall(s) {
  if (!s) return null;
  const str = String(s).trim();
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,à]*(\d{1,2})[:h](\d{2})/);
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}T${pad(Number(m[4]))}:${m[5]}`;
  // Format français par défaut des Raccourcis : « 10 nov. 2026 à 23:14 ».
  m = str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .match(/^(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})\D+(\d{1,2})[:h](\d{2})/);
  if (m) {
    const months = ['janv', 'fevr', 'mars', 'avr', 'mai', 'juin', 'juil', 'aout', 'sept', 'oct', 'nov', 'dec'];
    const mi = months.findIndex((x) => m[2].startsWith(x.slice(0, 3)) && (x !== 'juin' || m[2].startsWith('juin')) && (x !== 'juil' || m[2].startsWith('juil')));
    if (mi >= 0) return `${m[3]}-${pad(mi + 1)}-${pad(Number(m[1]))}T${pad(Number(m[4]))}:${m[5]}`;
  }
  return null;
}

const absMin = (wall) => diffDays(EPOCH, wall.slice(0, 10)) * 1440 + Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16));
const fromAbs = (min) => {
  const day = addDays(EPOCH, Math.floor(min / 1440));
  const r = ((min % 1440) + 1440) % 1440;
  return `${day}T${pad(Math.floor(r / 60))}:${pad(r % 60)}`;
};

/* ------------------------------ Valeurs ------------------------------ */

/** 'inbed' | 'asleep' | 'awake' | null — identifiants HealthKit, français ou anglais. */
export function sleepKind(value) {
  const v = String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!v) return null;
  if (v.includes('inbed') || v.includes('in bed') || v.includes('au lit')) return 'inbed';
  if (v.includes('awake') || v.includes('eveill') || v.includes('reveill')) return 'awake';
  if (v.includes('asleep') || v.includes('endormi') || v.includes('sommeil') || v.includes('core') || v.includes('principal')
    || v.includes('deep') || v.includes('profond') || v.includes('rem') || v.includes('paradox') || v.includes('unspecified')
    || v.includes('non specifie') || v === 'sleep') return 'asleep';
  return null;
}

/* ------------------------------ Lecture ------------------------------ */

const SLEEP_TYPE = 'HKCategoryTypeIdentifierSleepAnalysis';

function attr(tag, name) {
  const i = tag.indexOf(` ${name}="`);
  if (i < 0) return null;
  const start = i + name.length + 3;
  return tag.slice(start, tag.indexOf('"', start));
}

/**
 * Lecteur incrémental de export.xml : on lui donne des morceaux de texte,
 * il renvoie les échantillons de sommeil trouvés. Conçu pour des fichiers
 * de plusieurs centaines de Mo (aucun DOM, aucune copie complète).
 */
export class HealthXmlScanner {
  constructor() { this.buf = ''; this.count = 0; }

  feed(chunk) {
    this.buf += chunk;
    const out = [];
    let pos = 0;
    for (;;) {
      const i = this.buf.indexOf(SLEEP_TYPE, pos);
      if (i < 0) break;
      const open = this.buf.lastIndexOf('<', i);
      const close = this.buf.indexOf('>', i);
      if (close < 0) { pos = open; break; }
      const tag = this.buf.slice(open, close + 1);
      pos = close + 1;
      if (!tag.startsWith('<Record')) continue;
      const s = sampleFrom(attr(tag, 'startDate'), attr(tag, 'endDate'), attr(tag, 'value'), attr(tag, 'sourceName'));
      if (s) { out.push(s); this.count += 1; }
    }
    // On ne conserve que la dernière balise, éventuellement coupée entre deux morceaux.
    const lt = this.buf.lastIndexOf('<');
    this.buf = lt >= pos ? this.buf.slice(lt) : '';
    return out;
  }
}

function sampleFrom(start, end, value, source = null) {
  const s = toWall(start); const e = toWall(end); const kind = sleepKind(value);
  if (!s || !e || !kind) return null;
  const a = absMin(s); const b = absMin(e);
  if (!(b > a) || b - a > 24 * 60) return null;
  return { start: s, end: e, a, b, kind, source };
}

/** Texte d'un Raccourci : une ligne par échantillon, champs séparés par ; | ou tabulation. */
export function parseShortcutText(text) {
  const samples = [];
  let rejected = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s*[;|\t]\s*/);
    if (parts.length < 3) { rejected += 1; continue; }
    const s = sampleFrom(parts[0], parts[1], parts.slice(2).join(' '));
    if (s) samples.push(s); else rejected += 1;
  }
  return { samples, rejected };
}

/* ------------------------------ Nuits ------------------------------ */

function union(intervals) {
  const sorted = [...intervals].sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

const GAP_SAME_SESSION = 90; // min : au-delà, deux blocs sont des sessions distinctes
const MIN_AWAKENING_GAP = 5;

/**
 * Regroupe les échantillons en nuits (clé = date de la soirée).
 * Une sieste éloignée du sommeil principal est ignorée.
 */
export function samplesToNights(samples, { from = null, to = null } = {}) {
  const byNight = new Map();
  for (const s of samples) {
    // Avant midi → nuit de la veille.
    const date = fromAbs(s.a - 12 * 60).slice(0, 10);
    if (from && date < from) continue;
    if (to && date > to) continue;
    if (!byNight.has(date)) byNight.set(date, []);
    byNight.get(date).push(s);
  }
  const nights = [];
  for (const [date, list] of [...byNight.entries()].sort()) {
    const blocks = union(list.map((s) => [s.a, s.b + GAP_SAME_SESSION])).map(([a, b]) => [a, b - GAP_SAME_SESSION]);
    const main = blocks.reduce((best, b) => (!best || b[1] - b[0] > best[1] - best[0] ? b : best), null);
    const inMain = list.filter((s) => s.a >= main[0] && s.b <= main[1] + 1);
    const asleep = union(inMain.filter((s) => s.kind === 'asleep').map((s) => [s.a, s.b]));
    const inbed = inMain.filter((s) => s.kind === 'inbed');
    const awake = union(inMain.filter((s) => s.kind === 'awake').map((s) => [s.a, s.b]));
    const bedStart = inbed.length ? Math.min(...inbed.map((s) => s.a)) : null;
    const n = { date, bedTime: null, asleepTime: null, wakeTime: null, latencyMin: null, totalSleepMin: null, awakenings: null, samples: inMain.length };
    if (asleep.length) {
      const sleepStart = asleep[0][0];
      const sleepEnd = asleep[asleep.length - 1][1];
      n.asleepTime = fromAbs(sleepStart).slice(11);
      n.wakeTime = fromAbs(sleepEnd).slice(11);
      n.totalSleepMin = asleep.reduce((t, [a, b]) => t + (b - a), 0);
      if (bedStart != null && bedStart <= sleepStart) { n.bedTime = fromAbs(bedStart).slice(11); n.latencyMin = sleepStart - bedStart; }
      const inside = awake.filter(([a, b]) => a >= sleepStart && b <= sleepEnd);
      n.awakenings = awake.length ? inside.length : asleep.slice(1).filter((iv, i) => iv[0] - asleep[i][1] >= MIN_AWAKENING_GAP).length;
    } else if (inbed.length) {
      n.bedTime = fromAbs(bedStart).slice(11);
      n.wakeTime = fromAbs(Math.max(...inbed.map((s) => s.b))).slice(11);
    } else {
      continue;
    }
    nights.push(n);
  }
  return nights;
}

const FIELDS = ['bedTime', 'asleepTime', 'wakeTime', 'latencyMin', 'totalSleepMin', 'awakenings'];

/**
 * Fusionne les nuits importées avec les nuits existantes.
 * Une valeur déjà renseignée n'est jamais écrasée.
 * @returns {{ toSave: object[], created: number, completed: number, unchanged: number }}
 */
export function mergeHealthNights(existing, imported, makeNight) {
  const byDate = new Map(existing.map((n) => [n.date, n]));
  const toSave = [];
  let created = 0, completed = 0, unchanged = 0;
  const importedAt = new Date().toISOString();
  for (const h of imported) {
    const cur = byDate.get(h.date);
    if (!cur) {
      const n = { ...makeNight(h.date), source: 'apple-health', health: { importedAt } };
      for (const f of FIELDS) if (h[f] != null) n[f] = h[f];
      toSave.push(n); created += 1;
      continue;
    }
    const next = { ...cur };
    let changed = false;
    for (const f of FIELDS) {
      if ((next[f] == null || next[f] === '') && h[f] != null) {
        // Pas de latence calculée si l'utilisateur a déjà donné l'heure d'endormissement.
        if (f === 'latencyMin' && next.asleepTime && next.asleepTime !== h.asleepTime) continue;
        next[f] = h[f]; changed = true;
      }
    }
    if (changed) { next.health = { importedAt }; toSave.push(next); completed += 1; } else unchanged += 1;
  }
  return { toSave, created, completed, unchanged };
}

export const isImportedOnly = (n) => n.source === 'apple-health' && !isNum(n.quality) && !n.note;
