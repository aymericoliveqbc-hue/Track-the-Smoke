// Observations automatiques, formulées avec prudence.
// Chaque règle exige un minimum de données ; sinon elle se tait.

import { addDays } from '../core/dates.js';
import { fmtGrams, fmtNum } from '../core/format.js';
import { coverage, entriesIn, isConsumption, isCraving, byWeekday, summarize, mean } from './stats.js';
import { computeNight } from './sleep.js';
import { TRIGGERS, labelOf } from './models.js';

const WD_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** Fenêtre de 4 h (pouvant traverser minuit) concentrant le plus d'événements. */
export function peakWindow(list, width = 4) {
  const hours = Array(24).fill(0);
  for (const e of list) hours[Number(e.at.slice(11, 13))] += 1;
  let best = { start: 0, count: -1 };
  for (let s = 0; s < 24; s++) {
    let c = 0;
    for (let k = 0; k < width; k++) c += hours[(s + k) % 24];
    if (c > best.count) best = { start: s, count: c };
  }
  const end = (best.start + width) % 24;
  return { ...best, end, share: list.length ? best.count / list.length : 0 };
}

const hLabel = (h) => (h === 0 ? 'minuit' : `${h} h`);

export function generateInsights(state, ctx) {
  const out = [];
  const { entries, nights } = state;
  const today = ctx.today;
  const r14 = { start: addDays(today, -13), end: today };
  const cov14 = coverage(r14, ctx.trackingStart, today);
  const recent = entriesIn(entries, cov14);

  for (const [kind, label] of [['cbd', 'de CBD'], ['tobacco', 'de tabac']]) {
    const list = recent.filter((e) => isConsumption(e) && (kind === 'cbd' ? e.cbd : e.tobacco));
    if (list.length >= 8 && cov14?.days >= 7) {
      const p = peakWindow(list);
      if (p.share >= 0.5) {
        out.push({ id: `peak-${kind}`, tone: 'neutral', text: `Sur les ${cov14.days} derniers jours, tes consommations ${label} sont principalement enregistrées entre ${hLabel(p.start)} et ${hLabel(p.end)} (${p.count} sur ${list.length}).` });
      }
    }
  }

  const thisWeek = { start: addDays(today, -6), end: today };
  const lastWeek = { start: addDays(today, -13), end: addDays(today, -7) };
  const a = summarize(entries, thisWeek, ctx);
  const b = summarize(entries, lastWeek, ctx);
  if (a.coverage?.days === 7 && b.coverage?.days === 7) {
    if (a.cravings.resisted !== b.cravings.resisted && a.cravings.resisted + b.cravings.resisted >= 4) {
      out.push({
        id: 'resisted-trend', tone: a.cravings.resisted > b.cravings.resisted ? 'positive' : 'neutral',
        text: a.cravings.resisted > b.cravings.resisted
          ? `Tu as enregistré davantage d'envies résistées ces 7 derniers jours (${a.cravings.resisted}) que les 7 jours précédents (${b.cravings.resisted}).`
          : `Tu as enregistré ${a.cravings.resisted} envies résistées ces 7 derniers jours, contre ${b.cravings.resisted} la semaine précédente.`,
      });
    }
    if (a.tobacco.missing + b.tobacco.missing === 0 && b.tobacco.total > 0.2) {
      const d = a.tobacco.total - b.tobacco.total;
      if (Math.abs(d) / b.tobacco.total >= 0.1) {
        out.push({ id: 'tobacco-trend', tone: d < 0 ? 'positive' : 'neutral', text: `Tabac : ${fmtGrams(a.tobacco.total)} ces 7 derniers jours, contre ${fmtGrams(b.tobacco.total)} la semaine précédente.` });
      }
    }
    if (a.cbd.missing + b.cbd.missing === 0 && b.cbd.total > 0.2) {
      const d = a.cbd.total - b.cbd.total;
      if (Math.abs(d) / b.cbd.total >= 0.1) {
        out.push({ id: 'cbd-trend', tone: d < 0 ? 'positive' : 'neutral', text: `CBD : ${fmtGrams(a.cbd.total)} ces 7 derniers jours, contre ${fmtGrams(b.cbd.total)} la semaine précédente.` });
      }
    }
  }

  const cravings = recent.filter(isCraving);
  if (cravings.length >= 5) {
    const counts = new Map();
    for (const c of cravings) if (c.trigger) counts.set(c.trigger, (counts.get(c.trigger) || 0) + 1);
    const top = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
    if (top && top[1] >= 3) {
      out.push({ id: 'trigger', tone: 'neutral', text: `Le déclencheur le plus souvent noté récemment est « ${labelOf(TRIGGERS, top[0]).toLowerCase()} » (${top[1]} envies sur ${cravings.length}).` });
    }
    const p = peakWindow(cravings);
    if (p.share >= 0.5) out.push({ id: 'craving-peak', tone: 'neutral', text: `Tes envies sont surtout notées entre ${hLabel(p.start)} et ${hLabel(p.end)}.` });
  }

  const n7 = nights.filter((n) => n.date >= addDays(today, -7) && n.date <= today);
  const n14 = nights.filter((n) => n.date >= addDays(today, -14) && n.date < addDays(today, -7));
  const l7 = mean(n7.map((n) => computeNight(n).latencyMin));
  const l14 = mean(n14.map((n) => computeNight(n).latencyMin));
  if (l7.n >= 4 && l14.n >= 4 && Math.abs(l7.value - l14.value) >= 10) {
    out.push({
      id: 'latency', tone: l7.value < l14.value ? 'positive' : 'neutral',
      text: `Ton temps moyen d'endormissement ${l7.value < l14.value ? 'a diminué' : 'a augmenté'} sur la dernière semaine observée (${fmtNum(l7.value, 0)} min contre ${fmtNum(l14.value, 0)} min).`,
    });
  }

  const r30 = { start: addDays(today, -29), end: today };
  const cov30 = coverage(r30, ctx.trackingStart, today);
  if (cov30 && cov30.days >= 21) {
    const cons = entriesIn(entries, cov30).filter(isConsumption);
    if (cons.length >= 20) {
      const wd = byWeekday(cons, cov30);
      let min = 0;
      wd.forEach((v, i) => { if (v != null && v < wd[min]) min = i; });
      out.push({ id: 'low-day', tone: 'neutral', text: `Le ${WD_LONG[min]} est en moyenne la journée où tu consommes le moins (${fmtNum(wd[min], 1)} consommations).` });
      const firsts = new Map();
      for (const e of cons) {
        const d = e.at.slice(0, 10); const m = Number(e.at.slice(11, 13)) * 60 + Number(e.at.slice(14, 16));
        if (m < 240) continue;
        if (!firsts.has(d) || m < firsts.get(d)) firsts.set(d, m);
      }
      const f = mean([...firsts.values()]);
      if (f.n >= 10) {
        const h = Math.floor(f.value / 60); const mm = Math.round(f.value % 60);
        out.push({ id: 'first', tone: 'neutral', text: `Ta première consommation de la journée a lieu en moyenne vers ${h} h ${String(mm).padStart(2, '0')} (${f.n} jours observés).` });
      }
    }
  }
  return out;
}
