// Sommeil et bien-être.
//
// Une nuit est identifiée par la date de la SOIRÉE où elle commence (date D).
// Elle est comparée à la journée D (consommations, envies) qui la précède.
// Les liens éventuels sont présentés comme des corrélations observées,
// jamais comme des causes (règle métier n° 12).

import { addDays, minutesFromNoon, minutesOfDay, hm, daysBetween } from '../core/dates.js';
import { isNum } from '../core/format.js';
import { isConsumption, isCraving, mean, sum } from './stats.js';

export const EVENING_START_MIN = 18 * 60; // la « soirée » commence à 18 h

export function newNight(date) {
  return {
    id: `night_${date}`, date,
    bedTime: null, tryTime: null, asleepTime: null, latencyMin: null,
    wakeTime: null, totalSleepMin: null, awakenings: null, quality: null,
    wakeFeeling: null, note: '',
    stress: null, agitation: null, fatigue: null, mood: null, relaxDifficulty: null, energy: null,
  };
}

function span(fromHHMM, toHHMM) {
  const a = minutesFromNoon(fromHHMM);
  const b = minutesFromNoon(toHHMM);
  if (a == null || b == null) return null;
  let d = b - a;
  if (d < 0) d += 1440;
  return d;
}

function addMin(hhmm, min) {
  const m = hm(hhmm);
  if (m == null || !isNum(min)) return null;
  const t = (((m + Math.round(min)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** Valeurs dérivées d'une nuit. Les saisies explicites priment toujours. */
export function computeNight(n) {
  const tryOrBed = n.tryTime || n.bedTime;
  let latency = isNum(n.latencyMin) ? n.latencyMin : null;
  if (latency == null && n.asleepTime && tryOrBed) latency = span(tryOrBed, n.asleepTime);
  let asleep = n.asleepTime || null;
  if (!asleep && tryOrBed && latency != null) asleep = addMin(tryOrBed, latency);
  let total = isNum(n.totalSleepMin) ? n.totalSleepMin : null;
  if (total == null && asleep && n.wakeTime) total = span(asleep, n.wakeTime);
  const inBed = n.bedTime && n.wakeTime ? span(n.bedTime, n.wakeTime) : null;
  return {
    latencyMin: latency,
    asleepTime: asleep,
    totalSleepMin: total,
    inBedMin: inBed,
    efficiency: total != null && inBed ? Math.min(1, total / inBed) : null,
  };
}

/** Contexte de la journée qui précède une nuit. */
export function nightContext(night, entries) {
  const D = night.date;
  const next = addDays(D, 1);
  const wake = hm(night.wakeTime) ?? 6 * 60;
  const bed = hm(night.bedTime);
  const dayList = entries.filter((e) => e.at.slice(0, 10) === D);
  const evening = entries.filter((e) => {
    const d = e.at.slice(0, 10);
    const m = minutesOfDay(e.at);
    return (d === D && m >= EVENING_START_MIN) || (d === next && m < wake);
  });
  const nightCravings = entries.filter((e) => {
    if (!isCraving(e)) return false;
    const d = e.at.slice(0, 10);
    const m = minutesOfDay(e.at);
    if (d === next) return m < wake;
    if (d === D) return bed != null && bed >= 12 * 60 ? m >= bed : false;
    return false;
  });
  const cons = (l) => l.filter(isConsumption);
  return {
    day: {
      count: cons(dayList).length,
      tobacco: sum(cons(dayList).map((e) => e.tobacco?.grams)),
      cbd: sum(cons(dayList).filter((e) => (e.cbd?.unit || 'g') === 'g').map((e) => e.cbd?.amount)),
      cravings: dayList.filter(isCraving).length,
      resisted: dayList.filter((e) => isCraving(e) && e.outcome !== 'consumed').length,
    },
    evening: {
      count: cons(evening).length,
      tobacco: sum(cons(evening).map((e) => e.tobacco?.grams)),
      cbd: sum(cons(evening).filter((e) => (e.cbd?.unit || 'g') === 'g').map((e) => e.cbd?.amount)),
      cravings: evening.filter(isCraving).length,
      list: evening,
    },
    nightCravings: nightCravings.length,
  };
}

export function sleepStats(nights, range) {
  const list = nights.filter((n) => n.date >= range.start && n.date <= range.end);
  const computed = list.map((n) => ({ n, c: computeNight(n) }));
  return {
    count: list.length,
    days: daysBetween(range.start, range.end).length,
    quality: mean(list.map((n) => n.quality)),
    latency: mean(computed.map((x) => x.c.latencyMin)),
    total: mean(computed.map((x) => x.c.totalSleepMin)),
    awakenings: mean(list.map((n) => n.awakenings)),
    stress: mean(list.map((n) => n.stress)),
    energy: mean(list.map((n) => n.energy)),
  };
}

/** Coefficient de corrélation de Pearson. */
export function pearson(xs, ys) {
  const pts = [];
  for (let i = 0; i < xs.length; i++) if (isNum(xs[i]) && isNum(ys[i])) pts.push([xs[i], ys[i]]);
  const n = pts.length;
  if (n < 3) return { r: null, n };
  const mx = pts.reduce((a, p) => a + p[0], 0) / n;
  const my = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  if (sxx === 0 || syy === 0) return { r: null, n };
  return { r: sxy / Math.sqrt(sxx * syy), n };
}

export const MIN_CORRELATION_N = 7;

/** Formulation prudente d'une corrélation. */
export function describeCorrelation({ r, n }, xLabel, yLabel) {
  if (r == null || n < MIN_CORRELATION_N) {
    return `Pas assez de nuits renseignées pour observer une tendance (${n} sur ${MIN_CORRELATION_N} minimum).`;
  }
  const a = Math.abs(r);
  const strength = a < 0.2 ? 'aucun lien net' : a < 0.4 ? 'un lien faible' : a < 0.6 ? 'un lien modéré' : 'un lien marqué';
  if (a < 0.2) return `Sur ${n} nuits, ${strength} n'apparaît entre ${xLabel} et ${yLabel}.`;
  const dir = r > 0 ? 'ont tendance à aller dans le même sens' : 'ont tendance à évoluer en sens inverse';
  return `Sur ${n} nuits, ${xLabel} et ${yLabel} ${dir} (${strength}, r = ${r.toFixed(2).replace('.', ',')}). Il s'agit d'une corrélation observée, pas d'une relation de cause à effet.`;
}

/** Points (x, y) pour les nuages de points de comparaison. */
export function sleepPairs(nights, entries, range, xKey, yKey) {
  const pts = [];
  for (const n of nights) {
    if (n.date < range.start || n.date > range.end) continue;
    const ctx = nightContext(n, entries);
    const c = computeNight(n);
    const pick = (k) => {
      switch (k) {
        case 'dayCbd': return ctx.day.cbd;
        case 'dayTobacco': return ctx.day.tobacco;
        case 'eveningCbd': return ctx.evening.cbd;
        case 'eveningTobacco': return ctx.evening.tobacco;
        case 'eveningCount': return ctx.evening.count;
        case 'nightCravings': return ctx.nightCravings;
        case 'quality': return n.quality;
        case 'latency': return c.latencyMin;
        case 'total': return c.totalSleepMin != null ? c.totalSleepMin / 60 : null;
        default: return null;
      }
    };
    const x = pick(xKey); const y = pick(yKey);
    if (isNum(x) && isNum(y)) pts.push({ x, y, date: n.date });
  }
  return pts;
}

/** Signale une difficulté importante : on suggère d'en parler à un professionnel. */
export function sleepConcern(nights, today) {
  const recent = nights.filter((n) => n.date >= addDays(today, -13) && n.date <= today);
  if (recent.length < 5) return null;
  const lat = mean(recent.map((n) => computeNight(n).latencyMin)).value;
  const tot = mean(recent.map((n) => computeNight(n).totalSleepMin)).value;
  const q = mean(recent.map((n) => n.quality)).value;
  if ((lat != null && lat >= 60) || (tot != null && tot < 300) || (q != null && q <= 1.8)) {
    return 'Tes dernières nuits semblent difficiles. Si cela dure ou te pèse, en parler à un médecin ou à un professionnel du sommeil peut vraiment aider.';
  }
  return null;
}
