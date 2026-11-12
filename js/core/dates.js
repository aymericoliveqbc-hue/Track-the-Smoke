// Gestion des dates.
//
// Les horodatages des événements sont stockés en « heure murale locale »
// au format "YYYY-MM-DDTHH:mm" accompagnés du décalage horaire au moment de la
// saisie (tzOffset, en minutes, comme Date#getTimezoneOffset). Ainsi une
// consommation enregistrée à 23:40 reste attachée à la bonne journée même si
// l'utilisateur voyage ou si l'heure d'été change ensuite.
//
// Les calculs sur les jours se font exclusivement sur des clés "YYYY-MM-DD"
// manipulées en UTC pour éviter tout décalage lié à l'heure d'été.

export const pad = (n) => String(n).padStart(2, '0');

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function timeKey(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function nowLocal(d = new Date()) {
  return `${dayKey(d)}T${timeKey(d)}`;
}

export function isDayKey(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUTC(s));
}

export function isLocalDateTime(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s);
}

export function isTime(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function toUTC(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(key, n) {
  return fromUTC(toUTC(key) + n * 86400000);
}

/** Nombre de jours de a vers b (b - a). */
export function diffDays(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

/** Liste inclusive des jours entre start et end. */
export function daysBetween(start, end) {
  const out = [];
  if (!start || !end || start > end) return out;
  for (let k = start; k <= end; k = addDays(k, 1)) out.push(k);
  return out;
}

/** Jour de la semaine, 0 = lundi … 6 = dimanche. */
export function weekday(key) {
  return (new Date(toUTC(key)).getUTCDay() + 6) % 7;
}

export function startOfWeek(key) {
  return addDays(key, -weekday(key));
}

export function startOfMonth(key) {
  return key.slice(0, 8) + '01';
}

export function endOfMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return fromUTC(Date.UTC(y, m, 0));
}

export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  return fromUTC(Date.UTC(y, m - 1 + n, 1));
}

export function dayOf(at) {
  return at.slice(0, 10);
}

export function hourOf(at) {
  return Number(at.slice(11, 13));
}

export function minutesOfDay(at) {
  return Number(at.slice(11, 13)) * 60 + Number(at.slice(14, 16));
}

/** "HH:mm" -> minutes depuis minuit. */
export function hm(hhmm) {
  if (!isTime(hhmm)) return null;
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/**
 * Minutes écoulées depuis midi (12:00) — utilisé pour les nuits qui
 * traversent minuit : 22:30 -> 630, 01:00 -> 780, 07:00 -> 1140.
 */
export function minutesFromNoon(hhmm) {
  const m = hm(hhmm);
  if (m == null) return null;
  return (m - 720 + 1440) % 1440;
}

/** Période de la journée. */
export function dayPart(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}

export const DAY_PARTS = [
  { id: 'morning', label: 'Matin', range: '5 h – 12 h' },
  { id: 'afternoon', label: 'Après-midi', range: '12 h – 18 h' },
  { id: 'evening', label: 'Soirée', range: '18 h – 23 h' },
  { id: 'night', label: 'Nuit', range: '23 h – 5 h' },
];

export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const WEEKDAYS_LETTER = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export const PERIODS = [
  { id: 'today', label: "Aujourd'hui", short: 'Jour' },
  { id: '7d', label: '7 derniers jours', short: '7 j' },
  { id: '30d', label: '30 derniers jours', short: '30 j' },
  { id: 'month', label: 'Ce mois', short: 'Mois' },
  { id: 'year', label: 'Année', short: 'Année' },
];

/** Plage {start, end, days} pour un identifiant de période. */
export function periodRange(id, today = dayKey()) {
  let start;
  switch (id) {
    case 'today': start = today; break;
    case '7d': start = addDays(today, -6); break;
    case '30d': start = addDays(today, -29); break;
    case '90d': start = addDays(today, -89); break;
    case 'month': start = startOfMonth(today); break;
    case 'year': start = today.slice(0, 4) + '-01-01'; break;
    default: start = today;
  }
  return { id, start, end: today, days: diffDays(start, today) + 1 };
}

/** Période immédiatement précédente de même longueur. */
export function previousRange(range) {
  const len = diffDays(range.start, range.end) + 1;
  const end = addDays(range.start, -1);
  return { start: addDays(end, -(len - 1)), end, days: len };
}

export function inRange(day, range) {
  return day >= range.start && day <= range.end;
}

/** Durée formatée « 4 h 05 » / « 35 min ». */
export function formatDuration(min) {
  if (min == null || !Number.isFinite(min)) return '—';
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${pad(r)}` : `${h} h`;
}

export function formatDayLong(key) {
  const [y, m, d] = key.split('-').map(Number);
  const wd = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ' ' + y : ''}`;
}

export function formatDayShort(key) {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

export function relativeDay(key, today = dayKey()) {
  const d = diffDays(key, today);
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return 'Hier';
  return formatDayLong(key);
}

/** Durée écoulée depuis un horodatage local jusqu'à maintenant, en minutes. */
export function minutesSince(at, now = nowLocal()) {
  const days = diffDays(at.slice(0, 10), now.slice(0, 10));
  return days * 1440 + minutesOfDay(now) - minutesOfDay(at);
}

export function formatElapsed(min) {
  if (min == null) return '—';
  if (min < 1) return "moins d'1 min";
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 1440) return formatDuration(min);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  return h ? `${d} j ${h} h` : `${d} j`;
}
